import type { APIRequestContext } from '@playwright/test';
import { API_URL, FRONTEND_ORIGIN } from './stack';

export const PASSWORD = 'E2e-Only-Password-123!';

export type User = { id: number; username: string; email: string };
export type Workspace = { id: number; name: string };
export type Project = { id: number; name: string };
export type Task = { id: number; title: string; status: string };
export type TaskFields = {
    title: string; status?: string; priority?: string; color?: string;
    description?: string; due_date?: string; assignee_id?: number;
};

export const emailOf = (name: string) => `${name}@example.com`;

/**
 * Call the API as the frontend does: allowed origin, session cookie and a
 * CSRF token for every mutation. Used to prepare data quickly; the
 * journeys under test go through the interface.
 */
export async function api<T = unknown>(
    request: APIRequestContext, method: string, path: string, data?: unknown, expectedStatus?: number,
): Promise<T> {
    const headers: Record<string, string> = { Origin: FRONTEND_ORIGIN };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const token = await request.get(`${API_URL}/api/auth/csrf`, { headers });
        headers['X-CSRF-Token'] = (await token.json()).csrf_token;
    }
    const response = await request.fetch(API_URL + path, { method, headers, data });
    const expected = expectedStatus ?? (method === 'POST' ? 201 : 200);
    if (response.status() !== expected) {
        throw new Error(`${method} ${path}: expected ${expected}, received ${response.status()} ${await response.text()}`);
    }
    return await response.json() as T;
}

/** Register an account; the request context is signed in afterwards. */
export function signUp(request: APIRequestContext, name: string): Promise<User> {
    return api<User>(request, 'POST', '/api/users', { username: name, email: emailOf(name), password: PASSWORD });
}

export function createWorkspace(request: APIRequestContext, name: string): Promise<Workspace> {
    return api<Workspace>(request, 'POST', '/api/workspaces', { name });
}

export function addMember(request: APIRequestContext, workspaceId: number, name: string, role: string) {
    return api(request, 'POST', `/api/workspaces/${workspaceId}/members`, { email: emailOf(name), role });
}

export function createProject(request: APIRequestContext, workspaceId: number, name: string, description = ''): Promise<Project> {
    return api<Project>(request, 'POST', `/api/workspaces/${workspaceId}/projects`, { name, description });
}

export function createTask(request: APIRequestContext, projectId: number, fields: TaskFields): Promise<Task> {
    return api<Task>(request, 'POST', `/api/projects/${projectId}/tasks`, { status: 'todo', priority: 'medium', ...fields });
}
