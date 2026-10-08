import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let counter = 0;
async function loadApi(hostname = "localhost") {
    globalThis.window = { location: { hostname } };
    const source = await readFile(new URL("../js/api.js", import.meta.url), "utf8");
    return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${counter++}`);
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

test("reads do not request a CSRF token", async () => {
    const api = await loadApi();
    const calls = [];
    globalThis.fetch = async (url, options) => { calls.push({ url, options }); return json([]); };
    assert.equal((await api.apiRequest("/api/workspaces")).ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.credentials, "include");
    assert.equal(calls[0].options.headers.has("X-CSRF-Token"), false);
});

test("JSON mutation sends the token and preserves content type", async () => {
    const api = await loadApi();
    const calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return json(url.endsWith("/csrf") ? { csrf_token: "session-token" } : { id: 1 });
    };
    const result = await api.apiRequest("/api/projects/1", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"name":"test"}',
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0].options.cache, "no-store");
    assert.equal(calls[1].options.headers.get("X-CSRF-Token"), "session-token");
    assert.equal(calls[1].options.headers.get("Content-Type"), "application/json");
    assert.equal(calls[1].options.body, '{"name":"test"}');
});

test("FormData is kept intact without an imposed content type", async () => {
    const api = await loadApi();
    const body = new FormData();
    body.append("avatar", new Blob(["local image"], { type: "image/png" }), "avatar.png");
    let upload;
    globalThis.fetch = async (url, options) => {
        if (url.endsWith("/csrf")) return json({ csrf_token: "upload-token" });
        upload = options;
        return json({ ok: true });
    };
    await api.apiRequest("/api/users/me/avatar", { method: "POST", body });
    assert.equal(upload.body, body);
    assert.equal(upload.headers.has("Content-Type"), false);
    assert.equal(upload.headers.get("X-CSRF-Token"), "upload-token");
});

test("concurrent saves share their CSRF fetch", async () => {
    const api = await loadApi();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let tokenCalls = 0;
    const tokens = [];
    globalThis.fetch = async (url, options) => {
        if (url.endsWith("/csrf")) {
            tokenCalls++;
            await gate;
            return json({ csrf_token: "same-cookie-token" });
        }
        tokens.push(options.headers.get("X-CSRF-Token"));
        return json({ ok: true });
    };
    const saves = [api.apiRequest("/api/tasks/1", { method: "PATCH" }),
                   api.apiRequest("/api/tasks/2", { method: "PATCH" })];
    assert.equal(tokenCalls, 1);
    release();
    await Promise.all(saves);
    assert.deepEqual(tokens, ["same-cookie-token", "same-cookie-token"]);
});

test("next mutation refreshes the token after an authentication change", async () => {
    const api = await loadApi();
    let current = "anonymous";
    const received = [];
    globalThis.fetch = async (url, options) => {
        if (url.endsWith("/csrf")) return json({ csrf_token: current });
        received.push(options.headers.get("X-CSRF-Token"));
        current = "authenticated";
        return json({ ok: true });
    };
    await api.apiRequest("/api/auth/login", { method: "POST" });
    await api.apiRequest("/api/tasks/1", { method: "DELETE" });
    assert.deepEqual(received, ["anonymous", "authenticated"]);
});

test("failed token request prevents the mutation", async () => {
    const api = await loadApi();
    const urls = [];
    globalThis.fetch = async url => { urls.push(url); return json({ error: "temporarily unavailable" }, 503); };
    const result = await api.apiRequest("/api/tasks/1", { method: "DELETE" });
    assert.equal(result.status, 503);
    assert.equal(urls.length, 1);
    assert.ok(urls[0].endsWith("/csrf"));
});

test("malformed token response prevents the mutation", async () => {
    const api = await loadApi();
    let calls = 0;
    globalThis.fetch = async () => { calls++; return json({ csrf_token: null }); };
    assert.equal((await api.apiRequest("/api/tasks/1", { method: "DELETE" })).ok, false);
    assert.equal(calls, 1);
});

test("protected images use a data URL allowed by the delivery image policy", async () => {
    const api = await loadApi();
    const headers = await readFile(new URL("../../deploy/nginx/security-headers.conf", import.meta.url), "utf8");
    const policy = headers.match(/Content-Security-Policy "([^"]+)"/)[1];
    assert.match(policy, /img-src 'self' data:/);
    assert.doesNotMatch(policy, /blob:/);
    assert.match(policy, /script-src 'self'/);
    assert.doesNotMatch(policy, /unsafe-inline/);
    const source = await readFile(new URL("../js/api.js", import.meta.url), "utf8");
    assert.equal(source.includes("createObjectURL"), false);
    assert.match(source, /data:\$\{contentType\};base64,/);
    globalThis.fetch = async () => new Response(Uint8Array.from([1, 2, 3]), {
        status: 200, headers: { "content-type": "image/png" },
    });
    const img = { hidden: true };
    await api.showProtectedImage(img, "/static/avatars/1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png");
    assert.equal(img.hidden, false);
    assert.equal(img.src, "data:image/png;base64,AQID");
});

test("127.0.0.1 development frontend keeps the same cookie host", async () => {
    const api = await loadApi("127.0.0.1");
    assert.equal(api.API_BASE_URL, "http://127.0.0.1:5000");
});
