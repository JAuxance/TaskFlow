import { expect, kanbanColumn, openProject, openWorkspace, reloadApp, test } from '../support/test';
import { addMember, createProject, createTask, createWorkspace } from '../support/api';

test('an owner renames a project, edits its description, then deletes it', async ({ actor }) => {
    const { page, request } = await actor('alice');
    const workspace = await createWorkspace(request, 'Design studio');
    const project = await createProject(request, workspace.id, 'Website redesign');
    await createTask(request, project.id, { title: 'Write the brief' });
    await reloadApp(page);
    await openWorkspace(page, 'Design studio');
    await openProject(page, 'Website redesign');

    await page.getByRole('button', { name: 'Project settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Project settings' });
    await settings.getByLabel('Project name').fill('Website relaunch');
    await settings.getByLabel('Description').fill('Second version of the site');
    await settings.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Website relaunch' })).toBeVisible();
    await expect(page.locator('.page-heading')).toContainText('Second version of the site');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Website relaunch');
    // The board is still there after the change.
    await expect(kanbanColumn(page, 'todo').getByRole('button', { name: /Write the brief/ })).toBeVisible();

    await page.getByRole('button', { name: 'Project settings' }).click();
    page.once('dialog', confirmation => confirmation.dismiss());
    await settings.getByRole('button', { name: 'Delete project' }).click();
    await expect(settings).toBeVisible();

    page.once('dialog', confirmation => confirmation.accept());
    await settings.getByRole('button', { name: 'Delete project' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Design studio' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No projects yet' })).toBeVisible();
});

test('a member adds tasks but cannot change the project itself', async ({ actor }) => {
    const owner = await actor('alice');
    const member = await actor('bob');
    const workspace = await createWorkspace(owner.request, 'Design studio');
    await createProject(owner.request, workspace.id, 'Website redesign', 'New marketing site');
    await addMember(owner.request, workspace.id, 'bob', 'member');

    const page = member.page;
    await reloadApp(page);
    await openWorkspace(page, 'Design studio');
    await openProject(page, 'Website redesign');
    await expect(page.getByText('New marketing site')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Project settings' })).toHaveCount(0);

    await page.getByRole('button', { name: 'New task' }).click();
    const dialog = page.getByRole('dialog', { name: 'New task' });
    await dialog.getByLabel('Task title').fill('Collect references');
    await dialog.getByLabel('Color').selectOption('green');
    await dialog.getByRole('button', { name: 'Create task' }).click();

    const card = kanbanColumn(page, 'todo').getByRole('button', { name: /Collect references/ });
    await expect(card).toHaveAttribute('data-color', 'green');
    await expect(dialog).toBeHidden();
});
