import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, reloadApp, test } from '../support/test';
import { PASSWORD, addMember, api, createProject, createTask, createWorkspace, emailOf } from '../support/api';
import { sql } from '../support/stack';

// A valid 1 × 1 PNG: the server decodes every upload before storing it.
const PICTURE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function openProfile(page: Page) {
    await page.getByRole('button', { name: 'Edit your profile' }).click();
    const profile = page.getByRole('dialog', { name: 'Your profile' });
    await expect(profile).toBeVisible();
    return profile;
}

const accountName = (page: Page) => page.locator('#profile-button .account-name');
const accountPicture = (page: Page) => page.locator('#profile-button .avatar img');

test('a user sets a first name, shown instead of the username, then clears it', async ({ actor }) => {
    const { page } = await actor('alice');
    await expect(accountName(page)).toHaveText('alice');
    const profile = await openProfile(page);

    await profile.getByLabel('First name (optional)').fill('  Alice  ');
    await profile.getByRole('button', { name: 'Save name' }).click();
    await expect(profile.getByText('Profile updated.')).toBeVisible();
    await expect(profile.getByLabel('First name (optional)')).toHaveValue('Alice');
    await expect(accountName(page)).toHaveText('Alice');

    // Stored on the server: a fresh page shows it as well.
    await reloadApp(page);
    await expect(accountName(page)).toHaveText('Alice');

    const reopened = await openProfile(page);
    await reopened.getByLabel('First name (optional)').fill('');
    await reopened.getByRole('button', { name: 'Save name' }).click();
    await expect(reopened.getByText('Profile updated.')).toBeVisible();
    await expect(accountName(page)).toHaveText('alice');
});



test('a user downloads their data after giving their password', async ({ actor }) => {
    const { page, request } = await actor('alice');
    const workspace = await createWorkspace(request, 'Design studio');
    const project = await createProject(request, workspace.id, 'Website redesign');
    await createTask(request, project.id, { title: 'Write the brief' });
    const profile = await openProfile(page);
    const password = profile.getByLabel('Current password for download');

    await password.fill('not-the-password');
    await profile.getByRole('button', { name: 'Download my data' }).click();
    await expect(profile.locator('#profile-export-message')).toHaveText('incorrect password');
    await expect(password).toHaveValue('');

    await password.fill(PASSWORD);
    const downloading = page.waitForEvent('download');
    await profile.getByRole('button', { name: 'Download my data' }).click();
    const download = await downloading;
    await expect(profile.getByText('Download requested. Check your browser downloads.')).toBeVisible();
    await expect(password).toHaveValue('');

    expect(download.suggestedFilename()).toBe('taskflow-my-data.json');
    const data = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(data.profile.email).toBe(emailOf('alice'));
    expect(data.tasks.map((task: { title: string }) => task.title)).toEqual(['Write the brief']);
    expect(JSON.stringify(data)).not.toContain('password');
});

