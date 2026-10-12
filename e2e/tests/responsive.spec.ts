import type { Locator, Page } from '@playwright/test';
import { expect, kanbanColumn, openProject, openTask, openWorkspace, test } from '../support/test';
import { seedStudio } from '../support/seed';

// Runs at 1440 px and at 390 px (see playwright.config.ts).

async function box(locator: Locator) {
    const bounds = await locator.boundingBox();
    if (!bounds) throw new Error('The element is not displayed');
    return bounds;
}

async function expectNoHorizontalScroll(page: Page) {
    const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
}

test('the login form fits the screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    const form = await box(page.locator('#login-form'));
    expect(form.x).toBeGreaterThanOrEqual(0);
    expect(form.x + form.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('the main screens adapt their layout to the screen width', async ({ actor, isMobile }) => {
    const { alice: { page } } = await seedStudio(actor);
    const sidebar = page.getByRole('complementary', { name: 'Workspace navigation' });
    const main = page.locator('#page-content');

    // Dashboard: the sidebar sits beside the content on a computer, above it on a phone.
    await expect(page.locator('#overview-tasks')).toHaveAttribute('aria-busy', 'false');
    await expectNoHorizontalScroll(page);
    const [side, content] = [await box(sidebar), await box(main)];
    if (isMobile) expect(side.y + side.height).toBeLessThanOrEqual(content.y);
    else expect(side.x + side.width).toBeLessThanOrEqual(content.x);

    await openWorkspace(page, 'Design studio');
    await expect(page.locator('#workspace-focus-list')).toHaveAttribute('aria-busy', 'false');
    await expectNoHorizontalScroll(page);

    // Board: four columns side by side, or one column per row under 700 px.
    await openProject(page, 'Website redesign');
    await expect(kanbanColumn(page, 'done').getByRole('button')).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    const columns = [];
    for (const status of ['todo', 'in_progress', 'review', 'done']) columns.push(await box(kanbanColumn(page, status)));
    for (let index = 1; index < columns.length; index++) {
        if (isMobile) {
            expect(columns[index].x).toBe(columns[0].x);
            expect(columns[index].y).toBeGreaterThan(columns[index - 1].y);
        } else {
            expect(columns[index].y).toBe(columns[0].y);
            expect(columns[index].x).toBeGreaterThan(columns[index - 1].x);
        }
    }
    if (isMobile) {
        // Touch targets keep a comfortable height.
        expect((await box(page.getByRole('button', { name: 'New task' }))).height).toBeGreaterThanOrEqual(44);
    }

    // Task: properties beside the editor on a computer, below it on a phone.
    await openTask(page, 'in_progress', 'Design the home page');
    await expectNoHorizontalScroll(page);
    const title = await box(page.getByLabel('Title', { exact: true }));
    const status = await box(page.getByLabel('Status', { exact: true }));
    if (isMobile) expect(status.y).toBeGreaterThan(title.y + title.height);
    else expect(status.x).toBeGreaterThan(title.x + title.width);
});
