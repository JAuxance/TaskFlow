import { beforeEach, expect, it, vi } from 'vitest';

type Call = { url: string; init: RequestInit & { headers: Headers } };

let profile: typeof import('./profile');
let client: typeof import('./client');
let calls: Call[];
let answer: () => Response;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const sent = () => calls.filter(call => !call.url.endsWith('/csrf'));

beforeEach(async () => {
    vi.resetModules();
    calls = [];
    answer = () => json({ id: 1, username: 'alice', email: 'alice@example.com', first_name: 'Alice', avatar_url: null });
    vi.stubGlobal('fetch', async (url: string, init: Call['init']) => {
        calls.push({ url, init });
        return url.endsWith('/csrf') ? json({ csrf_token: 'token' }) : answer();
    });
    client = await import('./client');
    profile = await import('./profile');
});

it('sends the first name as JSON, an empty one included', async () => {
    await profile.updateFirstName('');

    expect(sent()[0]?.url).toBe('/api/users/me');
    expect(sent()[0]?.init.method).toBe('PATCH');
    expect(sent()[0]?.init.body).toBe('{"first_name":""}');
});


it('sends nothing but the password to export the data', async () => {
    answer = () => json({ format_version: 1, profile: { email: 'alice@example.com' } });
    const result = await profile.exportMyData('secret-password');

    expect(sent()[0]?.url).toBe('/api/users/me/data-export');
    expect(sent()[0]?.init.body).toBe('{"password":"secret-password"}');
    expect(result.ok && result.data.format_version).toBe(1);
});

it('deletes the account with the password and the reviewed workspaces only', async () => {
    answer = () => json({ message: 'account deleted' });
    await profile.deleteAccount('secret-password', [4, 9]);

    expect(sent()[0]?.url).toBe('/api/users/me');
    expect(sent()[0]?.init.method).toBe('DELETE');
    expect(sent()[0]?.init.body).toBe('{"password":"secret-password","confirmed_workspace_ids":[4,9]}');
});

it('lets the caller decide what a 401 means when deleting the account', async () => {
    const expired = vi.fn();
    client.setUnauthorizedHandler(expired);
    answer = () => json({ error: 'session is missing' }, 401);
    const result = await profile.deleteAccount('secret-password', []);

    expect(result.status).toBe(401);
    expect(expired).not.toHaveBeenCalled();
});
