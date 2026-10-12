import { expect, test } from '../support/test';
import { PASSWORD, emailOf, signUp } from '../support/api';

// Runs with E2E_FRONTEND=vue only. No screen is migrated yet: these tests show
// that the Vue application reaches the backend through the Vite proxy, with
// the origin, the session cookie and the CSRF token the server requires.

test('the application loads and reads the session through the proxy', async ({ page }) => {
    const profile = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/me');
    await page.goto('/');

    expect((await profile).status()).toBe(401);
    await expect(page.getByRole('heading', { name: 'Vue foundation' })).toBeVisible();
    await expect(page.getByText('Not signed in.')).toBeVisible();
    // The stylesheet of the current frontend is applied, with its local font.
    await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
});

test('a session opened on the API is recognized by the application', async ({ page, context }) => {
    await signUp(context.request, 'alice');
    await page.goto('/');

    await expect(page.getByText('Signed in as alice.')).toBeVisible();
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
    await page.reload();
    await expect(page.getByText('Signed in as alice.')).toBeVisible();
});

test('unknown paths fall back to the application', async ({ page }) => {
    await page.goto('/workspaces/12/members');

    await expect(page.getByRole('heading', { name: 'Vue foundation' })).toBeVisible();
    await expect(page).toHaveURL('/');
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
