import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getDirectConversations } from '../api/messages';
import type { Conversation, Workspace } from '../api/types';
import { getWorkspaces } from '../api/workspaces';

/** What the sidebar lists on every screen: workspaces and private conversations. */
export const useSidebarStore = defineStore('sidebar', () => {
    const workspaces = ref<Workspace[]>([]);
    const workspacesError = ref('');
    const conversations = ref<Conversation[]>([]);
    const conversationsError = ref('');

    /** Read both lists again. An expired session is handled by the HTTP client. */
    async function refresh(): Promise<void> {
        const [workspaceResult, conversationResult] = await Promise.all([getWorkspaces(), getDirectConversations()]);
        if (workspaceResult.status === 401 || conversationResult.status === 401) return;
        workspaces.value = workspaceResult.ok ? workspaceResult.data : [];
        workspacesError.value = workspaceResult.ok ? '' : workspaceResult.data.error;
        // On failure the previous conversations stay displayed, with the error below.
        if (conversationResult.ok) conversations.value = conversationResult.data;
        conversationsError.value = conversationResult.ok ? '' : conversationResult.data.error;
    }

    /** A message was sent or received: only the conversations can have changed. */
    async function refreshConversations(): Promise<void> {
        const result = await getDirectConversations();
        if (result.status === 401) return;
        if (result.ok) conversations.value = result.data;
        conversationsError.value = result.ok ? '' : result.data.error;
    }

    return { workspaces, workspacesError, conversations, conversationsError, refresh, refreshConversations };
});
