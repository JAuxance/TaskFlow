import { beforeEach, describe, expect, it, vi } from 'vitest';

type Client = typeof import('./client');
type Call = { url: string; init: RequestInit & { headers: Headers } };
type Respond = (url: string, init: Call['init']) => Response | Promise<Response>;

let api: Client;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const isTokenRequest = (url: string) => url.endsWith('/api/auth/csrf');
const tokenOf = (call: Call) => call.init.headers.get('X-CSRF-Token');

/** Replace fetch and record every request the client sends. */
function stubFetch(respond: Respond): Call[] {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', async (url: string, init: Call['init']) => {
        calls.push({ url, init });
        return respond(url, init);
    });
    return calls;
}

beforeEach(async () => {
    // The client keeps the token in the module: start each test without one.
    vi.resetModules();
    vi.unstubAllGlobals();
    api = await import('./client');
});

describe('requests', () => {
    it('reads without asking for a CSRF token', async () => {
        const calls = stubFetch(() => json([]));
        const result = await api.apiRequest('/api/workspaces');

        expect(result).toEqual({ ok: true, status: 200, data: [] });
        expect(calls).toHaveLength(1);
        expect(calls[0]?.init.credentials).toBe('include');
        expect(calls[0]?.init.headers.has('X-CSRF-Token')).toBe(false);
    });

    it('sends the token with a JSON mutation and keeps its body and content type', async () => {
        const calls = stubFetch(url => json(isTokenRequest(url) ? { csrf_token: 'session-token' } : { id: 1 }));
        const result = await api.apiRequest('/api/projects/1', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"name":"test"}',
        });

        expect(result.ok).toBe(true);
        expect(calls[0]?.init.cache).toBe('no-store');
        expect(tokenOf(calls[1]!)).toBe('session-token');
        expect(calls[1]?.init.headers.get('Content-Type')).toBe('application/json');
        expect(calls[1]?.init.body).toBe('{"name":"test"}');
    });

    it('sends FormData untouched, without an imposed content type', async () => {
        const body = new FormData();
        body.append('avatar', new Blob(['local image'], { type: 'image/png' }), 'avatar.png');
        const calls = stubFetch(url => json(isTokenRequest(url) ? { csrf_token: 'upload-token' } : { ok: true }));
        await api.apiRequest('/api/users/me/avatar', { method: 'POST', body });

        expect(calls[1]?.init.body).toBe(body);
        expect(calls[1]?.init.headers.has('Content-Type')).toBe(false);
        expect(tokenOf(calls[1]!)).toBe('upload-token');
    });
});

describe('CSRF token', () => {
    it('is requested once for concurrent saves', async () => {
        let release = () => {};
        const gate = new Promise<void>(resolve => { release = resolve; });
        const calls = stubFetch(async url => {
            if (!isTokenRequest(url)) return json({ ok: true });
            await gate;
            return json({ csrf_token: 'shared-token' });
        });
        const saves = [
            api.apiRequest('/api/tasks/1', { method: 'PATCH' }),
            api.apiRequest('/api/tasks/2', { method: 'PATCH' }),
        ];
        await vi.waitFor(() => expect(calls.filter(call => isTokenRequest(call.url))).toHaveLength(1));
        release();
        await Promise.all(saves);

        expect(calls.filter(call => isTokenRequest(call.url))).toHaveLength(1);
        expect(calls.filter(call => !isTokenRequest(call.url)).map(tokenOf)).toEqual(['shared-token', 'shared-token']);
    });

    it('is kept for the following mutations', async () => {
        const calls = stubFetch(url => json(isTokenRequest(url) ? { csrf_token: 'kept-token' } : { ok: true }));
        await api.apiRequest('/api/tasks/1', { method: 'PATCH' });
        await api.apiRequest('/api/tasks/1', { method: 'DELETE' });

        expect(calls.map(call => call.url)).toEqual(['/api/auth/csrf', '/api/tasks/1', '/api/tasks/1']);
        expect(tokenOf(calls[2]!)).toBe('kept-token');
    });

    it('is renewed once when the server refuses it, then the mutation is sent again', async () => {
        let current = 'anonymous';
        const calls = stubFetch((url, init) => {
            if (isTokenRequest(url)) return json({ csrf_token: current });
            return init.headers.get('X-CSRF-Token') === current
                ? json({ id: 7 })
                : json({ error: 'Your security token has expired. Please try again.', code: 'csrf_failed' }, 403);
        });
        await api.apiRequest('/api/auth/login', { method: 'POST' });
        current = 'authenticated'; // the server rotates the token when the session changes
        const result = await api.apiRequest('/api/tasks/1', { method: 'DELETE' });

        expect(result).toEqual({ ok: true, status: 200, data: { id: 7 } });
        expect(calls.filter(call => call.url === '/api/tasks/1').map(tokenOf)).toEqual(['anonymous', 'authenticated']);
    });

    it('is not renewed in a loop when the server keeps refusing', async () => {
        const calls = stubFetch(url => isTokenRequest(url)
            ? json({ csrf_token: 'refused' })
            : json({ error: 'Your security token has expired. Please try again.', code: 'csrf_failed' }, 403));
        const result = await api.apiRequest('/api/tasks/1', { method: 'DELETE' });

        expect(result.status).toBe(403);
        expect(calls.filter(call => call.url === '/api/tasks/1')).toHaveLength(2);
    });

    it('is requested again after resetCsrfToken', async () => {
        let current = 'before-login';
        const calls = stubFetch(url => json(isTokenRequest(url) ? { csrf_token: current } : { ok: true }));
        await api.apiRequest('/api/auth/login', { method: 'POST' });
        current = 'after-login';
        api.resetCsrfToken();
        await api.apiRequest('/api/tasks/1', { method: 'PATCH' });

        expect(calls.filter(call => !isTokenRequest(call.url)).map(tokenOf)).toEqual(['before-login', 'after-login']);
    });

    it('blocks the mutation when it cannot be obtained', async () => {
        const calls = stubFetch(() => json({ error: 'temporarily unavailable' }, 503));
        const result = await api.apiRequest('/api/tasks/1', { method: 'DELETE' });

        expect(result).toEqual({ ok: false, status: 503, data: { error: 'temporarily unavailable' } });
        expect(calls.map(call => call.url)).toEqual(['/api/auth/csrf']);
    });

    it('blocks the mutation when the answer is malformed', async () => {
        const calls = stubFetch(() => json({ csrf_token: null }));
        const result = await api.apiRequest('/api/tasks/1', { method: 'DELETE' });

        expect(result.ok).toBe(false);
        expect(calls).toHaveLength(1);
    });
});

