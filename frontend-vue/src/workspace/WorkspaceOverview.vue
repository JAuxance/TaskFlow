<script setup lang="ts">
// "Overview" tab: totals, projects with their progress, and the tasks to
// focus on. Same content as the first panel of frontend/js/views/workspaceView.js.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import chevronIcon from '../../../frontend/assets/icons/chevron.svg';
import folderIcon from '../../../frontend/assets/icons/folder.svg';
import { getProjects } from '../api/projects';
import { getTasks } from '../api/tasks';
import type { Project, Task, Workspace } from '../api/types';
import FormMessage from '../components/FormMessage.vue';
import { dueTime, formatShortDay } from '../dates';
import { colorOf } from '../domain';

interface ProjectRecord { project: Project; tasks: Task[]; state: 'loading' | 'loaded' | 'error' }
type Filter = 'active' | 'overdue' | 'in_progress' | 'review' | 'todo';

const OPEN_STATUSES: Record<string, string> = { todo: 'To do', in_progress: 'In progress', review: 'In review' };
const PRIORITIES: Record<string, string> = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' };
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const BATCH = 4;
const PAGE = 8;

const props = defineProps<{ workspace: Workspace; canManage: boolean; hidden: boolean }>();
const emit = defineEmits<{ createProject: [] }>();
const router = useRouter();

const records = ref<ProjectRecord[]>([]);
const projectsLoaded = ref(false);
const projectsError = ref('');
const loadingTasks = ref(false);
const filter = ref<Filter>('active');
const visibleCount = ref(PAGE);
// "Now" is read once per display, like the single render of the current frontend.
const now = ref(Date.now());

let mounted = true;
onBeforeUnmount(() => { mounted = false; });

async function loadTasks(): Promise<void> {
    if (loadingTasks.value) return;
    loadingTasks.value = true;
    const pending = records.value.filter(record => record.state !== 'loaded');
    for (const record of pending) record.state = 'loading';
    for (let offset = 0; offset < pending.length; offset += BATCH) {
        const batch = pending.slice(offset, offset + BATCH);
        const results = await Promise.all(batch.map(record => getTasks(record.project.id)));
        if (!mounted) return;
        results.forEach((result, index) => {
            const record = batch[index];
            if (!record) return;
            record.state = result.ok ? 'loaded' : 'error';
            record.tasks = result.ok ? result.data : [];
        });
    }
    now.value = Date.now();
    loadingTasks.value = false;
}

async function load(): Promise<void> {
    const result = await getProjects(props.workspace.id);
    if (!mounted) return;
    projectsLoaded.value = true;
    if (!result.ok) {
        projectsError.value = result.data.error || 'Could not load projects.';
        return;
    }
    records.value = result.data.map(project => ({ project, tasks: [], state: 'loading' }));
    void loadTasks();
}

onMounted(load);

// --- Projects ----------------------------------------------------------------

function progress(record: ProjectRecord) {
    const total = record.tasks.length;
    const done = record.tasks.filter(task => task.status === 'done').length;
    const open = record.tasks.filter(task => Object.hasOwn(OPEN_STATUSES, task.status));
    const overdue = open.filter(task => {
        const due = dueTime(task.due_date);
        return due !== null && due < now.value;
    }).length;
    return { total, done, open: open.length, overdue };
}

// --- Tasks to focus on -------------------------------------------------------

const incomplete = computed(() => records.value.some(record => record.state !== 'loaded'));
const failed = computed(() => records.value.filter(record => record.state === 'error').length);
const unfinished = computed(() => records.value.flatMap(record => record.state !== 'loaded' ? []
    : record.tasks.filter(task => Object.hasOwn(OPEN_STATUSES, task.status)).map(task => {
        const due = dueTime(task.due_date);
        return { task, project: record.project, due, overdue: due !== null && due < now.value };
    })));
const overdueCount = computed(() => unfinished.value.filter(item => item.overdue).length);
const formatCount = (count: number) => incomplete.value ? (count ? `${count}+` : '—') : String(count);
const countTitle = computed(() => incomplete.value
    ? "Some projects' tasks are still unavailable; this total is incomplete." : undefined);

