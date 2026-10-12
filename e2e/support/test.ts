import { test as base, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { signUp, type User } from './api';
import { resetDatabase } from './stack';

export { expect };

/** A signed-in person with their own browser window. */
export type Actor = { page: Page; request: APIRequestContext; user: User };

/** Register `name` and open the application in a separate browser context. */
export type ActorFactory = (name: string) => Promise<Actor>;

type Fixtures = {
    cleanDatabase: void;
    actor: ActorFactory;
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

/**
 * Resolve once the page has received the Socket.IO event `name`, whichever
 * transport carried it. Arm it before the action that opens the chat: only
 * then is the page guaranteed to be subscribed to live messages.
 */
export function socketEvent(page: Page, name: string): Promise<void> {
    const marker = `"${name}"`;
    return new Promise(resolve => {
        page.on('websocket', socket => socket.on('framereceived', frame => {
            if (String(frame.payload).includes(marker)) resolve();
        }));
        page.on('response', async response => {
            if (!response.url().includes('/socket.io/')) return;
            const body = await response.text().catch(() => '');
            if (body.includes(marker)) resolve();
        });
    });
}

/** The message field of the chat currently displayed. */
export const composer = (page: Page) => page.getByLabel('Message', { exact: true });
