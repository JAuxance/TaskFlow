import { apiCollection, apiRequest } from './client';
import type { Project } from './types';

const json = (body: unknown) => ({
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

export const getProjects = (workspaceId: number) =>
    apiCollection<Project>(`/api/workspaces/${workspaceId}/projects`);

export const getProject = (projectId: number) => apiRequest<Project>(`/api/projects/${projectId}`);

export const createProject = (workspaceId: number, name: string, description: string) =>
    apiRequest<Project>(`/api/workspaces/${workspaceId}/projects`, { method: 'POST', ...json({ name, description }) });

export const updateProject = (projectId: number, changes: { name: string; description: string }) =>
    apiRequest<Project>(`/api/projects/${projectId}`, { method: 'PATCH', ...json(changes) });

export const deleteProject = (projectId: number) => apiRequest(`/api/projects/${projectId}`, { method: 'DELETE' });
