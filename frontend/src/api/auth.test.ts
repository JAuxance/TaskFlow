import { beforeEach, expect, it, vi } from 'vitest';

type Call = { url: string; init: RequestInit & { headers: Headers } };

let auth: typeof import('./auth');
let client: typeof import('./client');
let calls: Call[];
let token: string;
let answer: () => Response;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const sent = () => calls.filter(call => !call.url.endsWith('/csrf'));

beforeEach(async () => {
    vi.resetModules();
    calls = [];
    token = 'anonymous';
    answer = () => json({ id: 1, username: 'alice', email: 'alice@example.com' });
    vi.stubGlobal('fetch', async (url: string, init: Call['init']) => {
        calls.push({ url, init });
        return url.endsWith('/csrf') ? json({ csrf_token: token }) : answer();
    });
    client = await import('./client');
    auth = await import('./auth');
});

it('signs in with the credentials as JSON', async () => {
    const result = await auth.login('alice@example.com', 'secret-password');

    expect(result.ok).toBe(true);
    expect(sent()[0]?.url).toBe('/api/auth/login');
    expect(sent()[0]?.init.method).toBe('POST');
    expect(sent()[0]?.init.body).toBe('{"email":"alice@example.com","password":"secret-password"}');
    expect(sent()[0]?.init.headers.get('Content-Type')).toBe('application/json');
});

it('registers with username, email and password', async () => {
    answer = () => json({ id: 1, username: 'alice', email: 'alice@example.com', created_at: '2026-10-12T09:00:00' }, 201);
    const result = await auth.register('alice', 'alice@example.com', 'secret-password');

    expect(result.ok).toBe(true);
    expect(sent()[0]?.url).toBe('/api/users');
    expect(sent()[0]?.init.body).toBe('{"username":"alice","email":"alice@example.com","password":"secret-password"}');
});

it.each(['login', 'register', 'logout'] as const)('asks for a new CSRF token after a successful %s', async action => {
    if (action === 'login') await auth.login('alice@example.com', 'secret-password');
    else if (action === 'register') await auth.register('alice', 'alice@example.com', 'secret-password');
    else await auth.logout();
    token = 'after-session-change';
    await client.apiRequest('/api/workspaces', { method: 'POST' });

    expect(sent().map(call => call.init.headers.get('X-CSRF-Token'))).toEqual(['anonymous', 'after-session-change']);
});

it('keeps the token when sign-in is refused', async () => {
    answer = () => json({ error: 'invalid email or password' }, 401);
    const result = await auth.login('alice@example.com', 'wrong');
    await auth.login('alice@example.com', 'wrong again');

    expect(result).toEqual({ ok: false, status: 401, data: { error: 'invalid email or password' } });
    expect(calls.filter(call => call.url.endsWith('/csrf'))).toHaveLength(1);
});

it('does not report wrong credentials or a closed session as an expired session', async () => {
    const expired = vi.fn();
    client.setUnauthorizedHandler(expired);
    answer = () => json({ error: 'invalid email or password' }, 401);
    await auth.login('alice@example.com', 'wrong');
    await auth.logout();

    expect(expired).not.toHaveBeenCalled();
});
