import { expect, test } from '../support/test';
import { seedStudio } from '../support/seed';

test('each member sees their own role in the workspace, and their conversations in the sidebar', async ({ actor }) => {
    const { alice, bob, gina } = await seedStudio(actor);
    for (const [member, role] of [[alice, 'Owner'], [bob, 'Member'], [gina, 'Guest']] as const) {
        await expect(member.page.locator('.page-heading .role-badge')).toHaveText(role);
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
