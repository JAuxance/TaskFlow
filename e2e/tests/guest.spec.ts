import { expect, openProject, openTask, openWorkspace, reloadApp, test } from '../support/test';
import { addMember, api, createProject, createTask, createWorkspace, type Task } from '../support/api';

test('a guest sees the workspace without any management control', async ({ actor }) => {
    const owner = await actor('alice');
    const guest = await actor('gina');
    const workspace = await createWorkspace(owner.request, 'Design studio');
    await createProject(owner.request, workspace.id, 'Website redesign');
    await addMember(owner.request, workspace.id, 'gina', 'guest');

    const page = guest.page;
    await reloadApp(page);
    await openWorkspace(page, 'Design studio');
    await expect(page.locator('.page-heading .role-badge')).toHaveText('Guest');
    await expect(page.getByRole('button', { name: 'New project', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Settings' })).toHaveCount(0);

    // The members are listed, with their roles as plain text.
    await page.getByRole('tab', { name: /Members/ }).click();
    await expect(page.getByRole('button', { name: 'Add member', exact: true })).toHaveCount(0);
    await expect(page.locator('#members-list')).toContainText('gina (you)');
    await expect(page.locator('#members-list select')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);

    // The server refuses what the interface does not offer.
    await api(guest.request, 'POST', `/api/workspaces/${workspace.id}/projects`, { name: 'Guest project' }, 403);
    await api(guest.request, 'PATCH', `/api/workspaces/${workspace.id}`, { name: 'Renamed by a guest' }, 403);
    await api(guest.request, 'POST', `/api/workspaces/${workspace.id}/members`, { email: 'alice@example.com', role: 'guest' }, 403);
});

test('a guest reads the board and the task but cannot change them', async ({ actor }) => {
    const owner = await actor('alice');
    const guest = await actor('gina');
    const workspace = await createWorkspace(owner.request, 'Design studio');
    const project = await createProject(owner.request, workspace.id, 'Website redesign');
    const task = await createTask(owner.request, project.id, { title: 'Write the brief' });
    await addMember(owner.request, workspace.id, 'gina', 'guest');

    const page = guest.page;
    await reloadApp(page);
    await openWorkspace(page, 'Design studio');
    await expect(page.locator('.page-heading .role-badge')).toHaveText('Guest');
    await expect(page.getByRole('button', { name: 'New project', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Settings' })).toHaveCount(0);

    await openProject(page, 'Website redesign');
    await expect(page.getByRole('button', { name: 'New task' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Project settings' })).toHaveCount(0);

    await openTask(page, 'todo', 'Write the brief');
    await expect(page.getByText('You have read-only access to this task.')).toBeVisible();
    for (const label of ['Title', 'Description', 'Status', 'Priority', 'Color', 'Due date', 'Assignee']) {
        await expect(page.getByLabel(label, { exact: true })).toBeDisabled();
    }
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete task' })).toHaveCount(0);

    // Hiding the controls is not the protection: the server refuses the same actions.
    await api(guest.request, 'PATCH', `/api/tasks/${task.id}`, { title: 'Changed by a guest' }, 403);
    await api(guest.request, 'DELETE', `/api/tasks/${task.id}`, undefined, 403);
    await api(guest.request, 'POST', `/api/projects/${project.id}/tasks`,
        { title: 'Created by a guest', status: 'todo', priority: 'medium' }, 403);
    await api(guest.request, 'POST', `/api/workspaces/${workspace.id}/projects`, { name: 'Guest project' }, 403);
    const unchanged = await api<Task>(owner.request, 'GET', `/api/tasks/${task.id}`);
    expect(unchanged.title).toBe('Write the brief');
});
