const isDevelopment =
    window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1";

export const API_BASE_URL = isDevelopment
    ? "http://localhost:5000"
    : "";

export function apiAssetUrl(path) {
    if (typeof path !== "string" || !/^\/static\/(avatars|workspace_icons)\/[\w-]+\.(png|jpe?g|webp)$/i.test(path)) return "";
    return `${API_BASE_URL}${path}`;
}

export async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
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