test('the email address can be copied from the profile', async ({ actor }) => {
    const { page } = await actor('alice');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const profile = await openProfile(page);

    await profile.getByRole('button', { name: 'Copy email' }).click();
    await expect(profile.getByRole('button', { name: 'Copied!' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(emailOf('alice'));
    await expect(profile.getByRole('button', { name: 'Copy email' })).toBeVisible();
});

test('closing the profile forgets the passwords and the deletion review', async ({ actor }) => {
    const { page } = await actor('alice');
    const profile = await openProfile(page);
    await profile.getByLabel('Current password for download').fill('typed-but-not-sent');
    await profile.getByLabel('Current password', { exact: true }).fill('typed-but-not-sent');
    await profile.getByRole('button', { name: 'Review deletion' }).click();
    await expect(profile.getByText('Your deletion summary')).toBeVisible();

    await profile.getByRole('button', { name: 'Close profile' }).click();
    await expect(profile).toBeHidden();
    const reopened = await openProfile(page);

    await expect(reopened.getByLabel('Current password for download')).toHaveValue('');
    await expect(reopened.getByLabel('Current password', { exact: true })).toHaveValue('');
    await expect(reopened.getByText('Your deletion summary')).toBeHidden();
    await expect(reopened.getByRole('button', { name: 'Delete my account' })).toBeDisabled();
});

test.describe('account deletion', () => {
    test('a user deletes their account after reviewing what will be removed', async ({ actor }) => {
        const { page, request } = await actor('alice');
        const workspace = await createWorkspace(request, 'Design studio');
        const project = await createProject(request, workspace.id, 'Website redesign');
        await createTask(request, project.id, { title: 'Write the brief' });
        const profile = await openProfile(page);
        const confirmation = profile.getByLabel('I have reviewed the summary and understand this cannot be undone.');
        const remove = profile.getByRole('button', { name: 'Delete my account' });

        // Nothing can be deleted before the summary has been read.
        await expect(confirmation).toBeDisabled();
        await expect(remove).toBeDisabled();
        await profile.getByRole('button', { name: 'Review deletion' }).click();
        const summary = profile.locator('#profile-delete-summary');
        await expect(summary).toContainText('Your deletion summary');
        await expect(summary).toContainText('Workspaces deleted (no other members): Design studio.');
        await expect(summary).toContainText('Inside these workspaces: 1 project(s), 1 task(s), 0 chat message(s).');
        await confirmation.check();

        // A wrong password changes nothing.
        await profile.getByLabel('Current password', { exact: true }).fill('not-the-password');
        page.once('dialog', warning => warning.accept());
        await remove.click();
        await expect(profile.locator('#profile-delete-message')).toBeVisible();
        expect(sql('SELECT count(*) FROM users')).toBe('1');

        // Declining the last warning changes nothing either.
        await profile.getByLabel('Current password', { exact: true }).fill(PASSWORD);
        page.once('dialog', warning => warning.dismiss());
        await remove.click();
        await expect(profile).toBeVisible();
        expect(sql('SELECT count(*) FROM users')).toBe('1');

        page.once('dialog', warning => warning.accept());
        await remove.click();
        await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
        expect(sql('SELECT count(*) FROM users')).toBe('0');
        expect(sql('SELECT count(*) FROM workspaces')).toBe('0');
        expect(sql('SELECT count(*) FROM tasks')).toBe('0');

        // The account no longer exists: the same credentials are refused.
        await page.getByLabel('Email').fill(emailOf('alice'));
        await page.getByLabel('Password').fill(PASSWORD);
        await page.getByRole('button', { name: 'Login', exact: true }).click();
        await expect(page.getByRole('alert')).toHaveText('Invalid email or password. Please try again.');
    });

    test('the owner of a shared workspace must hand it over first', async ({ actor }) => {
        const alice = await actor('alice');
        await actor('bob');
        const workspace = await createWorkspace(alice.request, 'Design studio');
        await addMember(alice.request, workspace.id, 'bob', 'member');
        const profile = await openProfile(alice.page);

        await profile.getByRole('button', { name: 'Review deletion' }).click();
        const summary = profile.locator('#profile-delete-summary');
        await expect(summary).toContainText('Handle these shared workspaces first');
        await expect(summary).toContainText('Design studio — 1 other member(s).');
        await expect(profile.getByLabel('I have reviewed the summary and understand this cannot be undone.')).toBeDisabled();
        await expect(profile.getByRole('button', { name: 'Delete my account' })).toBeDisabled();

        // The server refuses as well, whatever the interface allows.
        const refusal = await api<{ code: string }>(alice.request, 'DELETE', '/api/users/me',
            { password: PASSWORD, confirmed_workspace_ids: [] }, 409);
        expect(refusal.code).toBe('shared_workspaces');
        expect(sql('SELECT count(*) FROM users')).toBe('2');
    });
});

test('a click beside the profile closes it, but not the end of a text selection', async ({ actor }) => {
    const { page } = await actor('alice');
    const profile = await openProfile(page);
    const name = profile.getByLabel('First name (optional)');
    await name.fill('Alice');

    // Selecting the text and releasing the button outside the dialog keeps it open.
    const field = (await name.boundingBox())!;
    await page.mouse.move(field.x + field.width - 10, field.y + field.height / 2);
    await page.mouse.down();
    await page.mouse.move(8, 8, { steps: 4 });
    await page.mouse.up();
    await expect(profile).toBeVisible();
    await expect(name).toHaveValue('Alice');

    // A click on the area around the dialog closes it, like its close button.
    await page.mouse.click(8, 8);
    await expect(profile).toBeHidden();
});
