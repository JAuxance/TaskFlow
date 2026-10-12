<script setup lang="ts">
// "All workspaces": one card per workspace with its projects and tasks.
// Same content and behavior as frontend/js/views/dashboardView.js.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import chevronIcon from '../../../frontend/assets/icons/chevron.svg';
import folderIcon from '../../../frontend/assets/icons/folder.svg';
import { getProjects, getTasks } from '../api/projects';
import type { Project, Task, TaskStatus, Workspace } from '../api/types';
import { createWorkspace, getWorkspaceMembers } from '../api/workspaces';
import AppDialog from '../components/AppDialog.vue';
import FormMessage from '../components/FormMessage.vue';
import ProtectedImage from '../components/ProtectedImage.vue';
import { useBusy } from '../composables/useBusy';
import { ROLE_LABELS, colorOf } from '../domain';
import { useSessionStore } from '../stores/session';
import { useSidebarStore } from '../stores/sidebar';

interface ProjectEntry { workspace: Workspace; project: Project }
interface TaskEntry extends ProjectEntry { task: Task }
type StatusFilter = 'active' | 'all' | TaskStatus;

const STATUS_LABELS: Record<TaskStatus, string> = {
    todo: 'To do', in_progress: 'In progress', review: 'In review', done: 'Done',
};
const PRIORITY_LABELS: Record<string, string> = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' };
const dueFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
// The list endpoints are paginated: limit how many are read at the same time.
const BATCH = 4;

const router = useRouter();
const session = useSessionStore();
const sidebar = useSidebarStore();

const workspaces = computed(() => sidebar.workspaces);
const workspacesError = computed(() => sidebar.workspacesError);
const statusFilter = ref<StatusFilter>('active');

// Late answers are ignored once the screen is left or a newer load started.
let mounted = true;
onBeforeUnmount(() => { mounted = false; });

// --- Role shown on each card -------------------------------------------------

const roles = reactive(new Map<number, { label: string; unavailable?: boolean }>());

function loadRoles(): void {
    roles.clear();
    for (const workspace of workspaces.value) {
        if (workspace.owner_id === session.user?.id) {
            roles.set(workspace.id, { label: 'Owner' });
            continue;
        }
        // The workspace list does not say which role the user has in each one.
        roles.set(workspace.id, { label: '…' });
        void getWorkspaceMembers(workspace.id).then(result => {
            if (!mounted) return;
            const member = result.ok ? result.data.find(item => item.user_id === session.user?.id) : undefined;
            roles.set(workspace.id, {
                label: member ? ROLE_LABELS[member.role] ?? member.role : '—', unavailable: !result.ok,
            });
        });
    }
}

// --- Projects and tasks of every workspace -----------------------------------

const tasks = ref<TaskEntry[]>([]);
const projects = ref<ProjectEntry[]>([]);
const failedWorkspaces = ref(new Set<number>());
const failedProjects = ref(new Set<number>());
const loading = ref(true);
const incomplete = ref(false);
const overviewMessage = ref('');
let overviewVersion = 0;

async function loadOverview(): Promise<void> {
    const version = ++overviewVersion;
    const isLatest = () => mounted && version === overviewVersion;
    loading.value = true;
    incomplete.value = Boolean(workspacesError.value);
    tasks.value = [];
    projects.value = [];
    failedWorkspaces.value = new Set();
    failedProjects.value = new Set();
    overviewMessage.value = '';

    const foundProjects: ProjectEntry[] = [];
    for (let start = 0; start < workspaces.value.length; start += BATCH) {
        const results = await Promise.all(workspaces.value.slice(start, start + BATCH).map(async workspace => ({
            workspace, result: await getProjects(workspace.id),
        })));
        if (!isLatest()) return;
        for (const { workspace, result } of results) {
            if (!result.ok) {
                incomplete.value = true;
                failedWorkspaces.value.add(workspace.id);
                continue;
            }
            for (const project of result.data) foundProjects.push({ workspace, project });
        }
    }
    projects.value = foundProjects;

    const foundTasks: TaskEntry[] = [];
    for (let start = 0; start < foundProjects.length; start += BATCH) {
        const results = await Promise.all(foundProjects.slice(start, start + BATCH).map(async entry => ({
            ...entry, result: await getTasks(entry.project.id),
        })));
        if (!isLatest()) return;
        for (const { workspace, project, result } of results) {
            if (!result.ok) {
                incomplete.value = true;
                failedProjects.value.add(project.id);
                continue;
            }
            for (const task of result.data) {
                if (Object.hasOwn(STATUS_LABELS, task.status)) foundTasks.push({ task, project, workspace });
            }
        }
    }
    // Soonest deadlines first; undated tasks keep a stable alphabetical order.
    foundTasks.sort((a, b) => {
        const aDue = Date.parse(a.task.due_date ?? '');
        const bDue = Date.parse(b.task.due_date ?? '');
        return (Number.isNaN(aDue) ? Infinity : aDue) - (Number.isNaN(bDue) ? Infinity : bDue)
            || a.task.title.localeCompare(b.task.title);
    });
    tasks.value = foundTasks;
    loading.value = false;
    if (incomplete.value) {
        overviewMessage.value = 'Some projects or tasks could not be loaded. The list and count may be incomplete.';
    }
}

