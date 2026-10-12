import type { Page } from '@playwright/test';
import { expect, openDashboard, openWorkspace, reloadApp, test } from '../support/test';
import { addMember, createWorkspace } from '../support/api';
import { seedStudio } from '../support/seed';

// A valid 1 × 1 PNG: the server decodes every upload before storing it.
const PICTURE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Workspaces' });

async function openSettings(page: Page) {
    await reloadApp(page);
    await openWorkspace(page, 'Design studio');
    await page.getByRole('tab', { name: 'Settings' }).click();
}

test('the overview totals the projects and lists the tasks to focus on', { tag: '@vue' }, async ({ actor }) => {
    const { alice: { page } } = await seedStudio(actor);
    await openWorkspace(page, 'Design studio');
    const focus = page.locator('#workspace-focus-list');
    await expect(focus).toHaveAttribute('aria-busy', 'false');

    await expect(page.locator('#workspace-project-count')).toHaveText('2');
    await expect(page.locator('#workspace-open-count')).toHaveText('5');
    await expect(page.locator('#workspace-overdue-count')).toHaveText('1');

    const projects = page.getByRole('region', { name: 'Projects', exact: true });
    const website = projects.getByRole('button', { name: /Website redesign/ });
    await expect(website).toContainText('New marketing site for the spring launch.');
    await expect(website).toContainText('1 of 5 tasks done');
    await expect(website).toContainText('4 open · 1 overdue');
    await expect(projects.getByRole('button', { name: /Mobile app/ })).toContainText('No description yet.');

    // Overdue first, then by deadline; finished tasks are not listed.
    const items = focus.getByRole('listitem');
    await expect(items).toHaveCount(5);
    await expect(items.first()).toContainText('Prepare the launch checklist');
    await expect(items.first()).toContainText('Overdue · 9 Oct');
    await expect(items.nth(1)).toContainText('Review the color palette');
    await expect(focus).not.toContainText('Write the creative brief');

    await page.getByLabel('Show tasks').selectOption('overdue');
    await expect(items).toHaveCount(1);
    await page.getByLabel('Show tasks').selectOption('review');
    await expect(items).toHaveText([/Review the color palette/]);
});

test('an owner renames the workspace', { tag: '@vue' }, async ({ actor }) => {
    const { page, request } = await actor('alice');
    await createWorkspace(request, 'Design studio');
    await openSettings(page);

    await page.getByLabel('Workspace name').fill('Brand studio');
    await page.getByRole('button', { name: 'Save name' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Brand studio' })).toBeVisible();
    await expect(sidebar(page).getByRole('button', { name: 'Brand studio', exact: true })).toBeVisible();
    // The screen is shown again on the tab that was open.
    await expect(page.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Brand studio');
});

test('an owner gives the workspace an emoji, then a picture', { tag: '@vue' }, async ({ actor }) => {
    const { page, request } = await actor('alice');
    await createWorkspace(request, 'Design studio');
    await openSettings(page);
    const titleIcon = page.locator('.workspace-title-row .workspace-icon');

    await page.getByLabel('Emoji').fill('🚀');
    await page.getByRole('button', { name: 'Use emoji' }).click();
    await expect(titleIcon).toHaveText('🚀');
    await expect(sidebar(page).getByRole('button', { name: 'Design studio' })).toContainText('🚀');

    await page.getByLabel('Image', { exact: true }).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    await page.getByRole('button', { name: 'Upload image' }).click();
    await expect(page.getByText('Choose a JPG, PNG or WebP image.')).toBeVisible();

    await page.getByLabel('Image', { exact: true }).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PICTURE });
    await page.getByRole('button', { name: 'Upload image' }).click();
    // The picture is private: it is fetched with the session and shown as a data URL.
    await expect(titleIcon).toHaveAttribute('src', /^data:image\//);
    await expect(sidebar(page).getByRole('button', { name: 'Design studio' }).locator('img')).toHaveAttribute('src', /^data:image\//);
});

test('the primary owner hands the workspace over to another owner', { tag: '@vue' }, async ({ actor }) => {
    const alice = await actor('alice');
    const bob = await actor('bob');
    const workspace = await createWorkspace(alice.request, 'Design studio');
    await addMember(alice.request, workspace.id, 'bob', 'member');
    await openSettings(alice.page);

    // Nobody else has the Owner role yet: there is no one to hand over to.
    await expect(alice.page.getByLabel('New primary owner')).toBeDisabled();
    await expect(alice.page.getByText('Give another member the Owner role in the Members tab to transfer ownership.')).toBeVisible();

    await alice.page.getByRole('tab', { name: /Members/ }).click();
    await alice.page.getByLabel('Role for bob').selectOption('owner');
    await expect(alice.page.getByText('Role updated for bob.')).toBeVisible();
    await alice.page.getByRole('tab', { name: 'Settings' }).click();
    await alice.page.getByLabel('New primary owner').selectOption({ label: 'bob' });
    alice.page.once('dialog', confirmation => confirmation.accept());
    await alice.page.getByRole('button', { name: 'Transfer ownership' }).click();

    // Alice keeps the Owner role but loses what only the primary owner can do.
    await expect(alice.page.getByRole('heading', { name: 'Ownership and deletion' })).toHaveCount(0);
    await expect(alice.page.locator('.page-heading .role-badge')).toHaveText('Owner');
    await expect(alice.page.getByRole('heading', { name: 'General' })).toBeVisible();

    await openSettings(bob.page);
    await expect(bob.page.getByRole('heading', { name: 'Ownership and deletion' })).toBeVisible();
});

test('deleting a workspace requires typing its exact name', { tag: '@vue' }, async ({ actor }) => {
    const { page, request } = await actor('alice');
    await createWorkspace(request, 'Design studio');
    await openSettings(page);

    page.once('dialog', prompt => prompt.accept('design studio'));
    await page.getByRole('button', { name: 'Delete workspace' }).click();
    await expect(page.getByText('The name does not match. Workspace deletion cancelled.')).toBeVisible();

    page.once('dialog', prompt => prompt.dismiss());
    await page.getByRole('button', { name: 'Delete workspace' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Design studio' })).toBeVisible();

    page.once('dialog', prompt => prompt.accept('Design studio'));
    await page.getByRole('button', { name: 'Delete workspace' }).click();
    await expect(page.getByRole('heading', { name: 'All workspaces' })).toBeVisible();
    await openDashboard(page);
    await expect(sidebar(page).getByText('No workspaces yet.')).toBeVisible();
});
