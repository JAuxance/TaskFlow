import { expect, openWorkspace, reloadApp, test } from '../support/test';
import { createWorkspace } from '../support/api';

test('a user creates a workspace from the dashboard and becomes its owner', { tag: '@vue' }, async ({ actor }) => {
    const { page } = await actor('alice');
    const sidebar = page.getByRole('navigation', { name: 'Workspaces' });
    await expect(sidebar.getByText('No workspaces yet.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your next project starts here' })).toBeVisible();

    await page.getByRole('button', { name: '+ New workspace' }).click();
    const dialog = page.getByRole('dialog', { name: 'New workspace' });
    await dialog.getByLabel('Workspace name').fill('Design studio');
    await dialog.getByRole('button', { name: 'Create workspace' }).click();

    // The new workspace is listed on the dashboard and in the sidebar.
    await expect(dialog).toBeHidden();
    const card = page.locator('#workspace-cards').getByRole('button', { name: /Design studio/ });
    await expect(card).toContainText('Owner');
    await expect(page.locator('#workspace-cards')).toContainText('No projects in this workspace yet.');
    await expect(sidebar.getByRole('button', { name: 'Design studio', exact: true })).toBeVisible();
    await expect(sidebar.getByText('No workspaces yet.')).toHaveCount(0);
});

test('a workspace needs a name', { tag: '@vue' }, async ({ actor }) => {
    const { page } = await actor('alice');
    await page.getByRole('button', { name: '+ New workspace' }).click();
    const dialog = page.getByRole('dialog', { name: 'New workspace' });
    await dialog.getByLabel('Workspace name').fill('   ');
    await dialog.getByRole('button', { name: 'Create workspace' }).click();

    await expect(dialog.getByRole('alert')).toHaveText('Enter a workspace name.');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('No workspaces yet.')).toBeVisible();
});

test('an owner creates a project inside a workspace', async ({ actor }) => {
    const { page, request } = await actor('alice');
    await createWorkspace(request, 'Design studio');
    await reloadApp(page);
    await openWorkspace(page, 'Design studio');
    await expect(page.locator('#workspace-project-count')).toHaveText('0');
    await expect(page.getByRole('heading', { name: 'No projects yet' })).toBeVisible();

    await page.getByRole('button', { name: 'New project', exact: true }).click();
    const projectDialog = page.getByRole('dialog', { name: 'New project' });
    await projectDialog.getByLabel('Project name').fill('Website redesign');
    await projectDialog.getByLabel(/Description/).fill('New marketing site');
    await projectDialog.getByRole('button', { name: 'Create project' }).click();

    const project = page.getByRole('region', { name: 'Projects', exact: true }).getByRole('button', { name: /Website redesign/ });
    await expect(project).toContainText('New marketing site');
    await expect(project).toContainText('No tasks yet');
    await expect(page.locator('#workspace-project-count')).toHaveText('1');

    await project.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Website redesign' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Design studio');
});
