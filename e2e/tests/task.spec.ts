import type { Page, Route } from '@playwright/test';
import {
    expect, kanbanColumn, openProject, openTask, openWorkspace, reloadApp, test, type ActorFactory,
} from '../support/test';
import { addMember, api, createProject, createTask, createWorkspace, type Task } from '../support/api';

async function openEmptyBoard(actor: ActorFactory) {
    const { page, request } = await actor('alice');
    const workspace = await createWorkspace(request, 'Design studio');
    await createProject(request, workspace.id, 'Website redesign');
    await reloadApp(page);
    await openWorkspace(page, 'Design studio');
    await openProject(page, 'Website redesign');
    return page;
}

/** Alice on the details of a new task, with the request context to check the server. */
async function openNewTask(actor: ActorFactory) {
    const alice = await actor('alice');
    const workspace = await createWorkspace(alice.request, 'Design studio');
    const project = await createProject(alice.request, workspace.id, 'Website redesign');
    const task = await createTask(alice.request, project.id, { title: 'Write the brief' });
    await reloadApp(alice.page);
    await openWorkspace(alice.page, 'Design studio');
    await openProject(alice.page, 'Website redesign');
    await openTask(alice.page, 'todo', 'Write the brief');
    return { ...alice, workspace, project, task };
}

const status = (page: Page) => page.getByLabel('Status', { exact: true });
const priority = (page: Page) => page.getByLabel('Priority', { exact: true });

/** Intercept the saves of a task: `handle` receives each PATCH. */
async function onTaskSave(page: Page, handle: (route: Route) => Promise<void>) {
    await page.route('**/api/tasks/*', route => route.request().method() === 'PATCH' ? handle(route) : route.fallback());
}

test('a member creates a task and edits it from the board', async ({ actor }) => {
    const page = await openEmptyBoard(actor);
    for (const column of ['todo', 'in_progress', 'review', 'done']) {
        await expect(kanbanColumn(page, column)).toContainText('No tasks yet.');
    }

    await page.getByRole('button', { name: 'New task' }).click();
    const dialog = page.getByRole('dialog', { name: 'New task' });
    await dialog.getByLabel('Task title').fill('Write the brief');
    await dialog.getByRole('button', { name: 'Create task' }).click();

    // A new task starts in the first column with the default priority.
    const card = kanbanColumn(page, 'todo').getByRole('button', { name: /Write the brief/ });
    await expect(card).toContainText('Medium priority');
    await expect(card).toContainText('Unassigned');
    await expect(kanbanColumn(page, 'todo').locator('.kanban-count')).toHaveText('1');

    await openTask(page, 'todo', 'Write the brief');

    // All properties stay local until the explicit save.
    await status(page).selectOption('in_progress');
    await priority(page).selectOption('high');

    // The same request also saves title and description.
    await page.getByLabel('Title', { exact: true }).fill('Write the creative brief');
    await page.getByLabel('Description', { exact: true }).fill('Audience, tone and deliverables.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Task saved.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Write the creative brief' })).toBeVisible();

    await page.getByRole('button', { name: 'Back to project' }).click();
    const moved = kanbanColumn(page, 'in_progress').getByRole('button', { name: /Write the creative brief/ });
    await expect(moved).toContainText('High priority');
    await expect(kanbanColumn(page, 'todo')).toContainText('No tasks yet.');

    // Everything was stored by the server: a fresh page shows the same task.
    await reloadApp(page);
    const row = page.locator('#workspace-focus-list').getByRole('button', { name: /Write the creative brief/ });
    await expect(row).toContainText('In progress');
    await expect(row).toContainText('High');
    await row.click();
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Audience, tone and deliverables.');
    await expect(status(page)).toHaveValue('in_progress');
});

