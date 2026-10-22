<script setup lang="ts">
// A project as a Kanban board: one column per status, ordered by priority.
// Open a task to change its status or priority, then save the form.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { deleteProject, getProject, updateProject } from '../api/projects';
import { createTask, getTasks } from '../api/tasks';
import type { Project, Task, TaskStatus } from '../api/types';
import AppDialog from '../components/AppDialog.vue';
import FormMessage from '../components/FormMessage.vue';
import { useBusy } from '../composables/useBusy';
import { formatShortDay } from '../dates';
import { COLORS, COLOR_LABELS, colorOf, type Color } from '../domain';
import { describeScreen } from '../layout/state';
import { announcePage } from '../page';
import { sortForBoard } from '../task/board';
import { useWorkspace } from '../workspace/useWorkspace';

const STATUSES: [TaskStatus, string][] = [
    ['todo', 'Todo'], ['in_progress', 'In Progress'], ['review', 'Review'], ['done', 'Done'],
];
const PRIORITIES: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };

const route = useRoute();
const router = useRouter();
const projectId = Number(route.params.id);
const { workspace, members, role, load: loadWorkspace } = useWorkspace();

const project = ref<Project | null>(null);
const error = ref('');
const canEditProject = computed(() => role.value === 'owner' || role.value === 'admin');
const canEditTasks = computed(() => canEditProject.value || role.value === 'member');

let mounted = true;
onBeforeUnmount(() => { mounted = false; });

function describe(): void {
    if (!project.value || !workspace.value) return;
    describeScreen([
        { label: workspace.value.name, to: { name: 'workspace', params: { id: workspace.value.id } } },
        { label: project.value.name },
    ], workspace.value.id);
}

onMounted(async () => {
    const result = await getProject(projectId);
    if (!mounted) return;
    if (!result.ok) {
        error.value = result.data.error;
        return;
    }
    if (!await loadWorkspace(result.data.workspace_id) || !mounted) return;
    project.value = result.data;
    describe();
    await nextTick();
    announcePage();
    await loadTasks();
});

// --- Tasks ---------------------------------------------------------------------

/** null until the tasks have been read once. */
const tasks = ref<Task[] | null>(null);
const tasksFailed = ref(false);
const tasksMessage = ref('');
let loadVersion = 0;

async function loadTasks(): Promise<void> {
    const version = ++loadVersion;
    const result = await getTasks(projectId);
    if (!mounted || version !== loadVersion) return;
    tasksFailed.value = !result.ok;
    if (!result.ok) {
        // Cards and counts already displayed stay; empty columns say why they are empty.
        tasksMessage.value = result.data.error || 'Unable to load tasks. Please open this project again.';
        return;
    }
    tasksMessage.value = '';
    tasks.value = result.data;
}

const columns = computed(() => STATUSES.map(([status, label]) => ({
    status, label, tasks: sortForBoard((tasks.value ?? []).filter(task => task.status === status)),
})));

function assigneeName(task: Task): string {
    if (task.assignee_id == null) return 'Unassigned';
    return members.value?.find(member => member.user_id === task.assignee_id)?.user_name || 'Member unavailable';
}

function dueLabel(task: Task): string {
    if (!task.due_date) return '';
    // A stored date without a zone is a local calendar date, not UTC.
    const date = new Date(task.due_date);
    return Number.isNaN(date.getTime()) ? '' : formatShortDay(date);
}

const openTask = (task: Task) => router.push({ name: 'task', params: { id: task.id } });

// --- New task ------------------------------------------------------------------

const taskDialog = ref<InstanceType<typeof AppDialog> | null>(null);
const { busy: creating, run: runCreation } = useBusy();
const newTitle = ref('');
const newColor = ref<Color>('gray');
const createMessage = ref('');

async function submitTask(): Promise<void> {
    const entered = newTitle.value;
    const title = entered.trim();
    if (!title) {
        createMessage.value = 'Enter a task title.';
        return;
    }
    let created = false;
    await runCreation(async () => {
        createMessage.value = '';
        const result = await createTask(projectId, title, newColor.value);
        if (!mounted) return;
        if (!result.ok) {
            createMessage.value = result.data.error || 'Unable to create the task.';
            return;
        }
        created = true;
    });
    if (!created || !mounted) return;
    // A title typed while the request was pending is kept for the next task.
    if (newTitle.value === entered) newTitle.value = '';
    await nextTick();
    taskDialog.value?.close();
    await loadTasks();
}

// --- Project settings ------------------------------------------------------------

const settingsDialog = ref<InstanceType<typeof AppDialog> | null>(null);
const { busy: saving, run: runSettings } = useBusy();
const editedName = ref('');
const editedDescription = ref('');
const settingsMessage = ref('');

function openSettings(): void {
    editedName.value = project.value?.name ?? '';
    editedDescription.value = project.value?.description ?? '';
    settingsDialog.value?.open();
}

async function saveSettings(): Promise<void> {
    const name = editedName.value.trim();
    if (!name) {
        settingsMessage.value = 'Enter a project name.';
        return;
    }
    let saved = false;
    await runSettings(async () => {
        const result = await updateProject(projectId, { name, description: editedDescription.value });
        if (!mounted) return;
        if (!result.ok) {
            settingsMessage.value = result.data.error || 'Unable to save the project.';
            return;
        }
        project.value = result.data;
        saved = true;
    });
    if (!saved || !mounted) return;
    settingsMessage.value = '';
    describe();
    await nextTick();
    settingsDialog.value?.close();
    announcePage();
    await loadTasks();
}