describe('errors', () => {
    it('keeps the message and the code sent by the server', async () => {
        stubFetch(() => json({ error: 'transfer ownership first', code: 'shared_workspaces' }, 409));
        expect(await api.apiRequest('/api/users/me/deletion-preview')).toEqual({
            ok: false, status: 409, data: { error: 'transfer ownership first', code: 'shared_workspaces' },
        });
    });

    it.each([
        [413, 'This image is too large. Choose a smaller file (under 5 MB).'],
        [502, 'The server returned an unexpected response. Please try again.'],
    ])('explains a %i answer that is not JSON', async (status, message) => {
        stubFetch(() => new Response('<html>error</html>', { status }));
        expect(await api.apiRequest('/api/workspaces')).toEqual({ ok: false, status, data: { error: message } });
    });

    it.each([
        [429, 'Too many requests. Please wait a moment and try again.'],
        [500, 'This action could not be completed. Please try again.'],
    ])('gives a default message to a %i answer without one', async (status, message) => {
        stubFetch(() => json({}, status));
        expect(await api.apiRequest('/api/workspaces')).toEqual({ ok: false, status, data: { error: message } });
    });

    it('reports an unreachable server with status 0', async () => {
        stubFetch(() => { throw new TypeError('fetch failed'); });
        expect(await api.apiRequest('/api/workspaces')).toEqual({
            ok: false, status: 0, data: { error: 'Unable to reach TaskFlow. Check your connection and try again.' },
        });
    });

    it('gives up on a request that takes too long', async () => {
        stubFetch((_url, init) => new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }));
        const result = await api.apiRequest('/api/workspaces', { timeoutMs: 20 });

        expect(result).toEqual({
            ok: false, status: 0, data: { error: 'TaskFlow took too long to respond. Check your connection and try again.' },
        });
    });
});

describe('expired session', () => {
    it('calls the handler on a 401, unless the caller expects that answer', async () => {
        const handler = vi.fn();
        api.setUnauthorizedHandler(handler);
        stubFetch(() => json({ error: 'session expired' }, 401));

        await api.apiRequest('/api/auth/me', { allowUnauthorized: true });
        expect(handler).not.toHaveBeenCalled();
        const result = await api.apiRequest('/api/workspaces');
        expect(result.status).toBe(401);
        expect(handler).toHaveBeenCalledTimes(1);
    });
});

describe('collections', () => {
    it('reads every page until a short one', async () => {
        const calls = stubFetch(url => json(url.endsWith('page=1')
            ? Array.from({ length: 100 }, (_item, index) => index) : [100, 101]));
        const result = await api.apiCollection<number>('/api/workspaces');

        expect(result.ok && result.data).toHaveLength(102);
        expect(calls.map(call => call.url)).toEqual(['/api/workspaces?limit=100&page=1', '/api/workspaces?limit=100&page=2']);
    });

    it('refuses an answer that is not a list', async () => {
        stubFetch(() => json({ unexpected: true }));
        expect(await api.apiCollection('/api/workspaces')).toEqual({
            ok: false, status: 200, data: { error: 'The server returned an unexpected list. Please try again.' },
        });
    });

    it('stops at the first failing page', async () => {
        stubFetch(() => json({ error: 'resource not found' }, 404));
        expect(await api.apiCollection('/api/workspaces/9/projects')).toEqual({
            ok: false, status: 404, data: { error: 'resource not found' },
        });
    });
});
