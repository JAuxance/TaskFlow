<script setup lang="ts">
// A workspace: overview, messages, members and settings in tabs.
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import folderIcon from '../assets/icons/folder.svg';
import { getWorkspaceMessages, sendWorkspaceMessage } from '../api/messages';
import { createProject } from '../api/projects';
import type { WorkspaceRole } from '../api/types';
import { addWorkspaceMember } from '../api/workspaces';
import ChatPanel, { type ChatConfig } from '../chat/ChatPanel.vue';
import { subscribeWorkspaceChat } from '../chat/subscribe';
import AppDialog from '../components/AppDialog.vue';
import FormMessage from '../components/FormMessage.vue';
import ProtectedImage from '../components/ProtectedImage.vue';
import { useBusy } from '../composables/useBusy';
import { ROLE_LABELS, colorOf } from '../domain';
import { describeScreen } from '../layout/state';
import { announcePage } from '../page';
import { useSidebarStore } from '../stores/sidebar';
import WorkspaceMembers from '../workspace/WorkspaceMembers.vue';
import WorkspaceOverview from '../workspace/WorkspaceOverview.vue';
import WorkspaceSettings from '../workspace/WorkspaceSettings.vue';
import { useWorkspace } from '../workspace/useWorkspace';

type Tab = 'projects' | 'messages' | 'members' | 'settings';
const TAB_LABELS: Record<Tab, string> = { projects: 'Overview', messages: 'Messages', members: 'Members', settings: 'Settings' };

const route = useRoute();
const sidebar = useSidebarStore();
const workspaceId = Number(route.params.id);
const { workspace, members, membersError, error, isOwner, role, canManage, load } = useWorkspace();

const tabs = computed<Tab[]>(() => canManage.value
    ? ['projects', 'messages', 'members', 'settings'] : ['projects', 'messages', 'members']);
const tab = ref<Tab>('projects');
const tabButtons = ref<HTMLButtonElement[]>([]);
/** Changing it rebuilds the panels from fresh data after a change. */
const version = ref(0);

// The primary owner may give any role; another owner all but Owner; an admin the two lowest.
const allowedRoles = computed<WorkspaceRole[]>(() => isOwner.value ? ['member', 'guest', 'admin', 'owner']
    : role.value === 'owner' ? ['member', 'guest', 'admin'] : ['member', 'guest']);
const color = computed(() => colorOf(workspace.value?.color));

async function show(): Promise<void> {
    if (!await load(workspaceId) || !workspace.value) return;
    describeScreen([{ label: 'Workspaces', to: { name: 'workspaces' } }, { label: workspace.value.name }], workspaceId);
}

onMounted(async () => {
    await show();
    const asked = route.params.tab as Tab | '';
    if (asked && tabs.value.includes(asked)) tab.value = asked;
    await nextTick();
    announcePage();
});

/** After a change: read everything again and stay on the same tab. */
async function refresh(): Promise<void> {
    await Promise.all([show(), sidebar.refresh()]);
    version.value += 1;
}

// --- Messages ----------------------------------------------------------------------

const chat = ref<InstanceType<typeof ChatPanel> | null>(null);
const chatOpened = ref(false);
const chatConfig: ChatConfig = {
    title: 'Workspace messages',
    description: 'A shared conversation for everyone in this workspace.',
    emptyDescription: 'Share the first update with your workspace.',
    placeholder: 'Share an update or ask your team a question…',
    accessError: 'You no longer have access to this workspace. Return to your workspaces to continue.',
    getMessages: page => getWorkspaceMessages(workspaceId, page),
    sendMessage: message => sendWorkspaceMessage(workspaceId, message),
    subscribe: callbacks => subscribeWorkspaceChat(workspaceId, callbacks),
    acceptsMessage: message => 'workspace_id' in message && Number(message.workspace_id) === workspaceId,
};

watch(tab, async opened => {
    if (opened !== 'messages') return;
    chatOpened.value = true;
    // Back on the tab: show the latest messages again if the user was following them.
    await nextTick();
    chat.value?.activate();
});

function onTabKey(event: KeyboardEvent, index: number): void {
    const count = tabs.value.length;
    const next = event.key === 'ArrowRight' ? (index + 1) % count
        : event.key === 'ArrowLeft' ? (index - 1 + count) % count
            : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : null;
    if (next === null) return;
    event.preventDefault();
    tab.value = tabs.value[next] ?? 'projects';
    tabButtons.value[next]?.focus();
}

// --- New project -----------------------------------------------------------------

const projectDialog = ref<InstanceType<typeof AppDialog> | null>(null);
const { busy: creatingProject, run: runProject } = useBusy();
const projectName = ref('');
const projectDescription = ref('');
const projectMessage = ref('');

async function submitProject(): Promise<void> {
    const name = projectName.value.trim();
    if (!name) {
        projectMessage.value = 'Enter a project name.';
        return;
    }
    let created = false;
    await runProject(async () => {
        projectMessage.value = '';
        const result = await createProject(workspaceId, name, projectDescription.value.trim());
        if (!result.ok) {
            projectMessage.value = result.data.error || 'Could not create the project.';
            return;
        }
        created = true;
    });
    if (!created) return;
    projectName.value = '';
    projectDescription.value = '';
    await nextTick();
    projectDialog.value?.close();
    tab.value = 'projects';
    await refresh();
}

// --- Add member ------------------------------------------------------------------

const memberDialog = ref<InstanceType<typeof AppDialog> | null>(null);
const { busy: addingMember, run: runMember } = useBusy();
const memberEmail = ref('');
const memberRole = ref<WorkspaceRole>('member');
const memberMessage = ref('');

