import type { Page } from '@playwright/test';
import { expect, kanbanColumn, openProject, openTask, openWorkspace, socketEvent, test } from '../support/test';
import { seedStudio } from '../support/seed';

// Reference screenshots, taken at both widths and in both themes (see
// playwright.config.ts). They are the visual contract for the migration:
// regenerate them only on purpose, with `npm run screenshots:update`, and
// review the image diff before committing.

async function capture(page: Page, name: string, fullPage = true) {
    await page.evaluate(async () => { await document.fonts.ready; });
    // Soft: one differing screen does not hide the comparison of the others.
    await expect.soft(page).toHaveScreenshot(`${name}.png`, { fullPage });
}

test('signed-out screens match their reference', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await capture(page, 'login');

    await page.getByRole('button', { name: 'Create an account' }).click();
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
    await capture(page, 'register');
});

test('signed-in screens match their reference', async ({ actor }) => {
    const { alice, gina } = await seedStudio(actor);
    const page = alice.page;
    const messages = page.getByRole('log').getByRole('article');

    await expect(page.locator('#overview-tasks')).toHaveAttribute('aria-busy', 'false');
    await capture(page, 'dashboard');

    await openWorkspace(page, 'Design studio');
    await expect(page.locator('#workspace-focus-list')).toHaveAttribute('aria-busy', 'false');
    await capture(page, 'workspace-overview');

    await page.getByRole('tab', { name: /Members/ }).click();
    await expect(page.getByLabel('Role for gina')).toHaveValue('guest');
    await capture(page, 'workspace-members');

    const workspaceChat = socketEvent(page, 'workspace_joined');
    await page.getByRole('tab', { name: 'Messages' }).click();
    await workspaceChat;
    await expect(messages).toHaveCount(2);
    await capture(page, 'workspace-messages');

    await page.getByRole('tab', { name: /Members/ }).click();
    const privateChat = socketEvent(page, 'direct_message_joined');
    await page.getByRole('button', { name: 'Send a private message to bob' }).click();
    await privateChat;
    await expect(messages).toHaveCount(2);
    await capture(page, 'direct-messages');

    await openWorkspace(page, 'Design studio');
    await openProject(page, 'Website redesign');
    await expect(kanbanColumn(page, 'done').getByRole('button')).toHaveCount(1);
    await capture(page, 'kanban');

    await openTask(page, 'in_progress', 'Design the home page');
    await capture(page, 'task-details');

    await page.getByRole('button', { name: 'Edit your profile' }).click();
    const profile = page.getByRole('dialog', { name: 'Your profile' });
    await expect(profile.getByRole('link', { name: 'e2e-sentinel@example.com' })).toBeVisible();
    await capture(page, 'profile', false);

    // The same task as seen by a guest: read-only fields, no save or delete.
    await openWorkspace(gina.page, 'Design studio');
    await openProject(gina.page, 'Website redesign');
    await openTask(gina.page, 'in_progress', 'Design the home page');
    await capture(gina.page, 'task-details-guest');
});