const filtered = computed(() => unfinished.value
    .filter(item => filter.value === 'active' || (filter.value === 'overdue' ? item.overdue : item.task.status === filter.value))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue)
        || (a.due ?? Infinity) - (b.due ?? Infinity)
        || (PRIORITY_ORDER[a.task.priority] ?? 4) - (PRIORITY_ORDER[b.task.priority] ?? 4)
        || a.task.title.localeCompare(b.task.title)));

const taskMessage = computed<{ text: string; type: 'error' | 'info' }>(() => failed.value
    ? { text: `Could not load tasks for ${failed.value} ${failed.value === 1 ? 'project' : 'projects'}. Totals and the task list are incomplete.`, type: 'error' }
    : { text: loadingTasks.value ? 'Loading tasks… Totals and the task list are still incomplete.' : '', type: 'info' });

const emptyText = computed(() => {
    if (loadingTasks.value) return 'Loading tasks…';
    if (incomplete.value) return 'No matching tasks in the projects loaded so far. Retry to load the missing projects.';
    if (!records.value.length) return 'Tasks will appear here once your first project is ready.';
    if (filter.value === 'active') return 'No unfinished tasks. Your workspace is up to date.';
    if (filter.value === 'overdue') return 'No overdue tasks.';
    return `No tasks ${filter.value === 'in_progress' ? 'in progress' : filter.value === 'review' ? 'in review' : 'to do'}.`;
});

function changeFilter(): void {
    visibleCount.value = PAGE;
}

const openProject = (project: Project) => router.push({ name: 'project', params: { id: project.id } });
const openTask = (task: Task) => router.push({ name: 'task', params: { id: task.id } });
</script>

