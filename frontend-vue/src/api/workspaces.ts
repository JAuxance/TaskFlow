import { apiCollection, apiRequest } from './client';
import type { Workspace, WorkspaceMember } from './types';

export const getWorkspaces = () => apiCollection<Workspace>('/api/workspaces');

export const getWorkspaceMembers = (workspaceId: number) =>
    apiCollection<WorkspaceMember>(`/api/workspaces/${workspaceId}/members`);

export function createWorkspace(name: string) {
    return apiRequest<Workspace>('/api/workspaces', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
}
