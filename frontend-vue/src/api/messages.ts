import { apiRequest } from './client';
import type { Conversation } from './types';

/** The full list: this endpoint is not paginated. */
export const getDirectConversations = () => apiRequest<Conversation[]>('/api/direct_conversations');
