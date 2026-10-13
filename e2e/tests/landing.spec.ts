import { expect, test } from '../support/test';

// The address "/" presents TaskFlow to a visitor, and is the application for someone signed in.
const presentation = { level: 1, name: /Plan projects/ } as const;

test('a visitor sees the presentation, with the ways in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', presentation)).toBeVisible();
    await expect(page).toHaveTitle('TaskFlow');
    await expect(page.getByRole('img', { name: /A workspace in TaskFlow/ })).toBeVisible();

    await page.getByRole('link', { name: 'Log in' }).click();
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    await page.goBack();
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL('/register');
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
});

test('the presentation shows the application in the theme of the visitor', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const shown = page.locator('.landing-shot:visible');
    await expect(shown).toHaveCount(1);
    await expect(shown).toHaveClass(/landing-shot-dark/);
});

test('someone signed in gets the application instead', async ({ actor }) => {
    const { page } = await actor('alice');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your next project starts here' })).toBeVisible();
    await expect(page.getByRole('heading', presentation)).toHaveCount(0);

    // Signing out leads to the login screen; the presentation is back at "/".
    await page.getByRole('button', { name: 'Edit your profile' }).click();
    await page.getByRole('dialog', { name: 'Your profile' }).getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', presentation)).toBeVisible();
});
