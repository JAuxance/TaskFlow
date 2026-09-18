import { apiRequest } from "./api.js";

export async function getProjects(workspaceId) {
    return await apiRequest(`/api/workspaces/${workspaceId}/projects`);
}
export async function createProject(workspaceId, name, description = "") {
    const body = {
        name,
        description
    };

    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    };

    return await apiRequest(
        `/api/workspaces/${workspaceId}/projects`,
        options
    );
}
export async function getProjectById(projectId) {
    return await apiRequest(`/api/projects/${projectId}`);
}
export async function updateProject(projectId, data) {
    return await apiRequest(
        `/api/projects/${projectId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        }
    );
}
export async function deleteProject(projectId) {
    return await apiRequest(
        `/api/projects/${projectId}`, {
            method: "DELETE"
        }
    );
}