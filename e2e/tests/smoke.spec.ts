import { expect, test } from '../support/test';
import { API_URL, SENTINEL_EMAIL } from '../support/stack';

test('the frontend loads and talks to the disposable backend', { tag: '@vue' }, async ({ page, request }) => {
    const privacy = await request.get(`${API_URL}/api/privacy`);
    expect((await privacy.json()).contact_email).toBe(SENTINEL_EMAIL);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await expect(page).toHaveTitle('Login — TaskFlow');
});
