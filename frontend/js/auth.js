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

export async function logout() {
    return await apiRequest("/api/auth/logout", {
        method: "POST"
    });
}