import type { Page } from '@playwright/test';
import { expect, openDashboard, test } from '../support/test';
import { seedStudio } from '../support/seed';

const cards = (page: Page) => page.locator('#workspace-cards');
const taskCount = (page: Page) => page.locator('#overview-task-count');

test('the dashboard lists the tasks of every project and filters them by status', async ({ actor }) => {
    const { alice: { page } } = await seedStudio(actor);
    await openDashboard(page);

    // Unfinished tasks by default: five of the six, the overdue one first.
    await expect(taskCount(page)).toHaveText('5');
    await expect(cards(page).getByRole('heading', { name: 'Website redesign' })).toBeVisible();
    await expect(cards(page).getByRole('heading', { name: 'Mobile app' })).toBeVisible();
    const rows = cards(page).getByRole('listitem');
    await expect(rows.first()).toContainText('Prepare the launch checklist');
    await expect(rows.first()).toContainText('Urgent priority');
    await expect(rows.first()).toContainText('Due 9 Oct');
    await expect(cards(page).getByRole('button', { name: /Collect client feedback/ })).toContainText('No due date');
    await expect(cards(page)).not.toContainText('Write the creative brief');

    await page.getByLabel('Status', { exact: true }).selectOption('done');
    await expect(taskCount(page)).toHaveText('1');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Write the creative brief');
    await expect(cards(page)).toContainText('No tasks with status “Done”.');

    await page.getByLabel('Status', { exact: true }).selectOption('all');
    await expect(taskCount(page)).toHaveText('6');
});

test('each member sees their own role on the workspace card', async ({ actor }) => {
    const { alice, bob, gina } = await seedStudio(actor);
    for (const [member, role] of [[alice, 'Owner'], [bob, 'Member'], [gina, 'Guest']] as const) {
        await openDashboard(member.page);
        await expect(cards(member.page).locator('.role-badge')).toHaveText(role);
    }
    // The private conversation is listed in the sidebar of both participants.
    await expect(alice.page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: /bob/ })).toContainText('On it.');
    await expect(gina.page.getByText('No conversations yet.')).toBeVisible();
});

test('the theme switch changes the theme and remembers it', async ({ actor }) => {
    const { page } = await actor('alice');
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    expect(await theme()).toBe('light');

    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    expect(await theme()).toBe('dark');
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();

    // The choice is stored in the browser and applied before the page is drawn.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
    expect(await theme()).toBe('dark');
});
