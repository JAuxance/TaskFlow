import type { Page } from '@playwright/test';
import {
    expect, kanbanColumn, openProject, openTask, openWorkspace, reloadApp, socketEvent, test,
} from '../support/test';
import { seedStudio } from '../support/seed';

// Reference screenshots, taken at both widths and in both themes (see
// playwright.config.ts). Regenerate them only on purpose, with `npm run screenshots:update`, and
// review the image diff before committing.

async function capture(page: Page, name: string, fullPage = true) {
    await page.evaluate(async () => { await document.fonts.ready; });
    // Park the pointer in a corner: a screenshot must not show whatever it was last hovering.
    await page.mouse.move(0, 0);
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
    // Someone who has not joined any workspace yet.
    const nina = await actor('nina');
    const page = alice.page;
    const overviewLoaded = () => expect(page.locator('#workspace-focus-list')).toHaveAttribute('aria-busy', 'false');
    const messages = page.getByRole('log').getByRole('article');

    // Every screen is opened from a fresh arrival, so each one stands alone.
    const screens: [name: string, open: (page: Page) => Promise<void>, viewer?: Page][] = [
        ['welcome', async viewer => {
            await expect(viewer.getByRole('heading', { name: 'Your next project starts here' })).toBeVisible();
        }, nina.page],
        ['profile', async () => {
            // The dialog is captured over the workspace: wait for it to be complete.
            await overviewLoaded();
            await page.getByRole('button', { name: 'Edit your profile' }).click();
            const profile = page.getByRole('dialog', { name: 'Your profile' });
            await expect(profile.getByRole('link', { name: 'e2e-sentinel@example.com' })).toBeVisible();
        }],
        ['workspace-overview', async () => {
            await openWorkspace(page, 'Design studio');
            await overviewLoaded();
        }],
        ['workspace-members', async () => {
            await openWorkspace(page, 'Design studio');
            await page.getByRole('tab', { name: /Members/ }).click();
            await expect(page.getByLabel('Role for gina')).toHaveValue('guest');
        }],
        ['workspace-messages', async () => {
            await openWorkspace(page, 'Design studio');
            const joined = socketEvent(page, 'workspace_joined');
            await page.getByRole('tab', { name: 'Messages' }).click();
            await joined;
            await expect(messages).toHaveCount(2);
        }],
        ['direct-messages', async () => {
            await openWorkspace(page, 'Design studio');
            await page.getByRole('tab', { name: /Members/ }).click();
            const joined = socketEvent(page, 'direct_message_joined');
            await page.getByRole('button', { name: 'Send a private message to bob' }).click();
            await joined;
            await expect(messages).toHaveCount(2);
        }],
        ['kanban', async () => {
            await openWorkspace(page, 'Design studio');
            await openProject(page, 'Website redesign');
            await expect(kanbanColumn(page, 'done').getByRole('button')).toHaveCount(1);
        }],
        ['task-details', async () => {
            await openWorkspace(page, 'Design studio');
            await openProject(page, 'Website redesign');
            await openTask(page, 'in_progress', 'Design the home page');
        }],
        // The same task as seen by a guest: read-only fields, no save or delete.
        ['task-details-guest', async viewer => {
            await openWorkspace(viewer, 'Design studio');
            await openProject(viewer, 'Website redesign');
            await openTask(viewer, 'in_progress', 'Design the home page');
        }, gina.page],
    ];

    for (const [name, open, viewer = page] of screens) {
        await test.step(name, async () => {
            await reloadApp(viewer);
            await open(viewer);
            // A dialog is captured as seen, over the page; a page in full.
            await capture(viewer, name, name !== 'profile');
            if (name === 'profile') await viewer.keyboard.press('Escape');
        });
    }
});
