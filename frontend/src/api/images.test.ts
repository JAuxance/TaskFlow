import { beforeEach, expect, it, vi } from 'vitest';

let images: typeof import('./images');
const AVATAR = '/static/avatars/7_0123456789abcdef0123456789abcdef.png';
const png = () => new Response(Uint8Array.from([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } });

beforeEach(async () => {
    // The module keeps loaded pictures: start each test with none.
    vi.resetModules();
    vi.unstubAllGlobals();
    images = await import('./images');
});

it('turns an uploaded picture into a data URL, sent with the session cookie', async () => {
    const fetched = vi.fn(async (_url: string, _init: RequestInit) => png());
    vi.stubGlobal('fetch', fetched);

    expect(await images.loadProtectedImage(AVATAR)).toBe('data:image/png;base64,AQID');
    expect(fetched).toHaveBeenCalledWith(AVATAR, { credentials: 'include', cache: 'no-store' });
});

it('asks the server once, however many times the picture is shown', async () => {
    const fetched = vi.fn(async () => png());
    vi.stubGlobal('fetch', fetched);
    await Promise.all([images.loadProtectedImage(AVATAR), images.loadProtectedImage(AVATAR)]);
    await images.loadProtectedImage(AVATAR);

    expect(fetched).toHaveBeenCalledTimes(1);
});

it.each([
    '', null, undefined, 'https://evil.example/static/avatars/7_abc.png', '/static/avatars/../secret.png',
    '/static/other/7_abc.png', '/static/avatars/7_abc.svg',
])('never requests a path that is not an uploaded picture: %s', async path => {
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);

    expect(await images.loadProtectedImage(path)).toBeNull();
    expect(fetched).not.toHaveBeenCalled();
});

it.each([
    ['a refusal', () => new Response('{"error":"resource not found"}', { status: 404, headers: { 'content-type': 'application/json' } })],
    ['something that is not an image', () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['a network failure', () => { throw new TypeError('fetch failed'); }],
])('shows nothing after %s, and tries again next time', async (_case, answer) => {
    const fetched = vi.fn(async () => answer());
    vi.stubGlobal('fetch', fetched);

    expect(await images.loadProtectedImage(AVATAR)).toBeNull();
    expect(await images.loadProtectedImage(AVATAR)).toBeNull();
    expect(fetched).toHaveBeenCalledTimes(2);
});
