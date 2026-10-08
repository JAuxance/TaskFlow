"""Check the proposed Nginx files in a disposable local Docker container."""
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import time

import requests

ROOT = Path(__file__).resolve().parents[1]
NAME = "taskflow-nginx-security-test"


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
        "-v", f"{ROOT / 'frontend'}:/var/www/taskflow:ro",
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
        script = session.get("https://127.0.0.1:54443/js/api.js", headers=headers, timeout=3)
        assert script.status_code == 200
        assert "createObjectURL" not in script.text
        assert "data:${contentType};base64," in script.text
        for path, expected in (("/confidentialite/", "Privacy"), ("/cookies/", "Cookies"),
                               ("/vendor/socket.io-4.8.1/socket.io.min.js", "Socket.IO")):
            page = session.get("https://127.0.0.1:54443" + path, headers=headers, timeout=3)
            assert page.status_code == 200 and expected in page.text
        redirect = session.get("http://127.0.0.1:54080/project?a=1", headers=headers,
                               allow_redirects=False, timeout=3)
        assert redirect.status_code == 301
        assert redirect.headers["Location"] == "https://taskflow.auxance.dev/project?a=1"
        print(json.dumps({"nginx_syntax": "passed", "spoofed_ip_headers": "rejected",
            "upstream_https": "passed", "private_cache": "no-store",
            "frontend_csp": "passed", "http_redirect": "passed",
            "public_pages_and_local_socketio": "passed"}, indent=2))
    finally:
        run("docker", "stop", NAME)
