<script setup lang="ts">
// A task is edited locally, then saved explicitly in one request.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { getProject } from '../api/projects';
import { deleteTask, getTask, updateTask, type TaskChanges } from '../api/tasks';
import type { Project, Task } from '../api/types';
import FormMessage from '../components/FormMessage.vue';
import { COLORS, COLOR_LABELS, colorOf } from '../domain';
import { describeScreen } from '../layout/state';
import { announcePage } from '../page';
import { fromDateTimeField, toDateTimeField } from '../task/dueDate';
import { useWorkspace } from '../workspace/useWorkspace';

const route = useRoute();
const router = useRouter();
const taskId = Number(route.params.id);
const { workspace, members, membersError, role, load: loadWorkspace } = useWorkspace();
const project = ref<Project | null>(null);
const saved = ref<Task | null>(null);
const error = ref('');
const busy = ref(false);
const canEdit = computed(() => ['owner', 'admin', 'member'].includes(role.value ?? ''));
const fields = reactive({ title: '', description: '', status: 'todo', priority: 'medium', color: 'gray', assignee: '', due: '' });
const original = ref({ ...fields });
const dirty = computed(() => saved.value !== null && JSON.stringify(fields) !== JSON.stringify(original.value));
const dueField = ref<HTMLInputElement | null>(null);
const titleField = ref<HTMLInputElement | null>(null);
const heading = computed(() => saved.value?.title ?? '');
const message = reactive<{ text: string; type: 'error' | 'success' }>({ text: '', type: 'error' });
let mounted = true;

async function showTask(task: Task): Promise<void> {
    saved.value = task;
    Object.assign(fields, {
        title: task.title, description: task.description ?? '', status: task.status,
        priority: task.priority, color: colorOf(task.color),
        assignee: task.assignee_id == null ? '' : String(task.assignee_id), due: toDateTimeField(task.due_date),
    });
    await nextTick();
    // Browsers normalize datetime-local values; compare with what the input actually displays.
    if (dueField.value) fields.due = dueField.value.value;
    original.value = { ...fields };
}

onMounted(async () => {
    window.addEventListener('beforeunload', beforeUnload);
    const result = await getTask(taskId);
    if (!mounted) return;
    if (!result.ok) { error.value = result.data.error; return; }
    const projectResult = await getProject(result.data.project_id);
    if (!mounted) return;
    if (!projectResult.ok) { error.value = projectResult.data.error; return; }
    if (!await loadWorkspace(projectResult.data.workspace_id) || !mounted || !workspace.value) return;
    project.value = projectResult.data;
    await showTask(result.data);
    describeScreen([
        { label: workspace.value.name, to: { name: 'workspace', params: { id: workspace.value.id } } },
        { label: project.value.name, to: { name: 'project', params: { id: project.value.id } } },
        { label: 'Task details' },
    ], workspace.value.id);
    announcePage();
});

const assigneeUnavailable = computed(() => saved.value?.assignee_id != null
    && !(members.value ?? []).some(member => member.user_id === saved.value?.assignee_id));

async function save(): Promise<void> {
    if (!canEdit.value || busy.value || !saved.value) return;
    const title = fields.title.trim();
    if (!title) {
        Object.assign(message, { text: 'Enter a task title.', type: 'error' });
        titleField.value?.focus();
        return;
    }
    // Send only edits made in this form. Unchanged fields may have been edited by someone else.
    const changes: TaskChanges = {};
    if (title !== original.value.title) changes.title = title;
    if (fields.description !== original.value.description) changes.description = fields.description;
    if (fields.status !== original.value.status) changes.status = fields.status as Task['status'];
    if (fields.priority !== original.value.priority) changes.priority = fields.priority as Task['priority'];
    if (fields.color !== original.value.color) changes.color = fields.color;
    if (members.value !== null && fields.assignee !== original.value.assignee) {
        changes.assignee_id = fields.assignee ? Number(fields.assignee) : null;
    }
    if (fields.due !== original.value.due) changes.due_date = fromDateTimeField(fields.due, saved.value.due_date);
    if (!Object.keys(changes).length) {
        fields.title = title;
        Object.assign(message, { text: 'No changes to save.', type: 'success' });
        return;
    }
    busy.value = true;
    message.text = '';
    try {
        const result = await updateTask(taskId, changes);
        if (!mounted) return;
        if (!result.ok) { Object.assign(message, { text: result.data.error, type: 'error' }); return; }
        await showTask(result.data);
        Object.assign(message, { text: 'Task saved.', type: 'success' });
    } finally { busy.value = false; }
}

const back = () => router.push({ name: 'project', params: { id: project.value?.id } });

