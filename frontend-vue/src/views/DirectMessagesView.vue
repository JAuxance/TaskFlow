<script setup lang="ts">
// A private conversation with another member.
// Same content as frontend/js/views/directMessagesView.js.
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getDirectMessages, sendDirectMessage } from '../api/messages';
import ChatPanel, { type ChatConfig } from '../chat/ChatPanel.vue';
import { isDirectConversation, subscribeDirectMessages } from '../chat/subscribe';
import { describeScreen } from '../layout/state';
import { announcePage } from '../page';
import { useSessionStore } from '../stores/session';
import { useSidebarStore } from '../stores/sidebar';
import { useWorkspace } from '../workspace/useWorkspace';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const sidebar = useSidebarStore();
const otherUserId = Number(route.params.userId);
// Opened from the members of a workspace: "back" returns there.
const fromWorkspaceId = Number(route.query.workspace) || null;
const { workspace, members, load: loadWorkspace } = useWorkspace();

const name = ref('');
const ready = ref(false);

onMounted(async () => {
    if (fromWorkspaceId) await loadWorkspace(fromWorkspaceId);
    const conversation = sidebar.conversations.find(item => item.user_id === otherUserId);
    name.value = conversation?.first_name || conversation?.username
        || members.value?.find(member => member.user_id === otherUserId)?.user_name || 'Member';
    describeScreen([
        { label: 'Workspaces', to: { name: 'home' } },
        ...(workspace.value ? [{ label: workspace.value.name, to: membersOf(workspace.value.id) }] : []),
        { label: 'Direct messages' },
    ]);
    ready.value = true;
    await nextTick();
    announcePage();
});

const membersOf = (workspaceId: number) => ({ name: 'workspace', params: { id: workspaceId, tab: 'members' } });
const back = () => router.push(workspace.value ? membersOf(workspace.value.id) : { name: 'home' });

const config = computed<ChatConfig>(() => ({
    embedded: true,
    title: name.value,
    emptyDescription: `Send your first private message to ${name.value}.`,
    placeholder: `Write a private message to ${name.value}…`,
    accessError: 'This conversation is unavailable. You must still share a workspace with this member.',
    getMessages: page => getDirectMessages(otherUserId, page),
    sendMessage: message => sendDirectMessage(otherUserId, message),
    subscribe: callbacks => subscribeDirectMessages(session.user?.id ?? 0, otherUserId, callbacks),
    acceptsMessage: message => 'sender_id' in message && isDirectConversation(message, session.user?.id ?? 0, otherUserId),
}));
</script>

<template>
    <template v-if="ready">
        <header class="page-heading page-heading-row">
            <div class="heading-copy"><h1>Direct messages</h1><p class="section-description direct-recipient">Conversation with {{ name }}</p></div>
            <button type="button" class="btn-secondary direct-back" @click="back">{{ workspace ? 'Back to members' : 'Back to workspaces' }}</button>
        </header>
        <section class="direct-chat-panel" aria-label="Private conversation">
            <!-- The preview of the conversation in the sidebar follows each message. -->
            <ChatPanel :config="config" @messages-changed="sidebar.refreshConversations()" />
        </section>
    </template>
</template>