async function submitMember(): Promise<void> {
    let added = false;
    await runMember(async () => {
        memberMessage.value = '';
        const result = await addWorkspaceMember(workspaceId, memberEmail.value.trim(), memberRole.value);
        if (!result.ok) {
            memberMessage.value = result.data.error || 'Could not add this member.';
            return;
        }
        added = true;
    });
    if (!added) return;
    memberEmail.value = '';
    memberRole.value = 'member';
    await nextTick();
    memberDialog.value?.close();
    tab.value = 'members';
    await refresh();
}
</script>

<template>
    <FormMessage v-if="error" :text="error" />
    <template v-if="workspace">
        <header class="page-heading page-heading-row">
            <div class="workspace-title-row">
                <span v-if="workspace.icon_type === 'emoji' && workspace.icon_value" class="workspace-icon workspace-icon-large" :data-color="color" aria-hidden="true">{{ workspace.icon_value }}</span>
                <ProtectedImage v-else class="workspace-icon workspace-icon-large" :data-color="color" width="48" height="48" :path="workspace.icon_type === 'image' ? workspace.icon_value : null" :fallback="folderIcon" />
                <div class="heading-copy">
                    <h1>{{ workspace.name }}</h1>
                </div>
                <span class="role-badge">{{ role ? ROLE_LABELS[role] ?? role : 'Role unavailable' }}</span>
            </div>
            <div v-if="canManage" class="header-actions" :hidden="tab === 'settings' || tab === 'messages'">
                <button id="open-create-project-button" type="button" class="btn-primary" :hidden="tab !== 'projects'" @click="projectDialog?.open()">New project</button>
                <button id="open-add-member-button" type="button" class="btn-primary" :hidden="tab !== 'members'" @click="memberDialog?.open()">Add member</button>
            </div>
        </header>

        <div class="page-tabs" role="tablist" aria-label="Workspace sections">
            <button
                v-for="(name, index) in tabs" :id="`tab-${name}`" :key="name" ref="tabButtons" class="page-tab" type="button" role="tab"
                :aria-controls="`panel-${name}`" :aria-selected="tab === name" :tabindex="tab === name ? 0 : -1"
                @click="tab = name" @keydown="onTabKey($event, index)"
            >{{ TAB_LABELS[name] }}<template v-if="name === 'members'">{{ ' ' }}<span class="tab-count">{{ members ? members.length : '—' }}</span></template></button>
        </div>

        <WorkspaceOverview :key="`overview-${version}`" :workspace="workspace" :can-manage="canManage" :hidden="tab !== 'projects'" @create-project="projectDialog?.open()" />

        <section id="panel-messages" class="tab-panel" role="tabpanel" aria-labelledby="tab-messages" tabindex="0" :hidden="tab !== 'messages'">
            <!-- The chat connects the first time its tab is opened, then stays connected. -->
            <ChatPanel v-if="chatOpened" ref="chat" :config="chatConfig" :visible="tab === 'messages'" />
        </section>

        <WorkspaceMembers
            :key="`members-${version}`" :workspace="workspace" :members="members" :members-error="membersError" :role="role"
            :is-owner="isOwner" :can-manage="canManage" :allowed-roles="allowedRoles" :hidden="tab !== 'members'" @changed="refresh"
        />

        <WorkspaceSettings v-if="canManage" :key="`settings-${version}`" :workspace="workspace" :members="members" :is-owner="isOwner" :hidden="tab !== 'settings'" @changed="refresh" />

        <template v-if="canManage">
            <AppDialog id="create-project-dialog" ref="projectDialog" title="New project" title-id="create-project-heading" :busy="creatingProject">
                <form id="create-project-form" class="dialog-body" @submit.prevent="submitProject">
                    <p class="section-description">Create a project in {{ workspace.name }} to organize related tasks.</p>
                    <div class="field">
                        <label for="project-name-input">Project name</label>
                        <input id="project-name-input" v-model="projectName" name="name" type="text" placeholder="Enter a project name" maxlength="50" required autofocus>
                    </div>
                    <div class="field">
                        <label for="project-description-input">Description <span class="field-hint">(optional)</span></label>
                        <textarea id="project-description-input" v-model="projectDescription" name="description" rows="3" placeholder="What is this project about?" />
                    </div>
                    <FormMessage id="create-project-message" :text="projectMessage" />
                    <div class="dialog-actions"><button type="button" class="btn-secondary" data-close-dialog @click="projectDialog?.close()">Cancel</button><button type="submit" class="btn-primary" :disabled="creatingProject" :aria-busy="creatingProject || undefined">Create project</button></div>
                </form>
            </AppDialog>

            <AppDialog id="add-member-dialog" ref="memberDialog" title="Add member" title-id="add-member-heading" :busy="addingMember">
                <form id="add-member-form" class="dialog-body" @submit.prevent="submitMember">
                    <p class="section-description">Add an existing TaskFlow user to this workspace.</p>
                    <div class="field">
                        <label for="member-email">Email</label>
                        <input id="member-email" v-model="memberEmail" name="email" type="email" placeholder="name@example.com" autocomplete="email" maxlength="255" required autofocus>
                    </div>
                    <div class="field">
                        <label for="member-role">Role</label>
                        <select id="member-role" v-model="memberRole" name="role">
                            <option v-for="value in allowedRoles" :key="value" :value="value">{{ ROLE_LABELS[value] }}</option>
                        </select>
                    </div>
                    <FormMessage id="add-member-message" :text="memberMessage" />
                    <div class="dialog-actions"><button type="button" class="btn-secondary" data-close-dialog @click="memberDialog?.close()">Cancel</button><button type="submit" class="btn-primary" :disabled="addingMember" :aria-busy="addingMember || undefined">Add member</button></div>
                </form>
            </AppDialog>
        </template>
    </template>
</template>
