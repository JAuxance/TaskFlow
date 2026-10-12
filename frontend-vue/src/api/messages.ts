import { apiRequest, type ApiOptions } from './client';
import type { Conversation, DirectMessage, WorkspaceMessage } from './types';

/** Messages read per request; a full page means older ones may exist. */
export const MESSAGE_PAGE_SIZE = 50;

// The chat tells the user itself when the session expired, with its own words.
const quiet: ApiOptions = { allowUnauthorized: true };
const post = (message: string): ApiOptions => ({
    ...quiet, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }),
});

/** The full list: this endpoint is not paginated. */
export const getDirectConversations = () => apiRequest<Conversation[]>('/api/direct_conversations');

/** Newest first, like every message history. */
export const getWorkspaceMessages = (workspaceId: number, page: number) =>
    apiRequest<WorkspaceMessage[]>(`/api/workspaces/${workspaceId}/messages?limit=${MESSAGE_PAGE_SIZE}&page=${page}`, quiet);

export const sendWorkspaceMessage = (workspaceId: number, message: string) =>
    apiRequest<WorkspaceMessage>(`/api/workspaces/${workspaceId}/messages`, post(message));

export const getDirectMessages = (userId: number, page: number) =>
    apiRequest<DirectMessage[]>(`/api/users/${userId}/direct_messages?limit=${MESSAGE_PAGE_SIZE}&page=${page}`, quiet);

export const sendDirectMessage = (userId: number, message: string) =>
    apiRequest<DirectMessage>(`/api/users/${userId}/direct_messages`, post(message));
