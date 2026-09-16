import { apiRequest } from "./api.js";

export async function getWorkspaces() {
    return await apiRequest("/api/workspaces");
}

export async function createWorkspace(name) {
    const body = {
        name
    };

    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    };

    return await apiRequest("/api/workspaces", options);
}
export async function getWorkspaceById(workspaceId) {
    return await apiRequest(`/api/workspaces/${workspaceId}`);
}