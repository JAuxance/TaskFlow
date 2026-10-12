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

    // Status, priority and color are saved as soon as they change.
    await status(page).selectOption('in_progress');
    await expect(page.getByText('Status saved.')).toBeVisible();
    await priority(page).selectOption('high');
    await expect(page.getByText('Priority saved.')).toBeVisible();

    // Title and description wait for an explicit save.
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
    const row = page.locator('#overview-tasks').getByRole('button', { name: /Write the creative brief/ });
    await expect(row).toContainText('In progress');
    await expect(row).toContainText('High priority');
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
    await expect(page.getByText('Color saved.')).toBeVisible();
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

test.describe('saves of a task', () => {
    test('are sent one after the other, never two at once', async ({ actor }) => {
        const { page, request, task } = await openNewTask(actor);
        let inFlight = 0;
        let mostAtOnce = 0;
        const saved: string[] = [];
        await onTaskSave(page, async route => {
            inFlight += 1;
            mostAtOnce = Math.max(mostAtOnce, inFlight);
            saved.push(route.request().postData() ?? '');
            await new Promise(resolve => setTimeout(resolve, 300));
            const response = await route.fetch();
            inFlight -= 1;
            await route.fulfill({ response });
        });

        // Three changes made before the first one is answered.
        await status(page).selectOption('review');
        await priority(page).selectOption('urgent');
        await page.getByLabel('Title', { exact: true }).fill('Write the final brief');
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByText('Task saved.')).toBeVisible();

        expect(mostAtOnce).toBe(1);
        expect(saved.map(body => Object.keys(JSON.parse(body))[0])).toEqual(['status', 'priority', 'title']);
        // None of them overwrote another one.
        expect(await api<Task>(request, 'GET', `/api/tasks/${task.id}`))
            .toMatchObject({ status: 'review', priority: 'urgent', title: 'Write the final brief' });
    });

    test('are finished before "Back to project" shows the board', async ({ actor }) => {
        const { page } = await openNewTask(actor);
        await onTaskSave(page, async route => {
            await new Promise(resolve => setTimeout(resolve, 600));
            await route.continue();
        });

        await status(page).selectOption('done');
        await page.getByRole('button', { name: 'Back to project' }).click();

        // The board is loaded after the save, so the card is already in its new column.
        await expect(page.getByRole('heading', { level: 1, name: 'Website redesign' })).toBeVisible();
        await expect(kanbanColumn(page, 'done').getByRole('button', { name: /Write the brief/ })).toBeVisible();
        await expect(kanbanColumn(page, 'todo')).toContainText('No tasks yet.');
    });

    test('put the previous value back when the server refuses', async ({ actor }) => {
        const { page, request, task } = await openNewTask(actor);
        await onTaskSave(page, route => route.fulfill({ status: 500, json: { error: 'database unavailable' } }));

        await status(page).selectOption('done');
        await expect(page.locator('#autosave-message')).toHaveText('database unavailable');
        await expect(status(page)).toHaveValue('todo');

        // A refused save does not block the next one.
        await page.unroute('**/api/tasks/*');
        await priority(page).selectOption('high');
        await expect(page.getByText('Priority saved.')).toBeVisible();
        expect(await api<Task>(request, 'GET', `/api/tasks/${task.id}`)).toMatchObject({ status: 'todo', priority: 'high' });
    });

    test('tell the user when they typed again while the form was being saved', async ({ actor }) => {
        const { page } = await openNewTask(actor);
        await onTaskSave(page, async route => {
            await new Promise(resolve => setTimeout(resolve, 600));
            await route.continue();
        });

        await page.getByLabel('Title', { exact: true }).fill('Write the creative brief');
        await page.getByRole('button', { name: 'Save changes' }).click();
        await page.getByLabel('Description', { exact: true }).fill('Typed during the save');

        await expect(page.getByText('Saved. Your latest edits are still unsaved.')).toBeVisible();
        await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Typed during the save');
    });

    test('are also finished before leaving by the breadcrumb', async ({ actor }) => {
        const { page } = await openNewTask(actor);
        await onTaskSave(page, async route => {
            await new Promise(resolve => setTimeout(resolve, 600));
            await route.continue();
        });

        await status(page).selectOption('done');
        await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: 'Website redesign' }).click();

        await expect(page.getByRole('heading', { level: 1, name: 'Website redesign' })).toBeVisible();
        await expect(kanbanColumn(page, 'done').getByRole('button', { name: /Write the brief/ })).toBeVisible();
    });
});