const matching = computed(() => tasks.value.filter(({ task }) => statusFilter.value === 'all'
    || (statusFilter.value === 'active' ? task.status !== 'done' : task.status === statusFilter.value)));
const taskCount = computed(() => loading.value ? '—' : `${matching.value.length}${incomplete.value ? '+' : ''}`);
const emptyProjectMessage = computed(() => {
    if (statusFilter.value === 'active') return 'No unfinished tasks in this project.';
    if (statusFilter.value === 'all') return 'No tasks in this project yet.';
    return `No tasks with status “${STATUS_LABELS[statusFilter.value]}”.`;
});

/** What one workspace card shows below its header. */
const binders = computed(() => workspaces.value.map(workspace => {
    const unavailable = failedWorkspaces.value.has(workspace.id);
    const own = projects.value.filter(entry => entry.workspace.id === workspace.id);
    const ownTasks = matching.value.filter(entry => entry.workspace.id === workspace.id);
    const partial = own.some(({ project }) => failedProjects.value.has(project.id));
    return {
        workspace,
        count: loading.value || unavailable ? '—' : `${ownTasks.length}${partial ? '+' : ''}`,
        message: loading.value ? 'Loading projects and tasks…'
            : unavailable ? "Projects could not be loaded. Retry to see this workspace's tasks."
                : own.length ? '' : 'No projects in this workspace yet.',
        projects: own.map(({ project }) => ({
            project,
            headingId: `binder-project-${workspace.id}-${project.id}`,
            unavailable: failedProjects.value.has(project.id),
            tasks: ownTasks.filter(entry => entry.project.id === project.id).map(entry => entry.task),
        })),
    };
}));

function dueLabel(task: Task): string {
    const due = task.due_date ? new Date(task.due_date) : null;
    return due && !Number.isNaN(due.getTime()) ? dueFormat.format(due) : '';
}

function load(): void {
    loadRoles();
    void loadOverview();
}

async function retry(): Promise<void> {
    if (!workspacesError.value) return loadOverview();
    await sidebar.refresh();
    load();
}

onMounted(load);

// --- New workspace -----------------------------------------------------------

const dialog = ref<InstanceType<typeof AppDialog> | null>(null);
const { busy: creating, run: runCreation } = useBusy();
const workspaceName = ref('');
const workspaceMessage = ref('');

async function submitWorkspace(): Promise<void> {
    const name = workspaceName.value.trim();
    if (!name) {
        workspaceMessage.value = 'Enter a workspace name.';
        return;
    }
    let created = false;
    await runCreation(async () => {
        workspaceMessage.value = '';
        const result = await createWorkspace(name);
        if (!mounted) return;
        if (!result.ok) {
            workspaceMessage.value = result.data.error;
            return;
        }
        await sidebar.refresh();
        created = true;
    });
    if (!created || !mounted) return;
    workspaceName.value = '';
    // The dialog refuses to close while the save is pending: wait for it to know it ended.
    await nextTick();
    dialog.value?.close();
    load();
}

const openWorkspace = (workspace: Workspace) => router.push({ name: 'workspace', params: { id: workspace.id } });
const openTask = (task: Task) => router.push({ name: 'task', params: { id: task.id } });
</script>

