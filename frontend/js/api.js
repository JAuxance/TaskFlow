const isDevelopment =
    window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1";

export const API_BASE_URL = isDevelopment
    ? `http://${window.location.hostname}:5000`
    : "";

let csrfRequest = null;

function requestCsrfToken() {
    // Share the first request so concurrent saves use the same session cookie.
    if (!csrfRequest) {
        csrfRequest = apiRequest("/api/auth/csrf", { cache: "no-store" })
            .finally(() => { csrfRequest = null; });
    }
    return csrfRequest;
}

export function apiAssetUrl(path) {
    if (typeof path !== "string" || !/^\/static\/(avatars|workspace_icons)\/[\w-]+\.(png|jpe?g|webp)$/i.test(path)) return "";
    return `${API_BASE_URL}${path}`;
}

function dataImageUrl(bytes, contentType) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
}

export async function showProtectedImage(img, storedPath, fallback) {
    const useFallback = () => {
        if (fallback) {
            img.hidden = false;
            img.src = fallback;
        } else {
            img.hidden = true;
            img.removeAttribute("src");
        }
    };
    const url = apiAssetUrl(storedPath);
    if (!url) {
        useFallback();
        return;
    }
    try {
        const response = await fetch(url, { credentials: "include", cache: "no-store" });
        const contentType = (response.headers.get("content-type") || "").split(";")[0].trim();
        if (!response.ok || !contentType.toLowerCase().startsWith("image/")) {
            useFallback();
            return;
        }
        img.hidden = false;
        img.src = dataImageUrl(new Uint8Array(await response.arrayBuffer()), contentType);
    } catch {
        useFallback();
    }
}

export async function apiRequest(endpoint, options = {}) {
    try {
        const method = (options.method || "GET").toUpperCase();
        const headers = new Headers(options.headers);
        if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
            const csrf = await requestCsrfToken();
            if (!csrf.ok) return csrf;
            if (typeof csrf.data?.csrf_token !== "string") {
                return { ok: false, status: 0, data: { error: "Unable to prepare a secure request. Please try again." } };
            }
            headers.set("X-CSRF-Token", csrf.data.csrf_token);
        }
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers,
            credentials: "include"
        });
        let data;
        try {
            data = await response.json();
        } catch {
            return {
                ok: false,
                status: response.status,
                data: {
                    error: response.status === 413 ?
                        "This image is too large. Choose a smaller file (under 5 MB)." :
                        "The server returned an unexpected response. Please try again."
                }
            };
        }
        if (!response.ok && (!data || typeof data.error !== "string")) {
            data = {
                error: response.status === 429 ?
                    "Too many requests. Please wait a moment and try again." :
                    "This action could not be completed. Please try again."
            };
        }
        return { ok: response.ok, status: response.status, data };
    } catch {
        return {
            ok: false,
            status: 0,
            data: { error: "Unable to reach TaskFlow. Check your connection and try again." }
        };
    }
}

export async function apiCollection(endpoint) {
    const items = [];
    for (let page = 1;; page += 1) {
        const result = await apiRequest(`${endpoint}?limit=100&page=${page}`);
        if (!result.ok) return result;
        if (!Array.isArray(result.data)) {
            return {
                ok: false,
                status: result.status,
                data: { error: "The server returned an unexpected list. Please try again." }
            };
        }
        items.push(...result.data);
        if (result.data.length < 100) return {...result, data: items };
    }
}
