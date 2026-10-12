import { expect, openWorkspace, test } from '../support/test';

test('an owner creates a workspace, then a project inside it', async ({ actor }) => {
    const { page } = await actor('alice');
    await expect(page.getByText('No workspaces yet.')).toBeVisible();

    await page.getByRole('button', { name: '+ New workspace' }).click();
    const workspaceDialog = page.getByRole('dialog', { name: 'New workspace' });
    await workspaceDialog.getByLabel('Workspace name').fill('Design studio');
    await workspaceDialog.getByRole('button', { name: 'Create workspace' }).click();

    // The new workspace is listed on the dashboard and in the sidebar, with the creator as owner.
    const card = page.locator('#workspace-cards').getByRole('button', { name: /Design studio/ });
    await expect(card).toContainText('Owner');
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

test('a workspace needs a name', async ({ actor }) => {
    const { page } = await actor('alice');
    await page.getByRole('button', { name: '+ New workspace' }).click();
    const dialog = page.getByRole('dialog', { name: 'New workspace' });
    await dialog.getByLabel('Workspace name').fill('   ');
    await dialog.getByRole('button', { name: 'Create workspace' }).click();

    await expect(dialog.getByRole('alert')).toHaveText('Enter a workspace name.');
    await expect(page.getByText('No workspaces yet.')).toBeVisible();
});
