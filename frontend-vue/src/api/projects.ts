import { apiCollection, apiRequest } from './client';
import type { Project, Task } from './types';

export const getProjects = (workspaceId: number) =>
    apiCollection<Project>(`/api/workspaces/${workspaceId}/projects`);

export function createProject(workspaceId: number, name: string, description: string) {
    return apiRequest<Project>(`/api/workspaces/${workspaceId}/projects`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }),
    });
}

export const getTasks = (projectId: number) => apiCollection<Task>(`/api/projects/${projectId}/tasks`);
