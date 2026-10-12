// Avatars and workspace icons are private: the server checks the session
// before sending them. They are fetched with the cookie and shown as data
// URLs, the only image source the production CSP allows besides the site.

const UPLOAD_PATH = /^\/static\/(avatars|workspace_icons)\/[\w-]+\.(png|jpe?g|webp)$/i;

/** One request per image for the whole visit; a new upload gets a new path. */
const loaded = new Map<string, Promise<string | null>>();

function dataUrl(bytes: Uint8Array, contentType: string): string {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
}

async function fetchImage(path: string): Promise<string | null> {
    try {
        const response = await fetch(path, { credentials: 'include', cache: 'no-store' });
        const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
        if (!response.ok || !contentType.toLowerCase().startsWith('image/')) return null;
        return dataUrl(new Uint8Array(await response.arrayBuffer()), contentType);
    } catch {
        return null;
    }
}

/** A data URL for an uploaded image, or null when there is none to show. */
export function loadProtectedImage(path: string | null | undefined): Promise<string | null> {
    if (typeof path !== 'string' || !UPLOAD_PATH.test(path)) return Promise.resolve(null);
    let pending = loaded.get(path);
    if (!pending) {
        pending = fetchImage(path);
        loaded.set(path, pending);
        // A failure is not remembered: the next display tries again.
        void pending.then(url => { if (url === null) loaded.delete(path); });
    }
    return pending;
}
