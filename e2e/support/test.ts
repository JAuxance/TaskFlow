import { test as base, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { signUp, type User } from './api';
import { resetDatabase } from './stack';

export { expect };

/** A signed-in person with their own browser window. */
export type Actor = { page: Page; request: APIRequestContext; user: User };

type Fixtures = {
    cleanDatabase: void;
    /** Register `name` and open the application in a separate browser context. */
    actor: (name: string) => Promise<Actor>;
};

export const test = base.extend<Fixtures>({
    cleanDatabase: [async ({}, use) => {
        resetDatabase();
        await use();
    }, { auto: true }],

    actor: async ({ browser, baseURL, viewport, colorScheme, isMobile, hasTouch, locale, timezoneId }, use) => {
        const contexts: BrowserContext[] = [];
        await use(async name => {
            const context = await browser.newContext({
                baseURL, viewport, colorScheme, isMobile, hasTouch, locale, timezoneId,
            });
            contexts.push(context);
            // The page and its API context share cookies, so the page opens signed in.
            const user = await signUp(context.request, name);
            const page = await context.newPage();
            await page.goto('/');
            await expect(page.getByRole('button', { name: 'Edit your profile' })).toContainText(user.email);
            return { page, request: context.request, user };
        });
        for (const context of contexts) await context.close();
    },
});

/** Open a workspace from the sidebar, the only navigation shared by every screen. */
export async function openWorkspace(page: Page, name: string): Promise<void> {
    await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

export async function openProject(page: Page, name: string): Promise<void> {
    await page.getByRole('region', { name: 'Projects', exact: true }).getByRole('button', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

export const kanbanColumn = (page: Page, status: string) => page.locator(`.kanban-column[data-status="${status}"]`);

export async function openTask(page: Page, status: string, title: string): Promise<void> {
    await kanbanColumn(page, status).getByRole('button', { name: title }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/** Reload the sidebar and current data after a change made through the API. */
export async function reloadApp(page: Page): Promise<void> {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Edit your profile' })).toBeVisible();
}
