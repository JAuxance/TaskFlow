<script setup lang="ts">
// The details of a task. Same content and behavior as
// frontend/js/views/taskView.js, including the order in which saves are sent.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { getProject } from '../api/projects';
import { deleteTask, getTask, updateTask, type TaskChanges } from '../api/tasks';
import type { Project, Task } from '../api/types';
import FormMessage from '../components/FormMessage.vue';
import { useSerialQueue } from '../composables/useSerialQueue';
import { COLORS, COLOR_LABELS, colorOf } from '../domain';
import { describeScreen } from '../layout/state';
import { announcePage } from '../page';
import { fromDateTimeField, toDateTimeField } from '../task/dueDate';
import { useWorkspace } from '../workspace/useWorkspace';

type AutosavedField = 'status' | 'priority' | 'color';
type Feedback = { text: string; type: 'error' | 'success' | 'info' };

const route = useRoute();
const router = useRouter();
const taskId = Number(route.params.id);
const { workspace, members, membersError, role, load: loadWorkspace } = useWorkspace();

const project = ref<Project | null>(null);
const error = ref('');
/** The task as the server last confirmed it. */
const saved = ref<Task | null>(null);
const canEdit = computed(() => role.value === 'owner' || role.value === 'admin' || role.value === 'member');

// What the fields currently show; it runs ahead of `saved` until a save succeeds.
const fields = reactive({ title: '', description: '', status: 'todo', priority: 'medium', color: 'gray', assignee: '' });
const heading = ref('');
const dueField = ref<HTMLInputElement | null>(null);
const titleField = ref<HTMLInputElement | null>(null);
// Compared with what the browser shows, so an untouched date is never rewritten.
let savedDueField = '';
let savedAssignee = '';

const message = reactive<Feedback>({ text: '', type: 'error' });
const autosaveMessage = reactive<Feedback>({ text: '', type: 'error' });

let mounted = true;
onBeforeUnmount(() => { mounted = false; });

onMounted(async () => {
    const taskResult = await getTask(taskId);
    if (!mounted) return;
    if (!taskResult.ok) {
        error.value = taskResult.data.error;
        return;
    }
    const projectResult = await getProject(taskResult.data.project_id);
    if (!mounted) return;
    if (!projectResult.ok) {
        error.value = projectResult.data.error;
        return;
    }
    if (!await loadWorkspace(projectResult.data.workspace_id) || !mounted || !workspace.value) return;

    const task = taskResult.data;
    project.value = projectResult.data;
    saved.value = { ...task, color: colorOf(task.color) };
    Object.assign(fields, {
        title: task.title, description: task.description ?? '', status: task.status, priority: task.priority,
        color: colorOf(task.color), assignee: task.assignee_id == null ? '' : String(task.assignee_id),
    });
    heading.value = task.title;
    savedAssignee = fields.assignee;
    describeScreen([
        { label: 'Workspaces', to: { name: 'home' } },
        { label: workspace.value.name, to: { name: 'workspace', params: { id: workspace.value.id } } },
        { label: project.value.name, to: { name: 'project', params: { id: project.value.id } } },
        { label: 'Task details' },
    ], workspace.value.id);
    await nextTick();
    if (dueField.value) {
        dueField.value.value = toDateTimeField(task.due_date);
        savedDueField = dueField.value.value;
    }
    announcePage();
});

/** The assignee is no longer a member: still shown, so saving does not drop it silently. */
const assigneeUnavailable = computed(() => saved.value?.assignee_id != null
    && !(members.value ?? []).some(member => member.user_id === saved.value?.assignee_id));

// --- Saves, one at a time ----------------------------------------------------------

// The server saves a task by rewriting its whole row. Sending the saves one
// after the other keeps a status change and a form save from overwriting each other.
const queue = useSerialQueue();
const busy = reactive({ status: false, priority: false, color: false, save: false, remove: false, back: false });

// Counts the edits of the form, to tell when one was made during a save.
let editRevision = 0;
const edited = () => { editRevision += 1; };

