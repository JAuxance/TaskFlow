import { expect, expectSignedIn, test } from '../support/test';
import { PASSWORD, createProject, createWorkspace, emailOf, signUp } from '../support/api';

// Vue frontend only (E2E_FRONTEND=vue). These tests check what the current
// frontend does not have: the Vite proxy, URLs, and the notice shown in place
// of the screens that are not migrated yet.
test.describe('Vite setup', { tag: '@vue-only' }, () => {
    test('the application reads the session through the proxy', async ({ page }) => {
        const profile = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/me');
        await page.goto('/');

        expect((await profile).status()).toBe(401);
        await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
        await expect(page).toHaveURL('/login');
        // The stylesheet of the current frontend is applied, with its local font.
        await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
    });

    test('a mutation sent by the page passes the origin and CSRF checks', async ({ page }) => {
        await page.goto('/');
        const statuses = await page.evaluate(async account => {
            const register = (headers: Record<string, string>) => fetch('/api/users', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(account),
            });
            const withoutToken = (await register({})).status;
            const token = (await (await fetch('/api/auth/csrf', { credentials: 'include' })).json()).csrf_token;
            return { withoutToken, withToken: (await register({ 'X-CSRF-Token': token })).status };
        }, { username: 'alice', email: emailOf('alice'), password: PASSWORD });

        expect(statuses).toEqual({ withoutToken: 403, withToken: 201 });
    });

    test('Socket.IO accepts a WebSocket opened through the proxy', async ({ page }) => {
        await page.goto('/');
        const firstPacket = await page.evaluate(() => new Promise<string>((resolve, reject) => {
            const socket = new WebSocket(`ws://${location.host}/socket.io/?EIO=4&transport=websocket`);
            socket.onmessage = event => { socket.close(); resolve(String(event.data)); };
            socket.onerror = () => reject(new Error('The WebSocket was refused'));
        }));

        // "0" is the Engine.IO open packet: the server accepted this origin.
        expect(firstPacket).toMatch(/^0\{"sid":/);
    });

    test('URLs are protected according to the session', async ({ page, context }) => {
        // A visitor is sent to the login screen, whatever the address.
        await page.goto('/workspaces/12/members');
        await expect(page).toHaveURL('/login');
        await page.goto('/register');
        await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();

        // A signed-in user no longer sees the login or registration screens.
        await signUp(context.request, 'alice');
        await page.goto('/login');
        await expect(page).toHaveURL('/');
        await expectSignedIn(page, 'alice');
        await page.goto('/register');
        await expect(page).toHaveURL('/');
    });

    test('signing out and in again renews the CSRF token without a reload', async ({ page, context }) => {
        await signUp(context.request, 'alice');
        await page.goto('/');
        const refused: number[] = [];
        page.on('response', response => { if (response.status() === 403) refused.push(response.status()); });

        for (let round = 0; round < 2; round++) {
            await page.getByRole('button', { name: 'Edit your profile' }).click();
            await page.getByRole('dialog', { name: 'Your profile' }).getByRole('button', { name: 'Sign out' }).click();
            await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
            await page.getByLabel('Email').fill(emailOf('alice'));
            await page.getByLabel('Password').fill(PASSWORD);
            await page.getByRole('button', { name: 'Login', exact: true }).click();
            await expectSignedIn(page, 'alice');
        }
        // The token is renewed at each session change: the server never has to refuse one.
        expect(refused).toEqual([]);
    });

    test('a screen that is not migrated yet says so, and the browser history works', async ({ actor }) => {
        const { page, request } = await actor('alice');
        const workspace = await createWorkspace(request, 'Design studio');
        await createProject(request, workspace.id, 'Website redesign');
        await page.reload();

        await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Design studio', exact: true }).click();
        await expect(page).toHaveURL(`/workspaces/${workspace.id}`);
        await expect(page.getByRole('heading', { level: 1, name: 'Design studio' })).toBeVisible();

        await page.getByRole('region', { name: 'Projects', exact: true }).getByRole('button', { name: /Website redesign/ }).click();
        await expect(page).toHaveURL(/\/projects\/\d+$/);
        await expect(page.getByRole('heading', { name: 'Not migrated yet' })).toBeVisible();

        await page.goBack();
        await expect(page.getByRole('heading', { level: 1, name: 'Design studio' })).toBeVisible();
        await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: 'Workspaces' }).click();
        await expect(page).toHaveURL('/');
        await expect(page.getByRole('heading', { name: 'All workspaces' })).toBeVisible();
    });

    test('a workspace opens directly on the tab named in the address', async ({ actor }) => {
        const { page, request } = await actor('alice');
        const workspace = await createWorkspace(request, 'Design studio');

        await page.goto(`/workspaces/${workspace.id}/members`);
        await expect(page.getByRole('tab', { name: /Members/ })).toHaveAttribute('aria-selected', 'true');
        await expect(page).toHaveTitle('Design studio — TaskFlow');

        // A workspace the user cannot see is reported, without leaving the application.
        await page.goto('/workspaces/999999');
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page.getByRole('button', { name: 'All workspaces' })).toBeVisible();
    });
});
