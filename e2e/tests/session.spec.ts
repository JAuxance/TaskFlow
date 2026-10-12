import {
    composer, expect, kanbanColumn, openProject, openTask, openWorkspace, reloadApp, socketEvent, test,
} from '../support/test';
import { createProject, createTask, createWorkspace } from '../support/api';
import { isLegacyFrontend, sql } from '../support/stack';

/** Same effect as waiting for the 24-hour lifetime of a session. */
const expireSessions = () => sql("UPDATE sessions SET expires_at = now() - interval '1 minute'");

test('an expired session returns to the login screen on the next navigation', { tag: '@vue' }, async ({ actor }) => {
    const { page } = await actor('alice');
    expireSessions();

    await page.getByRole('button', { name: 'All workspaces' }).click();
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});

test('a page without its session cookie shows the login screen', { tag: '@vue' }, async ({ actor }) => {
    const { page } = await actor('alice');
    await page.context().clearCookies();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});

test('the chat explains that the session expired', async ({ actor }) => {
    const { page, request } = await actor('alice');
    await createWorkspace(request, 'Design studio');
    await reloadApp(page);
    await openWorkspace(page, 'Design studio');
    const joined = socketEvent(page, 'workspace_joined');
    await page.getByRole('tab', { name: 'Messages' }).click();
    await joined;
    expireSessions();

    await composer(page).fill('Is anyone there?');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText('Your session expired. Sign in again to continue.');
});

test.describe('screens that should also return to the login screen', { tag: '@vue' }, () => {
    // Audit finding D2: on the current frontend the board and the task details
    // show an error and stay in place. These tests describe the expected
    // behavior, which the Vue frontend has: the marker only applies to the
    // current frontend and disappears with it.
    test.fail(isLegacyFrontend, 'D2: no return to login from the board or the task details');

    test('opening a task from the board after expiry', async ({ actor }) => {
        const { page, request } = await actor('alice');
        const workspace = await createWorkspace(request, 'Design studio');
        const project = await createProject(request, workspace.id, 'Website redesign');
        await createTask(request, project.id, { title: 'Write the brief' });
        await reloadApp(page);
        await openWorkspace(page, 'Design studio');
        await openProject(page, 'Website redesign');
        expireSessions();

        await kanbanColumn(page, 'todo').getByRole('button', { name: /Write the brief/ }).click();
        await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible({ timeout: 3000 });
    });

    test('saving a task status after expiry', async ({ actor }) => {
        const { page, request } = await actor('alice');
        const workspace = await createWorkspace(request, 'Design studio');
        const project = await createProject(request, workspace.id, 'Website redesign');
        await createTask(request, project.id, { title: 'Write the brief' });
        await reloadApp(page);
        await openWorkspace(page, 'Design studio');
        await openProject(page, 'Website redesign');
        await openTask(page, 'todo', 'Write the brief');
        expireSessions();

        await page.getByLabel('Status', { exact: true }).selectOption('done');
        await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible({ timeout: 3000 });
    });
});
