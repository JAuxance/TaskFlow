import { apiRequest } from "./api.js";

export async function login(email, password) {
    const body = {
        email,
        password
    };

    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    };

    return await apiRequest("/api/auth/login", options);
}

export async function getCurrentUser() {
    return await apiRequest("/api/auth/me");
}

export function updateFirstName(firstName) {
    return apiRequest("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: firstName })
    });
}

export function uploadAvatar(file) {
    const body = new FormData();
    body.append("avatar", file);
    return apiRequest("/api/users/me/avatar", { method: "POST", body });
}

export async function logout() {
    return await apiRequest("/api/auth/logout", {
        method: "POST"
    });
}
