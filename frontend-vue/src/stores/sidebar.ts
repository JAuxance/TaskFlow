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

    return { workspaces, workspacesError, conversations, conversationsError, refresh };
});