<template>
    <header class="page-heading page-heading-row">
        <div class="header-actions"><button id="new-workspace-button" type="button" class="btn-primary" @click="dialog?.open()">+ New workspace</button></div>
    </header>
    <section class="page-section" aria-labelledby="workspaces-heading">
        <div class="overview-toolbar">
            <div class="section-heading"><h2 id="workspaces-heading">All workspaces</h2><span class="count-badge">{{ workspacesError ? '—' : workspaces.length }}</span><span class="overview-total"><span id="overview-task-count">{{ taskCount }}</span> tasks</span></div>
            <div class="overview-filter"><label for="overview-status-filter">Status</label><select id="overview-status-filter" v-model="statusFilter"><option value="active">All unfinished</option><option value="all">All tasks</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="review">In review</option><option value="done">Done</option></select></div>
        </div>
        <FormMessage id="workspace-list-message" :text="workspacesError" />
        <div class="overview-feedback"><FormMessage id="overview-message" :text="overviewMessage" /><button id="retry-overview-button" class="btn-secondary" type="button" :hidden="loading || !incomplete" @click="retry">Retry</button></div>
        <div id="overview-tasks" :aria-busy="loading">
            <div id="workspace-cards" class="workspace-grid workspace-binders">
                <div v-if="!workspacesError && !workspaces.length" class="empty-state empty-state-panel"><h3>Your next project starts here</h3><p>Create a workspace to bring your team and tasks together.</p><button type="button" class="btn-secondary" @click="dialog?.open()">Create a workspace</button></div>
                <article
                    v-for="binder in binders" :key="binder.workspace.id" class="workspace-binder"
                    :data-workspace-id="binder.workspace.id" :data-color="colorOf(binder.workspace.color)"
                    :aria-labelledby="`workspace-title-${binder.workspace.id}`"
                >
                    <button type="button" class="workspace-card workspace-row" @click="openWorkspace(binder.workspace)">
                        <span class="workspace-card-heading"><span class="workspace-icon workspace-icon-large" :data-color="colorOf(binder.workspace.color)" aria-hidden="true"><template v-if="binder.workspace.icon_type === 'emoji' && binder.workspace.icon_value">{{ binder.workspace.icon_value }}</template><ProtectedImage v-else :path="binder.workspace.icon_type === 'image' ? binder.workspace.icon_value : null" :fallback="folderIcon" /></span><span :id="`workspace-title-${binder.workspace.id}`" class="item-name">{{ binder.workspace.name }}</span></span>
                        <span class="workspace-card-footer"><span class="item-detail role-badge" :title="roles.get(binder.workspace.id)?.unavailable ? 'Role unavailable' : undefined">{{ roles.get(binder.workspace.id)?.label }}</span><span class="card-link">Open workspace <img class="icon icon-chevron" :src="chevronIcon" width="16" height="16" alt="" aria-hidden="true"></span></span>
                    </button>
                    <div class="binder-content">
                        <div class="binder-tasks-heading"><h3>Tasks</h3><span class="count-badge binder-task-count">{{ binder.count }}</span></div>
                        <div class="binder-projects">
                            <p v-if="binder.message" class="binder-message" role="status">{{ binder.message }}</p>
                            <template v-else>
                                <section
                                    v-for="entry in binder.projects" :key="entry.project.id" class="binder-project"
                                    :data-project-id="entry.project.id" :aria-labelledby="entry.headingId"
                                >
                                    <div class="binder-project-heading"><img class="icon icon-folder" :src="folderIcon" width="16" height="16" alt=""><h4 :id="entry.headingId">{{ entry.project.name }}</h4><span class="binder-project-count">{{ entry.unavailable ? '—' : entry.tasks.length }}</span></div>
                                    <p v-if="entry.unavailable || !entry.tasks.length" class="binder-project-message">{{ entry.unavailable ? 'Tasks could not be loaded. Retry to load this project.' : emptyProjectMessage }}</p>
                                    <div v-else class="overview-task-list" role="list">
                                        <div v-for="task in entry.tasks" :key="task.id" role="listitem">
                                            <button
                                                type="button" class="overview-task-row" :data-task-id="task.id" :data-color="colorOf(task.color)"
                                                :aria-describedby="`workspace-title-${binder.workspace.id} ${entry.headingId}`" @click="openTask(task)"
                                            >
                                                <span class="overview-task-main"><span class="overview-task-title">{{ task.title }}</span><img class="icon icon-chevron" :src="chevronIcon" width="16" height="16" alt="" aria-hidden="true"></span>
                                                <span class="overview-task-meta"><span class="task-status" :data-status="task.status">{{ STATUS_LABELS[task.status] }}</span><span class="overview-priority">{{ PRIORITY_LABELS[task.priority] ?? task.priority }} priority</span><time v-if="dueLabel(task)" class="overview-due" :datetime="task.due_date ?? undefined">Due {{ dueLabel(task) }}</time><span v-else class="overview-due">No due date</span></span>
                                            </button>
                                        </div>
                                    </div>
                                </section>
                            </template>
                        </div>
                    </div>
                </article>
            </div>
        </div>
    </section>
    <AppDialog id="create-workspace-dialog" ref="dialog" title="New workspace" title-id="create-workspace-title" :busy="creating">
        <form id="create-workspace-form" class="dialog-body" @submit.prevent="submitWorkspace">
            <p class="secondary-text">Create a space for your team and its projects.</p>
            <div class="field">
                <label for="workspace-name-input">Workspace name</label>
                <input id="workspace-name-input" v-model="workspaceName" name="name" type="text" placeholder="e.g. Design studio" maxlength="50" required autofocus>
            </div>
            <FormMessage id="workspace-message" :text="workspaceMessage" />
            <div class="dialog-actions"><button id="cancel-workspace-button" type="button" class="btn-secondary" @click="dialog?.close()">Cancel</button><button type="submit" class="btn-primary" :disabled="creating" :aria-busy="creating || undefined">Create workspace</button></div>
        </form>
    </AppDialog>
</template>
