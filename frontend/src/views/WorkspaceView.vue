<script setup lang="ts">
// A workspace: overview, members and settings in tabs.
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { createProject } from '../api/projects';
import type { WorkspaceRole } from '../api/types';
import { addWorkspaceMember } from '../api/workspaces';
import AppDialog from '../components/AppDialog.vue';
import FormMessage from '../components/FormMessage.vue';
import { useBusy } from '../composables/useBusy';
import { ROLE_LABELS, colorOf, initialOf } from '../domain';
import { describeScreen } from '../layout/state';
import { announcePage, nameTab } from '../page';
import { useSidebarStore } from '../stores/sidebar';
import WorkspaceMembers from '../workspace/WorkspaceMembers.vue';
import WorkspaceOverview from '../workspace/WorkspaceOverview.vue';
import WorkspaceSettings from '../workspace/WorkspaceSettings.vue';
import { useWorkspace } from '../workspace/useWorkspace';

type Tab = 'projects' | 'members' | 'settings';
const TAB_LABELS: Record<Tab, string> = { projects: 'Overview', members: 'Members', settings: 'Settings' };

const route = useRoute();
const sidebar = useSidebarStore();
const workspaceId = Number(route.params.id);
const { workspace, members, membersError, error, isOwner, role, canManage, load } = useWorkspace();

const tabs = computed<Tab[]>(() => canManage.value
    ? ['projects', 'members', 'settings'] : ['projects', 'members']);
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
    describeScreen([{ label: workspace.value.name }], workspaceId);
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
    // The workspace may have been renamed: the tab follows, without moving the focus.
    await nextTick();
    nameTab();
}

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
                <span class="workspace-icon workspace-icon-large" :data-color="color" aria-hidden="true">{{ initialOf(workspace.name) }}</span>
                <div class="heading-copy">
                    <h1>{{ workspace.name }}</h1>
                </div>
                <span class="role-badge">{{ role ? ROLE_LABELS[role] ?? role : 'Role unavailable' }}</span>
            </div>
            <div v-if="canManage" class="header-actions" :hidden="tab === 'settings'">
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