async function remove(): Promise<void> {
    if (!canEdit.value || busy.value || !window.confirm('Delete this task? This cannot be undone.')) return;
    busy.value = true;
    try {
        const result = await deleteTask(taskId);
        if (!mounted) return;
        if (!result.ok) { Object.assign(message, { text: result.data.error, type: 'error' }); return; }
        saved.value = null;
        busy.value = false;
        await back();
    } finally { busy.value = false; }
}

function beforeUnload(event: BeforeUnloadEvent): void {
    if (!dirty.value && !busy.value) return;
    event.preventDefault();
    event.returnValue = '';
}
onBeforeRouteLeave(to => {
    // An expired session must still be allowed to return to the login screen.
    if (to.name === 'login') return true;
    if (busy.value) return false;
    return !dirty.value || window.confirm('Discard your unsaved task changes?');
});
onBeforeUnmount(() => {
    mounted = false;
    window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<template>
    <FormMessage v-if="error" :text="error" />
    <template v-if="saved && project">
        <div class="page-heading page-heading-row">
            <div class="heading-copy">
                <h1 class="task-heading-title">{{ heading }}</h1>
                <p class="secondary-text">{{ project.name }}</p>
            </div>
            <div class="header-actions">
                <button id="back-task-button" type="button" class="btn-secondary" :disabled="busy" :aria-busy="busy || undefined" @click="back">← Back to project</button>
                <button v-if="canEdit" id="save-task-button" type="submit" form="task-form" class="btn-primary" :disabled="busy" :aria-busy="busy || undefined">Save changes</button>
            </div>
        </div>
        <form id="task-form" class="task-form" :data-color="fields.color" @submit.prevent="save">
            <div class="task-editor-main">
                <div class="field">
                    <label for="task-title">Title</label>
                    <input id="task-title" ref="titleField" v-model="fields.title" name="title" type="text" maxlength="100" required :disabled="!canEdit || busy">
                </div>
                <div class="field task-description-field">
                    <label for="task-description">Description</label>
                    <textarea id="task-description" v-model="fields.description" name="description" rows="10" placeholder="Add details about this task…" :disabled="!canEdit || busy" />
                </div>
                <p v-if="canEdit" class="secondary-text save-hint">Use Save changes to save all task properties.</p>
                <FormMessage id="task-message" :text="message.text" :type="message.type" />
            </div>
            <div class="task-properties">
                <h2>Task properties</h2>
                <div class="task-property-group">
                    <div class="field-grid">
                        <div class="field">
                            <label for="task-status">Status</label>
                            <select id="task-status" v-model="fields.status" name="status" :disabled="!canEdit || busy">
                                <option value="todo">Todo</option>
                                <option value="in_progress">In Progress</option>
                                <option value="review">Review</option>
                                <option value="done">Done</option>
                            </select>
                        </div>
                        <div class="field">
                            <label for="task-priority">Priority</label>
                            <select id="task-priority" v-model="fields.priority" name="priority" :disabled="!canEdit || busy">
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
                            <select id="task-color" v-model="fields.color" name="color" :disabled="!canEdit || busy">
                                <option v-for="value in COLORS" :key="value" :value="value">{{ COLOR_LABELS[value] }}</option>
                            </select>
                        </div>
                    </div>
                    <p v-if="!canEdit" class="secondary-text">You have read-only access to this task.</p>
                </div>
                <div class="task-property-group">
                    <h3>Planning</h3>
                    <div class="field-grid">
                        <div class="field">
                            <label for="task-due-date">Due date</label>
                            <input id="task-due-date" ref="dueField" v-model="fields.due" name="due_date" type="datetime-local" step="any" :disabled="!canEdit || busy">
                        </div>
                        <div class="field">
                            <label for="task-assignee">Assignee</label>
                            <select id="task-assignee" v-model="fields.assignee" name="assignee_id" :disabled="!canEdit || busy || members === null">
                                <option value="">Unassigned</option>
                                <option v-for="member in members ?? []" :key="member.user_id" :value="String(member.user_id)">{{ member.user_name }}</option>
                                <option v-if="assigneeUnavailable" :value="String(saved.assignee_id)">Current assignee (unavailable)</option>
                            </select>
                        </div>
                    </div>
                    <FormMessage id="assignee-message" :text="membersError ? 'Workspace members could not be loaded. The current assignee will be kept.' : ''" />
                </div>
                <div v-if="canEdit" class="task-danger-zone"><button id="delete-task-button" type="button" class="btn-danger" :disabled="busy" :aria-busy="busy || undefined" @click="remove">Delete task</button></div>
            </div>
        </form>
    </template>
</template>
