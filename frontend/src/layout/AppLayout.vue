<script setup lang="ts">
// Frame of every signed-in screen: sidebar, breadcrumb, theme switch.
import { computed, provide, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import folderIcon from '../assets/icons/folder.svg';
import markIcon from '../assets/icons/mark.svg';
import type { Conversation, Workspace } from '../api/types';
import FormMessage from '../components/FormMessage.vue';
import ProtectedImage from '../components/ProtectedImage.vue';
import { colorOf, initialOf } from '../domain';
import { useSessionStore } from '../stores/session';
import { useSidebarStore } from '../stores/sidebar';
import { useTheme } from '../theme';
import CreateWorkspaceDialog from './CreateWorkspaceDialog.vue';
import { createWorkspaceKey } from './createWorkspace';
import ProfileDialog from './ProfileDialog.vue';
import { layoutState } from './state';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const sidebar = useSidebarStore();
const { label: themeLabel, title: themeTitle, toggle: toggleTheme } = useTheme();
const profile = ref<InstanceType<typeof ProfileDialog> | null>(null);
const creation = ref<InstanceType<typeof CreateWorkspaceDialog> | null>(null);
// The welcome screen opens the same dialog as the "+" of the sidebar.
const createWorkspace = () => creation.value?.open();
provide(createWorkspaceKey, createWorkspace);

const user = computed(() => session.user);
const displayName = computed(() => user.value?.first_name || user.value?.username || user.value?.email || '');
const activeConversationId = computed(() => route.name === 'messages' ? Number(route.params.userId) : null);
// A conversation takes over the highlight, even when opened from a workspace.
const activeWorkspaceId = computed(() => activeConversationId.value !== null ? null
    : layoutState.workspaceId ?? (route.name === 'workspace' ? Number(route.params.id) : null));
// A trail of one entry would only repeat the title of the screen.
const breadcrumbs = computed(() => layoutState.trail && layoutState.trail.length > 1 ? layoutState.trail : []);

const conversationName = (conversation: Conversation) => conversation.first_name || conversation.username || 'User';
const openWorkspace = (workspace: Workspace) => router.push({ name: 'workspace', params: { id: workspace.id } });
const openConversation = (conversation: Conversation) => router.push({ name: 'messages', params: { userId: conversation.user_id } });
</script>

<template>
    <div class="app-layout">
        <aside class="sidebar" aria-label="Workspace navigation">
            <div class="sidebar-header"><img class="icon icon-mark" :src="markIcon" width="28" height="28" alt="" aria-hidden="true"><span>TaskFlow</span></div>
            <nav class="sidebar-navigation" aria-label="Workspaces">
                <div class="sidebar-heading">
                    <p class="sidebar-label">Workspaces</p>
                    <button id="new-workspace-button" type="button" class="sidebar-add" aria-label="New workspace" title="New workspace" @click="createWorkspace">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
                    </button>
                </div>
                <div id="workspace-list">
                    <button
                        v-for="item in sidebar.workspaces" :key="item.id" type="button" class="workspace-button"
                        :class="{ 'is-active': item.id === activeWorkspaceId }" :data-color="colorOf(item.color)" :title="item.name"
                        :aria-current="item.id === activeWorkspaceId ? 'page' : undefined" @click="openWorkspace(item)"
                    >
                        <span class="workspace-icon" :data-color="colorOf(item.color)" aria-hidden="true"><template v-if="item.icon_type === 'emoji' && item.icon_value">{{ item.icon_value }}</template><ProtectedImage v-else :path="item.icon_type === 'image' ? item.icon_value : null" :fallback="folderIcon" /></span><span>{{ item.name }}</span>
                    </button>
                    <p v-if="!sidebar.workspacesError && !sidebar.workspaces.length" class="sidebar-empty">No workspaces yet.</p>
                </div>
                <FormMessage id="sidebar-message" :text="sidebar.workspacesError" />

                <p class="sidebar-label">Messages</p>
                <div id="conversation-list">
                    <button
                        v-for="conversation in sidebar.conversations" :key="conversation.user_id" type="button"
                        class="workspace-button conversation-button" :class="{ 'is-active': conversation.user_id === activeConversationId }"
                        :title="conversationName(conversation)" :aria-current="conversation.user_id === activeConversationId ? 'page' : undefined"
                        @click="openConversation(conversation)"
                    >
                        <span class="avatar" aria-hidden="true"><span>{{ initialOf(conversationName(conversation)) }}</span><ProtectedImage :path="conversation.avatar_url" /></span>
                        <span class="conversation-copy"><span>{{ conversationName(conversation) }}</span><span class="conversation-preview">{{ conversation.last_message }}</span></span>
                    </button>
                    <p v-if="!sidebar.conversations.length" class="sidebar-empty">No conversations yet.</p>
                </div>
                <FormMessage id="conversation-message" :text="sidebar.conversationsError" />
            </nav>
            <div class="sidebar-account">
                <button id="profile-button" type="button" class="account-profile" aria-label="Edit your profile" @click="profile?.open()">
                    <span class="avatar" aria-hidden="true"><span class="avatar-initial">{{ initialOf(displayName) }}</span><ProtectedImage :path="user?.avatar_url" /></span>
                    <span class="account-details"><span class="account-name">{{ displayName }}</span><span class="account-email">{{ user?.email }}</span></span>
                </button>
            </div>
        </aside>
        <main class="main-content">
            <header class="main-header">
                <nav class="breadcrumbs" aria-label="Breadcrumb">
                    <template v-for="(crumb, index) in breadcrumbs" :key="crumb.label">
                        <span v-if="index" class="breadcrumb-separator" aria-hidden="true">›</span>
                        <button v-if="crumb.to" type="button" class="breadcrumb-link" :title="crumb.label" @click="router.push(crumb.to)">{{ crumb.label }}</button>
                        <span v-else :title="crumb.label" aria-current="page">{{ crumb.label }}</span>
                    </template>
                </nav>
                <button id="theme-toggle" type="button" class="theme-toggle" :aria-label="themeLabel" :title="themeTitle" @click="toggleTheme">
                    <svg class="theme-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.9 13.3A9 9 0 0 1 10.7 3.1 9 9 0 1 0 20.9 13.3Z" /></svg>
                    <svg class="theme-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                </button>
            </header>
            <section id="page-content" class="page-content" :class="route.meta.pageClass" tabindex="-1">
                <!-- A new address rebuilds the screen from fresh data. -->
                <RouterView :key="route.path" />
            </section>
        </main>
    </div>
    <ProfileDialog ref="profile" />
    <CreateWorkspaceDialog ref="creation" />
</template>
