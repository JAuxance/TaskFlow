import { composer, expect, openDashboard, openWorkspace, reloadApp, socketEvent, test } from '../support/test';
import { addMember, api, createWorkspace, emailOf } from '../support/api';

test('an owner adds a member, changes their role, then removes them', { tag: '@vue' }, async ({ actor }) => {
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

    // The list is shown again on the same tab, with the new member.
    const bobRole = owner.page.getByLabel('Role for bob');
    await expect(bobRole).toHaveValue('member');
    await expect(owner.page.getByRole('tab', { name: /Members/ })).toContainText('2');
    await expect(owner.page.getByRole('tab', { name: /Members/ })).toHaveAttribute('aria-selected', 'true');

    await bobRole.selectOption('guest');
    await expect(owner.page.getByText('Role updated for bob.')).toBeVisible();

    // The member sees the workspace with the new role.
    await reloadApp(bob.page);
    await openWorkspace(bob.page, 'Design studio');
    await expect(bob.page.locator('.page-heading .role-badge')).toHaveText('Guest');

    owner.page.once('dialog', confirmation => confirmation.accept());
    await owner.page.getByRole('button', { name: 'Remove bob from workspace' }).click();
    await expect(owner.page.getByRole('button', { name: 'Remove bob from workspace' })).toHaveCount(0);
    await expect(owner.page.getByRole('tab', { name: /Members/ })).toContainText('1');

    // On their next navigation, the workspace is gone for the removed member.
    await openDashboard(bob.page);
    await expect(bob.page.getByText('No workspaces yet.')).toBeVisible();

    // The server no longer discloses that the workspace exists.
    await api(bob.request, 'GET', `/api/workspaces/${workspace.id}`, undefined, 404);
    await api(bob.request, 'GET', `/api/workspaces/${workspace.id}/projects`, undefined, 404);
    await api(bob.request, 'POST', `/api/workspaces/${workspace.id}/messages`, { message: 'Still here?' }, 404);
});

test('declining the confirmation keeps the member', { tag: '@vue' }, async ({ actor }) => {
    const owner = await actor('alice');
    await actor('bob');
    const workspace = await createWorkspace(owner.request, 'Design studio');
    await addMember(owner.request, workspace.id, 'bob', 'member');
    await reloadApp(owner.page);
    await openWorkspace(owner.page, 'Design studio');
    await owner.page.getByRole('tab', { name: /Members/ }).click();

    owner.page.once('dialog', confirmation => confirmation.dismiss());
    await owner.page.getByRole('button', { name: 'Remove bob from workspace' }).click();

    await expect(owner.page.getByLabel('Role for bob')).toHaveValue('member');
    await expect(owner.page.getByRole('tab', { name: /Members/ })).toContainText('2');
});

test('only an existing account can be added', { tag: '@vue' }, async ({ actor }) => {
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

test('an admin manages members and guests, but not owners or the workspace itself', { tag: '@vue' }, async ({ actor }) => {
    const owner = await actor('alice');
    const admin = await actor('adam');
    await actor('bob');
    await actor('olga');
    const workspace = await createWorkspace(owner.request, 'Design studio');
    await addMember(owner.request, workspace.id, 'adam', 'admin');
    await addMember(owner.request, workspace.id, 'bob', 'member');
    await addMember(owner.request, workspace.id, 'olga', 'owner');

    const page = admin.page;
    await reloadApp(page);
    await openWorkspace(page, 'Design studio');
    await expect(page.locator('.page-heading .role-badge')).toHaveText('Admin');
    await page.getByRole('tab', { name: /Members/ }).click();

    // Members and guests can be managed, with the two lowest roles only.
    await expect(page.getByLabel('Role for bob').getByRole('option')).toHaveText(['Member', 'Guest']);
    await expect(page.getByRole('button', { name: 'Remove bob from workspace' })).toBeVisible();
    // Owners and the admin's own row offer no role change and no removal.
    for (const name of ['alice', 'olga', 'adam']) {
        await expect(page.getByLabel(`Role for ${name}`)).toHaveCount(0);
        await expect(page.getByRole('button', { name: `Remove ${name} from workspace` })).toHaveCount(0);
    }

    // Settings are open to an admin, except ownership and deletion.
    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ownership and deletion' })).toHaveCount(0);

    // The server applies the same limits.
    const olga = await api<{ user_id: number }[]>(admin.request, 'GET', `/api/workspaces/${workspace.id}/members`);
    const target = olga.find(member => member.user_id !== admin.user.id && member.user_id !== owner.user.id)!;
    await api(admin.request, 'DELETE', `/api/workspaces/${workspace.id}`, undefined, 403);
    await api(admin.request, 'PATCH', `/api/workspaces/${workspace.id}/members/${target.user_id}`, { role: 'owner' }, 403);
});

test('the open chat of a removed member is closed at once', { tag: '@vue' }, async ({ actor }) => {
    const owner = await actor('alice');
    const bob = await actor('bob');
    const workspace = await createWorkspace(owner.request, 'Design studio');
    await addMember(owner.request, workspace.id, 'bob', 'member');
    for (const { page } of [owner, bob]) {
        await reloadApp(page);
        await openWorkspace(page, 'Design studio');
    }
    const joined = socketEvent(bob.page, 'workspace_joined');
    await bob.page.getByRole('tab', { name: 'Messages' }).click();
    await joined;

    await owner.page.getByRole('tab', { name: /Members/ }).click();
    owner.page.once('dialog', confirmation => confirmation.accept());
    await owner.page.getByRole('button', { name: 'Remove bob from workspace' }).click();

    // Without waiting for a reload or a navigation.
    await expect(bob.page.getByText('You no longer have access to this workspace.')).toBeVisible();
    await expect(composer(bob.page)).toBeDisabled();
});
