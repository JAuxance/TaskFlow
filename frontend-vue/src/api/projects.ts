import { apiCollection } from './client';
import type { Project, Task } from './types';

export const getProjects = (workspaceId: number) =>
    apiCollection<Project>(`/api/workspaces/${workspaceId}/projects`);

export const getTasks = (projectId: number) => apiCollection<Task>(`/api/projects/${projectId}/tasks`);
