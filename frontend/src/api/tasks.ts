import { apiCollection, apiRequest } from './client';
import type { Task } from './types';

const json = (body: unknown) => ({
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

/** Fields a task update may carry; the server keeps the others as they are. */
export type TaskChanges = Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'color' | 'due_date' | 'assignee_id'>>;

export const getTasks = (projectId: number) => apiCollection<Task>(`/api/projects/${projectId}/tasks`);

export const getTask = (taskId: number) => apiRequest<Task>(`/api/tasks/${taskId}`);

/** A new task starts in the first column with a medium priority. */
export const createTask = (projectId: number, title: string, color: string) =>
    apiRequest<Task>(`/api/projects/${projectId}/tasks`, {
        method: 'POST', ...json({ title, status: 'todo', priority: 'medium', color }),
    });

export const updateTask = (taskId: number, changes: TaskChanges) =>
    apiRequest<Task>(`/api/tasks/${taskId}`, { method: 'PATCH', ...json(changes) });

export const deleteTask = (taskId: number) => apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' });
