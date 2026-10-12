import { expect, test } from '../support/test';

// Every other test runs with reduced motion (see playwright.config.ts).
test('screens are animated, unless the system asks for less motion', async ({ browser, baseURL }) => {
    for (const [reducedMotion, animation] of [['no-preference', 'rise'], ['reduce', 'none']] as const) {
        const context = await browser.newContext({ baseURL, reducedMotion });
        const page = await context.newPage();
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
        const played = await page.locator('#login-form').evaluate(form => getComputedStyle(form).animationName);
        expect(played, `with ${reducedMotion}`).toBe(animation);
        await context.close();
    }
});