async function autosave(field: AutosavedField): Promise<void> {
    if (!canEdit.value || busy.back || busy[field] || busy.remove || !saved.value) return;
    const value = fields[field];
    Object.assign(autosaveMessage, { text: 'Saving…', type: 'info' });
    busy[field] = true;
    try {
        await queue.enqueue(async () => {
            const result = await updateTask(taskId, { [field]: value } as TaskChanges);
            if (!mounted || !saved.value) return;
            if (result.ok) {
                Object.assign(saved.value, { [field]: value });
                Object.assign(autosaveMessage, { text: `${field[0]?.toUpperCase()}${field.slice(1)} saved.`, type: 'success' });
            } else {
                // Back to the last value the server confirmed.
                fields[field] = String(saved.value[field]);
                Object.assign(autosaveMessage, { text: result.data.error || `Unable to save ${field}. Please try again.`, type: 'error' });
            }
        });
    } finally {
        busy[field] = false;
    }
}

async function save(): Promise<void> {
    if (!canEdit.value || busy.back || busy.save || busy.remove || !saved.value) return;
    const title = fields.title.trim();
    if (!title) {
        Object.assign(message, { text: 'Enter a task title.', type: 'error' });
        titleField.value?.focus();
        return;
    }
    const revision = editRevision;
    const submittedDue = dueField.value?.value ?? '';
    const submittedAssignee = fields.assignee;
    // Only what changed is sent for the assignee and the date.
    const changes: TaskChanges = { title, description: fields.description };
    if (members.value !== null && submittedAssignee !== savedAssignee) {
        changes.assignee_id = submittedAssignee ? Number(submittedAssignee) : null;
    }
    if (submittedDue !== savedDueField) changes.due_date = fromDateTimeField(submittedDue, saved.value.due_date);
    message.text = '';
    busy.save = true;
    try {
        await queue.enqueue(async () => {
            const result = await updateTask(taskId, changes);
            if (!mounted || !saved.value) return;
            if (!result.ok) {
                Object.assign(message, { text: result.data.error || 'Unable to save the task.', type: 'error' });
                return;
            }
            Object.assign(saved.value, changes);
            heading.value = title;
            savedDueField = submittedDue;
            savedAssignee = submittedAssignee;
            Object.assign(message, {
                text: editRevision === revision ? 'Task saved.' : 'Saved. Your latest edits are still unsaved.', type: 'success',
            });
        });
    } finally {
        busy.save = false;
    }
}

const toProject = () => router.push({ name: 'project', params: { id: project.value?.id } });

async function remove(): Promise<void> {
    if (busy.back || busy.remove || busy.save) return;
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    busy.remove = true;
    try {
        const result = await queue.enqueue(() => deleteTask(taskId));
        if (!mounted) return;
        // Leaving waits for the queue: the navigation starts once the deletion is out of it.
        if (result.ok) await toProject();
        else Object.assign(message, { text: result.data.error || 'Unable to delete the task.', type: 'error' });
    } finally {
        busy.remove = false;
    }
}

/** Pending saves finish before the board is loaded, so it shows them. */
async function back(): Promise<void> {
    if (busy.back) return;
    busy.back = true;
    try {
        await queue.idle();
        if (mounted) await toProject();
    } finally {
        busy.back = false;
    }
}

// The same wait applies to every way out: breadcrumb, sidebar, browser history.
onBeforeRouteLeave(() => queue.idle());
</script>