<template>
    <section id="panel-projects" class="tab-panel" role="tabpanel" aria-labelledby="tab-projects" tabindex="0" :data-color="colorOf(workspace.color)" :hidden="hidden">
        <div class="workspace-summary" aria-label="Workspace totals">
            <div class="workspace-stat"><span>Projects</span><strong id="workspace-project-count">{{ projectsLoaded && !projectsError ? records.length : '—' }}</strong></div>
            <div class="workspace-stat"><span>Open tasks</span><strong id="workspace-open-count" :title="countTitle">{{ projectsLoaded && !projectsError ? formatCount(unfinished.length) : '—' }}</strong></div>
            <div class="workspace-stat"><span>Overdue</span><strong id="workspace-overdue-count" :title="countTitle" :data-alert="projectsLoaded && !projectsError ? overdueCount > 0 : undefined">{{ projectsLoaded && !projectsError ? formatCount(overdueCount) : '—' }}</strong></div>
        </div>
        <div class="workspace-overview">
            <section class="workspace-projects" aria-labelledby="workspace-projects-heading">
                <div class="section-heading"><h2 id="workspace-projects-heading">Projects</h2></div>
                <FormMessage id="project-message" :text="projectsError" />
                <div id="projects-list" class="workspace-project-list" :aria-busy="!projectsLoaded">
                    <p v-if="!projectsLoaded" class="empty-state" role="status">Loading projects…</p>
                    <div v-else-if="!projectsError && !records.length" class="empty-state empty-state-panel"><h3>No projects yet</h3><p>{{ canManage ? "Create your first project to start organizing your team's work." : 'Projects will appear here when a workspace manager creates them.' }}</p><button v-if="canManage" id="empty-create-project-button" type="button" class="btn-secondary" @click="emit('createProject')">Create a project</button></div>
                    <button
                        v-for="record in records" :key="record.project.id" type="button" class="project-card workspace-project-card"
                        :data-project-id="record.project.id" @click="openProject(record.project)"
                    >
                        <span class="project-card-icon"><img class="icon icon-folder" :src="folderIcon" width="24" height="24" alt=""></span>
                        <span class="project-card-copy"><span class="item-name">{{ record.project.name }}</span><span class="project-card-description">{{ record.project.description || 'No description yet.' }}</span></span>
                        <span class="workspace-project-progress">
                            <span v-if="record.state !== 'loaded'" class="workspace-project-detail">{{ record.state === 'loading' ? 'Loading task progress…' : 'Task progress unavailable' }}</span>
                            <template v-else>
                                <span class="workspace-project-detail">{{ progress(record).total ? `${progress(record).done} of ${progress(record).total} tasks done` : 'No tasks yet' }}</span>
                                <progress :value="progress(record).done" :max="Math.max(progress(record).total, 1)" :aria-label="`${record.project.name}: ${progress(record).done} of ${progress(record).total} tasks done`" />
                                <span class="workspace-project-detail">{{ progress(record).open }} open{{ progress(record).overdue ? ` · ${progress(record).overdue} overdue` : '' }}</span>
                            </template>
                        </span>
                        <span class="project-card-footer">Open project <img class="icon icon-chevron" :src="chevronIcon" width="16" height="16" alt=""></span>
                    </button>
                </div>
            </section>
            <section class="workspace-focus" aria-labelledby="workspace-focus-heading">
                <div class="section-heading"><div><h2 id="workspace-focus-heading">Tasks to focus on</h2><p class="section-description">Upcoming work across this workspace.</p></div></div>
                <div class="field workspace-task-filter-field">
                    <label for="workspace-task-filter">Show tasks</label>
                    <select id="workspace-task-filter" v-model="filter" @change="changeFilter">
                        <option value="active">All unfinished</option>
                        <option value="overdue">Overdue</option>
                        <option value="in_progress">In progress</option>
                        <option value="review">In review</option>
                        <option value="todo">To do</option>
                    </select>
                </div>
                <FormMessage id="workspace-task-message" :text="projectsError ? '' : taskMessage.text" :type="taskMessage.type" />
                <button id="retry-workspace-tasks" class="btn-secondary" type="button" :hidden="projectsError ? false : failed === 0" :disabled="loadingTasks" @click="projectsError ? load() : loadTasks()">{{ projectsError ? 'Retry loading workspace' : 'Retry loading tasks' }}</button>
                <div id="workspace-focus-list" class="workspace-focus-list" role="list" :aria-busy="projectsLoaded ? loadingTasks : true">
                    <p v-if="!projectsLoaded" class="empty-state" role="status">Loading tasks…</p>
                    <p v-else-if="projectsError" class="empty-state">Tasks are unavailable until projects can be loaded.</p>
                    <template v-else>
                        <p v-if="!filtered.length" class="empty-state">{{ emptyText }}</p>
                        <div v-for="item in filtered.slice(0, visibleCount)" :key="item.task.id" class="workspace-focus-item" role="listitem">
                            <button
                                type="button" class="workspace-focus-task" :data-task-id="item.task.id" :data-project-id="item.project.id"
                                :data-color="colorOf(item.task.color)" :data-status="item.task.status" @click="openTask(item.task)"
                            >
                                <span class="workspace-focus-title">{{ item.task.title }}</span>
                                <span class="workspace-focus-meta">
                                    <span class="workspace-focus-project">{{ item.project.name }}</span>
                                    <span class="task-status" :data-status="item.task.status">{{ OPEN_STATUSES[item.task.status] }}</span>
                                    <span v-if="PRIORITIES[item.task.priority]" class="task-priority" :data-priority="item.task.priority">{{ PRIORITIES[item.task.priority] }}</span>
                                    <time v-if="item.due !== null" :datetime="item.task.due_date ?? undefined" :data-overdue="item.overdue">{{ item.overdue ? 'Overdue · ' : 'Due ' }}{{ formatShortDay(item.due) }}</time>
                                    <span v-else class="workspace-focus-due">No due date</span>
                                </span>
                            </button>
                        </div>
                    </template>
                </div>
                <button id="show-more-workspace-tasks" class="btn-secondary" type="button" :hidden="projectsError !== '' || filtered.length <= visibleCount" @click="visibleCount += PAGE">Show more ({{ Math.max(0, filtered.length - visibleCount) }})</button>
            </section>
        </div>
    </section>
</template>
