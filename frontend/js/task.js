import { apiRequest, apiCollection } from "./api.js";

export async function getTasks(projectId) {
    return await apiCollection(`/api/projects/${projectId}/tasks`);
}

export async function createTask(projectId, title) {
    const body = {
        title,
        status: "todo",
        priority: "medium"
    };

    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)

    };

    return await apiRequest(
        `/api/projects/${projectId}/tasks`,
        options
    );
}

export async function getTaskById(taskId) {
    return await apiRequest(`/api/tasks/${taskId}`);
}

export async function updateTask(taskId, data) {
    const options = {
        method: "PATCH",
        headers: {
            "Content-type": "application/json"
        },
        body: JSON.stringify(data)
    };

    return await apiRequest(`/api/tasks/${taskId}`, options);
}
export async function deleteTask(taskId) {
    return await apiRequest(`/api/tasks/${taskId}`, {
        method: "DELETE"
    });
}
