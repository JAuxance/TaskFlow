import {
    expect, kanbanColumn, openProject, openTask, openWorkspace, reloadApp, test, type ActorFactory,
} from '../support/test';
import { createProject, createWorkspace } from '../support/api';

async function openEmptyBoard(actor: ActorFactory) {
    const { page, request } = await actor('alice');
    const workspace = await createWorkspace(request, 'Design studio');
    await createProject(request, workspace.id, 'Website redesign');
    await reloadApp(page);
    await openWorkspace(page, 'Design studio');
    await openProject(page, 'Website redesign');
    return page;
}

test('a member creates a task and edits it from the board', async ({ actor }) => {
    const page = await openEmptyBoard(actor);
    for (const status of ['todo', 'in_progress', 'review', 'done']) {
        await expect(kanbanColumn(page, status)).toContainText('No tasks yet.');
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
    await page.getByLabel('Status', { exact: true }).selectOption('in_progress');
    await expect(page.getByText('Status saved.')).toBeVisible();
    await page.getByLabel('Priority', { exact: true }).selectOption('high');
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
    await expect(page.getByLabel('Status', { exact: true })).toHaveValue('in_progress');
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

    page.once('dialog', confirmation => confirmation.accept());
    await page.getByRole('button', { name: 'Delete task' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Website redesign' })).toBeVisible();
    await expect(kanbanColumn(page, 'todo')).toContainText('No tasks yet.');
});
