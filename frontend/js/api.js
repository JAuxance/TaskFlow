const API_BASE_URL = "http://localhost:5000";

export async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        credentials: "include"
    });

    const data = await response.json();

    return {
        ok: response.ok,
        status: response.status,
        data
    };
}