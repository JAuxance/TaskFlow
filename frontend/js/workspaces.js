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
export async function getWorkspacesMembers(workspaceId) {
    return await apiRequest(`/api/workspaces/${workspaceId}/members`);
}
export async function addWorkspaceMember(workspaceId, email, role = "member") {
    const body = {
        email,
        role
    };

    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    };

    return await apiRequest(
        `/api/workspaces/${workspaceId}/members`,
        options
    );
}
export async function updateWorkspaceMemberRole(workspaceId, userId, role) {
    const body = {
        role
    };

    const options = {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    };
    return await apiRequest(
        `/api/workspaces/${workspaceId}/members/${userId}`,
        options
    );
}
export async function deleteWorkspaceMember(workspaceId, userId) {
    return await apiRequest(
        `/api/workspaces/${workspaceId}/members/${userId}`, {
            method: "DELETE"
        }
    );
}