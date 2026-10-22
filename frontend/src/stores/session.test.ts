import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, expect, it, vi } from 'vitest';
import { setUnauthorizedHandler } from '../api/client';
import { useSessionStore } from './session';

const respond = (data: unknown, status = 200) =>
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(data), { status }));

beforeEach(() => {
    vi.unstubAllGlobals();
    setActivePinia(createPinia());
});

it('knows the signed-in user', async () => {
    const alice = { id: 1, username: 'alice', email: 'alice@example.com', first_name: null, avatar_url: null };
    respond(alice);
    const session = useSessionStore();
    expect(session.status).toBe('unknown');
    await session.load();

    expect(session.status).toBe('signed-in');
    expect(session.user).toEqual(alice);
});

it('treats a 401 as nobody signed in, not as an expired session', async () => {
    const expired = vi.fn();
    setUnauthorizedHandler(expired);
    respond({ error: 'token is missing' }, 401);
    const session = useSessionStore();
    await session.load();

    expect(session.status).toBe('signed-out');
    expect(session.user).toBeNull();
    expect(session.error).toBe('');
    expect(expired).not.toHaveBeenCalled();
});

it('keeps the server message when the profile cannot be read', async () => {
    respond({ error: 'database unavailable' }, 500);
    const session = useSessionStore();
    await session.load();

    expect(session.status).toBe('unavailable');
    expect(session.error).toBe('database unavailable');
});

it('forgets the user when the session expires', async () => {
    respond({ id: 1, username: 'alice', email: 'alice@example.com', first_name: null, avatar_url: null });
    const session = useSessionStore();
    await session.load();
    session.expire();

    expect(session.status).toBe('signed-out');
    expect(session.user).toBeNull();
});

it('asks the server only once however many screens wait for the session', async () => {
    const fetched = vi.fn(async () => new Response(JSON.stringify({ error: 'token is missing' }), { status: 401 }));
    vi.stubGlobal('fetch', fetched);
    const session = useSessionStore();
    await Promise.all([session.ensureLoaded(), session.ensureLoaded()]);
    await session.ensureLoaded();

    expect(fetched).toHaveBeenCalledTimes(1);
    expect(session.status).toBe('signed-out');
});
