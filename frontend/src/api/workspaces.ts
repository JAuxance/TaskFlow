import { apiCollection, apiRequest } from './client';
import type { Workspace, WorkspaceMember, WorkspaceRole } from './types';

const json = (body: unknown) => ({
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

export const getWorkspaces = () => apiCollection<Workspace>('/api/workspaces');

export const getWorkspace = (workspaceId: number) => apiRequest<Workspace>(`/api/workspaces/${workspaceId}`);

export const getWorkspaceMembers = (workspaceId: number) =>
    apiCollection<WorkspaceMember>(`/api/workspaces/${workspaceId}/members`);

export const createWorkspace = (name: string) =>
    apiRequest<Workspace>('/api/workspaces', { method: 'POST', ...json({ name }) });

// The answers of the mutations below do not all describe the workspace the
// same way: callers read the workspace again instead of relying on them.

export const renameWorkspace = (workspaceId: number, name: string) =>
    apiRequest(`/api/workspaces/${workspaceId}`, { method: 'PATCH', ...json({ name }) });

export const deleteWorkspace = (workspaceId: number) =>
    apiRequest(`/api/workspaces/${workspaceId}`, { method: 'DELETE' });

export const transferWorkspaceOwner = (workspaceId: number, userId: number) =>
    apiRequest(`/api/workspaces/${workspaceId}/owner`, { method: 'PATCH', ...json({ user_id: userId }) });

export const addWorkspaceMember = (workspaceId: number, email: string, role: WorkspaceRole) =>
    apiRequest(`/api/workspaces/${workspaceId}/members`, { method: 'POST', ...json({ email, role }) });

export const setWorkspaceMemberRole = (workspaceId: number, userId: number, role: WorkspaceRole) =>
    apiRequest(`/api/workspaces/${workspaceId}/members/${userId}`, { method: 'PATCH', ...json({ role }) });

export const removeWorkspaceMember = (workspaceId: number, userId: number) =>
    apiRequest(`/api/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' });
