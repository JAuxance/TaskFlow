import { composer, expect, openWorkspace, reloadApp, socketEvent, test } from '../support/test';
import { api, createWorkspace, emailOf } from '../support/api';

test('an owner adds a member, changes their role, then removes them', async ({ actor }) => {
    const owner = await actor('alice');
    const bob = await actor('bob');
    const workspace = await createWorkspace(owner.request, 'Design studio');

    await reloadApp(owner.page);
    await openWorkspace(owner.page, 'Design studio');
    await owner.page.getByRole('tab', { name: /Members/ }).click();
    await owner.page.getByRole('button', { name: 'Add member', exact: true }).click();
    const dialog = owner.page.getByRole('dialog', { name: 'Add member' });
    await dialog.getByLabel('Email').fill(emailOf('bob'));
    await dialog.getByLabel('Role').selectOption('member');
    await dialog.getByRole('button', { name: 'Add member' }).click();

    const bobRole = owner.page.getByLabel('Role for bob');
    await expect(bobRole).toHaveValue('member');
    await expect(owner.page.getByRole('tab', { name: /Members/ })).toContainText('2');

    await bobRole.selectOption('guest');
    await expect(owner.page.getByText('Role updated for bob.')).toBeVisible();

    // The member sees the workspace with the new role and opens its chat.
    await reloadApp(bob.page);
    await openWorkspace(bob.page, 'Design studio');
    await expect(bob.page.locator('.page-heading .role-badge')).toHaveText('Guest');
    const joined = socketEvent(bob.page, 'workspace_joined');
    await bob.page.getByRole('tab', { name: 'Messages' }).click();
    await joined;

    owner.page.once('dialog', confirmation => confirmation.accept());
    await owner.page.getByRole('button', { name: 'Remove bob from workspace' }).click();
    await expect(owner.page.getByRole('button', { name: 'Remove bob from workspace' })).toHaveCount(0);
    await expect(owner.page.getByRole('tab', { name: /Members/ })).toContainText('1');

    // The open chat is closed at once, without waiting for a reload.
    await expect(bob.page.getByText('You no longer have access to this workspace.')).toBeVisible();
    await expect(composer(bob.page)).toBeDisabled();

    await bob.page.getByRole('button', { name: 'All workspaces' }).click();
    await expect(bob.page.getByText('No workspaces yet.')).toBeVisible();

    // The server no longer discloses that the workspace exists.
    await api(bob.request, 'GET', `/api/workspaces/${workspace.id}`, undefined, 404);
    await api(bob.request, 'GET', `/api/workspaces/${workspace.id}/projects`, undefined, 404);
    await api(bob.request, 'POST', `/api/workspaces/${workspace.id}/messages`, { message: 'Still here?' }, 404);
});

test('only an existing account can be added', async ({ actor }) => {
    const owner = await actor('alice');
    await createWorkspace(owner.request, 'Design studio');
    await reloadApp(owner.page);
    await openWorkspace(owner.page, 'Design studio');
    await owner.page.getByRole('tab', { name: /Members/ }).click();
    await owner.page.getByRole('button', { name: 'Add member', exact: true }).click();
    const dialog = owner.page.getByRole('dialog', { name: 'Add member' });
    await dialog.getByLabel('Email').fill(emailOf('nobody'));
    await dialog.getByRole('button', { name: 'Add member' }).click();

    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(owner.page.getByRole('tab', { name: /Members/ })).toContainText('1');
});