test('a task needs a title and can be deleted', async ({ actor }) => {
    const page = await openEmptyBoard(actor);
    await page.getByRole('button', { name: 'New task' }).click();
    const dialog = page.getByRole('dialog', { name: 'New task' });
    await dialog.getByLabel('Task title').fill('   ');
    await dialog.getByRole('button', { name: 'Create task' }).click();
    await expect(dialog.getByText('Enter a task title.')).toBeVisible();

    await dialog.getByLabel('Task title').fill('Temporary task');
    await dialog.getByRole('button', { name: 'Create task' }).click();
    await openTask(page, 'todo', 'Temporary task');

    page.once('dialog', confirmation => confirmation.dismiss());
    await page.getByRole('button', { name: 'Delete task' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Temporary task' })).toBeVisible();

    page.once('dialog', confirmation => confirmation.accept());
    await page.getByRole('button', { name: 'Delete task' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Website redesign' })).toBeVisible();
    await expect(kanbanColumn(page, 'todo')).toContainText('No tasks yet.');
});

test('color, assignee and due date are shown on the card', async ({ actor }) => {
    const alice = await openNewTask(actor);
    await actor('bob');
    await addMember(alice.request, alice.workspace.id, 'bob', 'member');
    const page = alice.page;
    // The assignee list is read when the task opens: open it again with the new member.
    await page.getByRole('button', { name: 'Back to project' }).click();
    await reloadApp(page);
    await openWorkspace(page, 'Design studio');
    await openProject(page, 'Website redesign');
    await openTask(page, 'todo', 'Write the brief');

    await page.getByLabel('Color', { exact: true }).selectOption('purple');
    await expect(page.locator('#task-form')).toHaveAttribute('data-color', 'purple');
    await page.getByLabel('Assignee', { exact: true }).selectOption({ label: 'bob' });
    await page.getByLabel('Due date', { exact: true }).fill('2026-10-20T09:30');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Task saved.')).toBeVisible();

    await page.getByRole('button', { name: 'Back to project' }).click();
    const card = kanbanColumn(page, 'todo').getByRole('button', { name: /Write the brief/ });
    await expect(card).toHaveAttribute('data-color', 'purple');
    await expect(card).toContainText('bob');
    await expect(card).toContainText('20 Oct');

    // The date is stored as typed, and clearing the fields clears them on the server.
    const stored = await api<Task & { due_date: string; assignee_id: number | null }>(alice.request, 'GET', `/api/tasks/${alice.task.id}`);
    expect(stored.due_date).toContain('2026-10-20T09:30');
    await card.click();
    await page.getByLabel('Assignee', { exact: true }).selectOption({ label: 'Unassigned' });
    await page.getByLabel('Due date', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Task saved.')).toBeVisible();
    const cleared = await api<{ due_date: string | null; assignee_id: number | null }>(alice.request, 'GET', `/api/tasks/${alice.task.id}`);
    expect(cleared).toMatchObject({ due_date: null, assignee_id: null });
});

test('all properties are saved together, only after clicking Save', async ({ actor }) => {
    const { page, request, task } = await openNewTask(actor);
    const patches: Record<string, unknown>[] = [];
    await onTaskSave(page, async route => {
        patches.push(route.request().postDataJSON());
        await route.continue();
    });
    await status(page).selectOption('review');
    await priority(page).selectOption('urgent');
    await page.getByLabel('Title', { exact: true }).fill('Final brief');
    expect(patches).toEqual([]);
    expect(await api<Task>(request, 'GET', `/api/tasks/${task.id}`)).toMatchObject({ status: 'todo', title: 'Write the brief' });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Task saved.')).toBeVisible();
    expect(patches).toEqual([{ title: 'Final brief', status: 'review', priority: 'urgent' }]);
    expect(await api<Task>(request, 'GET', `/api/tasks/${task.id}`)).toMatchObject({ status: 'review', title: 'Final brief', priority: 'urgent' });
});

test('a refused save keeps the draft and can be retried', async ({ actor }) => {
    const { page, request, task } = await openNewTask(actor);
    await onTaskSave(page, route => route.fulfill({ status: 500, json: { error: 'database unavailable' } }));
    await status(page).selectOption('done');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('#task-message')).toHaveText('database unavailable');
    await expect(status(page)).toHaveValue('done');
    expect(await api<Task>(request, 'GET', `/api/tasks/${task.id}`)).toMatchObject({ status: 'todo' });
    await page.unroute('**/api/tasks/*');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Task saved.')).toBeVisible();
    expect(await api<Task>(request, 'GET', `/api/tasks/${task.id}`)).toMatchObject({ status: 'done' });
});

test('a pending save disables edits and duplicate submissions', async ({ actor }) => {
    const { page } = await openNewTask(actor);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await onTaskSave(page, async route => { await gate; await route.continue(); });
    await status(page).selectOption('done');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByLabel('Title', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Description', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Back to project' })).toBeDisabled();
    release();
    await expect(page.getByText('Task saved.')).toBeVisible();
    await page.getByRole('button', { name: 'Back to project' }).click();
    await expect(kanbanColumn(page, 'done').getByRole('button', { name: /Write the brief/ })).toBeVisible();
});

test('leaving an unsaved task asks before discarding the draft', async ({ actor }) => {
    const { page, request, task } = await openNewTask(actor);
    await status(page).selectOption('done');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Back to project' }).click();
    await expect(status(page)).toHaveValue('done');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Back to project' }).click();
    await expect(kanbanColumn(page, 'todo').getByRole('button', { name: /Write the brief/ })).toBeVisible();
    expect(await api<Task>(request, 'GET', `/api/tasks/${task.id}`)).toMatchObject({ status: 'todo' });
});

test('saving one edited field preserves a different field changed by another user', async ({ actor }) => {
    const { page, request, task } = await openNewTask(actor);
    await page.getByLabel('Title', { exact: true }).fill('My title');
    await api(request, 'PATCH', `/api/tasks/${task.id}`, { priority: 'urgent' });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Task saved.')).toBeVisible();
    await expect(priority(page)).toHaveValue('urgent');
    expect(await api<Task>(request, 'GET', `/api/tasks/${task.id}`)).toMatchObject({ title: 'My title', priority: 'urgent' });
});
