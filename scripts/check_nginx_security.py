"""Check the proposed Nginx files in a disposable local Docker container.

The site root is the production build of the frontend: run
`npm run build --prefix frontend` first.
"""
import json
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory
import time

import requests

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "frontend/dist"
NAME = "taskflow-nginx-security-test"

if not (SITE / "index.html").is_file():
    raise SystemExit("Build the frontend first: npm run build --prefix frontend")


def run(*args, quiet=False):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL if quiet else None)


cache = ROOT / ".pytest_cache"
cache.mkdir(exist_ok=True)
with TemporaryDirectory(prefix="taskflow-nginx-", dir=cache) as folder:
    temp = Path(folder)
    run("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
        "-keyout", str(temp / "privkey.pem"), "-out", str(temp / "fullchain.pem"),
        "-subj", "/CN=taskflow.auxance.dev",
        "-addext", "subjectAltName=IP:127.0.0.1,DNS:taskflow.auxance.dev", quiet=True)
    # The test upstream reports exactly what Nginx forwarded. It is not published.
    (temp / "upstream.conf").write_text('''server {
        listen 127.0.0.1:5000;
        default_type application/json;
        add_header Cache-Control "no-store, private" always;
        return 200 '{"ip":"$http_x_forwarded_for","cf":"$http_cf_connecting_ip","proto":"$http_x_forwarded_proto","host":"$host"}';
    }''')
    mounts = [
        "-v", f"{ROOT / 'deploy/nginx'}:/etc/nginx/taskflow:ro",
        "-v", f"{ROOT / 'deploy/nginx/taskflow.auxance.dev.conf'}:/etc/nginx/conf.d/default.conf:ro",
        "-v", f"{temp / 'upstream.conf'}:/etc/nginx/conf.d/test-upstream.conf:ro",
        "-v", f"{temp}:/etc/letsencrypt/live/taskflow.auxance.dev:ro",
        "-v", f"{SITE}:/var/www/taskflow:ro",
    ]
    run("docker", "run", "--rm", *mounts, "nginx:stable-alpine", "nginx", "-t")
    run("docker", "run", "--rm", "-d", "--name", NAME,
        "-p", "127.0.0.1:54443:443", "-p", "127.0.0.1:54080:80", *mounts, "nginx:stable-alpine")
    try:
        session = requests.Session()
        session.trust_env = False
        session.verify = str(temp / "fullchain.pem")
        headers = {"Host": "taskflow.auxance.dev", "X-Forwarded-For": "198.51.100.77",
                   "CF-Connecting-IP": "203.0.113.88", "X-Forwarded-Proto": "http"}
        for attempt in range(30):
            try:
                response = session.get("https://127.0.0.1:54443/api/ip", headers=headers, timeout=2)
                break
            except requests.ConnectionError:
                time.sleep(0.1)
        else:
            raise RuntimeError("The local Nginx test container did not start")
        response.raise_for_status()
        received = response.json()
        assert received["ip"] not in ("198.51.100.77", "203.0.113.88", "")
        assert received["cf"] == ""
        assert received["proto"] == "https"
        assert response.headers["Cache-Control"] == "no-store, private"
        html = session.get("https://127.0.0.1:54443/", headers=headers, timeout=3)
        assert html.status_code == 200
        assert "theme-init.js" in html.text
        assert "<script>" not in html.text
        assert "'unsafe-inline'" not in html.headers["Content-Security-Policy"]
        assert html.headers["X-Frame-Options"] == "DENY"
        assert "cdn.socket.io" not in html.text
        policy = html.headers["Content-Security-Policy"]
        assert "cdn.socket.io" not in policy
        assert "img-src 'self' data:" in policy
        assert "blob:" not in policy
        assert "script-src 'self'" in policy
        # The build references its script and stylesheet as files, never inline.
        assert "<style" not in html.text and 'style="' not in html.text
        bundle = re.search(r'<script type="module" crossorigin src="(/assets/[^"]+\.js)">', html.text).group(1)
        script = session.get("https://127.0.0.1:54443" + bundle, headers=headers, timeout=3)
        assert script.status_code == 200 and "javascript" in script.headers["Content-Type"]
        assert "eval(" not in script.text and "new Function(" not in script.text
        for path in ("/theme-init.js", "/assets/icons/folder.svg"):
            assert session.get("https://127.0.0.1:54443" + path, headers=headers, timeout=3).status_code == 200
        # Every screen has an address: Nginx hands them all to the application.
        for path in ("/login", "/workspaces", "/workspaces/12/members", "/tasks/3", "/confidentialite/", "/cookies/"):
            page = session.get("https://127.0.0.1:54443" + path, headers=headers, timeout=3)
            assert page.status_code == 200 and page.text == html.text
            assert page.headers["Content-Security-Policy"] == policy
        redirect = session.get("http://127.0.0.1:54080/project?a=1", headers=headers,
                               allow_redirects=False, timeout=3)
        assert redirect.status_code == 301
        assert redirect.headers["Location"] == "https://taskflow.auxance.dev/project?a=1"
        print(json.dumps({"nginx_syntax": "passed", "spoofed_ip_headers": "rejected",
            "upstream_https": "passed", "private_cache": "no-store",
            "frontend_csp": "passed", "http_redirect": "passed",
            "built_assets_and_screen_addresses": "passed"}, indent=2))
    finally:
        run("docker", "stop", NAME)