function removeProject() {
    if (!window.confirm('Delete this project and all its tasks? This cannot be undone.')) return;
    return runSettings(async () => {
        const result = await deleteProject(projectId);
        if (!mounted) return;
        if (result.ok && workspace.value) await router.push({ name: 'workspace', params: { id: workspace.value.id } });
        else if (!result.ok) settingsMessage.value = result.data.error || 'Unable to delete the project.';
    });
}
</script>

<template>
    <FormMessage v-if="error" :text="error" />
    <template v-if="project">
        <div class="page-heading page-heading-row">
            <div class="heading-copy">
                <h1>{{ project.name }}</h1>
            </div>
            <div class="header-actions">
                <button v-if="canEditProject" id="project-settings-button" type="button" class="btn-secondary" @click="openSettings">Project settings</button>
                <button v-if="canEditTasks" id="new-task-button" type="button" class="btn-primary" @click="taskDialog?.open()">New task</button>
            </div>
        </div>
        <FormMessage id="tasks-message" :text="tasksMessage" />
        <div class="kanban-board" aria-label="Project task board">
            <section
                v-for="column in columns" :key="column.status" class="kanban-column"
                :data-status="column.status" :aria-labelledby="`heading-${column.status}`"
            >
                <h2 :id="`heading-${column.status}`" class="kanban-heading">{{ column.label }}<span v-if="tasks === null" class="kanban-count" aria-label="Loading tasks">—</span><span v-else class="kanban-count" :aria-label="`${column.tasks.length} ${column.tasks.length === 1 ? 'task' : 'tasks'}`">{{ column.tasks.length }}</span></h2>
                <div class="task-cards">
                    <p v-if="tasksFailed && !column.tasks.length" class="empty-state">Tasks unavailable</p>
                    <p v-else-if="tasks === null" class="empty-state">Loading tasks…</p>
                    <p v-else-if="!column.tasks.length" class="empty-state">No tasks yet.</p>
                    <template v-for="task in column.tasks" :key="task.id">
                        <button
                            type="button" class="task-card" :data-task-id="task.id" :data-color="colorOf(task.color)"
                            @click="openTask(task)"
                        >
                            <span class="task-card-title">{{ task.title }}</span>
                            <span class="task-priority" :data-priority="task.priority">{{ PRIORITIES[task.priority] ?? task.priority }} priority</span>
                            <span class="task-meta">
                                <span class="task-assignee">{{ assigneeName(task) }}</span>
                                <time v-if="dueLabel(task)" :datetime="task.due_date ?? undefined" :title="task.due_date ?? undefined">{{ dueLabel(task) }}</time>
                            </span>
                        </button>
                    </template>
                </div>
            </section>
        </div>

        <AppDialog v-if="canEditTasks" id="create-task-dialog" ref="taskDialog" title="New task" title-id="create-task-heading" close-label="Close new task" :busy="creating">
            <form id="create-task-form" class="dialog-body" @submit.prevent="submitTask">
                <div class="field">
                    <label for="task-title-input">Task title</label>
                    <input id="task-title-input" v-model="newTitle" name="title" type="text" placeholder="Enter a task title" maxlength="100" required autofocus>
                </div>
                <div class="field task-color-field">
                    <label for="new-task-color">Color</label>
                    <div class="color-control" :data-color="newColor">
                        <span class="color-swatch" aria-hidden="true" />
                        <select id="new-task-color" v-model="newColor" name="color">
                            <option v-for="value in COLORS" :key="value" :value="value">{{ COLOR_LABELS[value] }}</option>
                        </select>
                    </div>
                </div>
                <FormMessage id="create-task-message" :text="createMessage" />
                <div class="dialog-actions">
                    <button type="button" class="btn-secondary" data-close-dialog @click="taskDialog?.close()">Cancel</button>
                    <button type="submit" class="btn-primary" :disabled="creating" :aria-busy="creating || undefined">Create task</button>
                </div>
            </form>
        </AppDialog>

        <AppDialog v-if="canEditProject" id="project-settings-dialog" ref="settingsDialog" title="Project settings" title-id="project-settings-heading" close-label="Close project settings" :busy="saving">
            <form id="project-settings-form" class="dialog-body" @submit.prevent="saveSettings">
                <div class="field">
                    <label for="project-name">Project name</label>
                    <input id="project-name" v-model="editedName" name="name" type="text" maxlength="50" required autofocus>
                </div>
                <div class="field">
                    <label for="project-description">Description</label>
                    <textarea id="project-description" v-model="editedDescription" name="description" rows="3" />
                </div>
                <FormMessage id="project-message" :text="settingsMessage" />
                <div class="dialog-actions">
                    <button type="button" class="btn-secondary" data-close-dialog @click="settingsDialog?.close()">Cancel</button>
                    <button id="save-project-button" type="submit" class="btn-primary" :disabled="saving" :aria-busy="saving || undefined">Save changes</button>
                </div>
                <div class="danger-zone">
                    <div>
                        <h3>Delete project</h3>
                        <p class="secondary-text">Permanently delete this project and all its tasks.</p>
                    </div>
                    <button id="delete-project-button" type="button" class="btn-danger" :disabled="saving" @click="removeProject">Delete project</button>
                </div>
            </form>
        </AppDialog>
    </template>
</template>