<template>
    <FormMessage v-if="error" :text="error" />
    <template v-if="saved && project">
        <!-- While going back, nothing can be changed anymore: the queue is closing. -->
        <div class="page-heading page-heading-row" :inert="busy.back">
            <div class="heading-copy">
                <h1 class="task-heading-title">{{ heading }}</h1>
                <p class="secondary-text">{{ project.name }}</p>
            </div>
            <div class="header-actions">
                <button id="back-task-button" type="button" class="btn-secondary" :disabled="busy.back" :aria-busy="busy.back || undefined" @click="back">← Back to project</button>
                <button v-if="canEdit" id="save-task-button" type="submit" form="task-form" class="btn-primary" :disabled="busy.save" :aria-busy="busy.save || undefined">Save changes</button>
            </div>
        </div>
        <form id="task-form" class="task-form" :data-color="fields.color" :inert="busy.back" @submit.prevent="save">
            <div class="task-editor-main">
                <div class="field">
                    <label for="task-title">Title</label>
                    <input id="task-title" ref="titleField" v-model="fields.title" name="title" type="text" maxlength="100" required :disabled="!canEdit" @input="edited" @change="edited">
                </div>
                <div class="field task-description-field">
                    <label for="task-description">Description</label>
                    <textarea id="task-description" v-model="fields.description" name="description" rows="10" placeholder="Add details about this task…" :disabled="!canEdit" @input="edited" @change="edited" />
                </div>
                <p v-if="canEdit" class="secondary-text autosave-hint">Use Save changes to save the title, description and planning.</p>
                <FormMessage id="task-message" :text="message.text" :type="message.type" />
            </div>
            <div class="task-properties">
                <h2>Task properties</h2>
                <div class="task-property-group">
                    <div class="field-grid">
                        <div class="field">
                            <label for="task-status">Status</label>
                            <select id="task-status" v-model="fields.status" name="status" aria-describedby="task-autosave-hint" :disabled="!canEdit || busy.status" :aria-busy="busy.status || undefined" @change="autosave('status')">
                                <option value="todo">Todo</option>
                                <option value="in_progress">In Progress</option>
                                <option value="review">Review</option>
                                <option value="done">Done</option>
                            </select>
                        </div>
                        <div class="field">
                            <label for="task-priority">Priority</label>
                            <select id="task-priority" v-model="fields.priority" name="priority" aria-describedby="task-autosave-hint" :disabled="!canEdit || busy.priority" :aria-busy="busy.priority || undefined" @change="autosave('priority')">
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="urgent">Urgent</option>
                            </select>
                        </div>
                    </div>
                    <div class="field task-color-field">
                        <label for="task-color">Color</label>
                        <div class="color-control" :data-color="fields.color">
                            <span class="color-swatch" aria-hidden="true" />
                            <select id="task-color" v-model="fields.color" name="color" aria-describedby="task-autosave-hint" :disabled="!canEdit || busy.color" :aria-busy="busy.color || undefined" @change="autosave('color')">
                                <option v-for="value in COLORS" :key="value" :value="value">{{ COLOR_LABELS[value] }}</option>
                            </select>
                        </div>
                    </div>
                    <p id="task-autosave-hint" class="secondary-text autosave-hint">{{ canEdit ? 'Status, priority and color are saved automatically.' : 'You have read-only access to this task.' }}</p>
                    <FormMessage id="autosave-message" :text="autosaveMessage.text" :type="autosaveMessage.type" />
                </div>
                <div class="task-property-group">
                    <h3>Planning</h3>
                    <div class="field-grid">
                        <div class="field">
                            <label for="task-due-date">Due date</label>
                            <input id="task-due-date" ref="dueField" name="due_date" type="datetime-local" step="any" :disabled="!canEdit" @input="edited" @change="edited">
                        </div>
                        <div class="field">
                            <label for="task-assignee">Assignee</label>
                            <select id="task-assignee" v-model="fields.assignee" name="assignee_id" :disabled="!canEdit || members === null" @input="edited" @change="edited">
                                <option value="">Unassigned</option>
                                <option v-for="member in members ?? []" :key="member.user_id" :value="String(member.user_id)">{{ member.user_name }}</option>
                                <option v-if="assigneeUnavailable" :value="String(saved.assignee_id)">Current assignee (unavailable)</option>
                            </select>
                        </div>
                    </div>
                    <FormMessage id="assignee-message" :text="membersError ? 'Workspace members could not be loaded. The current assignee will be kept.' : ''" />
                </div>
                <div v-if="canEdit" class="task-danger-zone"><button id="delete-task-button" type="button" class="btn-danger" :disabled="busy.remove" :aria-busy="busy.remove || undefined" @click="remove">Delete task</button></div>
            </div>
        </form>
    </template>
</template>
