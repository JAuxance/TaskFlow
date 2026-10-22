import type { Page } from '@playwright/test';
import { expect, expectSignedIn, test } from '../support/test';
import { PASSWORD, api, emailOf, signUp, type User } from '../support/api';

async function fillLogin(page: Page, name: string, password = PASSWORD) {
    await page.getByLabel('Email').fill(emailOf(name));
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
}

test.describe('with an existing account', () => {
    test.beforeEach(async ({ playwright }) => {
        const setup = await playwright.request.newContext();
        await signUp(setup, 'alice');
        await setup.dispose();
    });

    test('signing in opens a session that survives a reload', async ({ page }) => {
        await page.goto('/login');
        await fillLogin(page, 'alice');

        await expectSignedIn(page, 'alice');
        expect((await api<User>(page.context().request, 'GET', '/api/auth/me')).username).toBe('alice');
        await page.reload();
        await expectSignedIn(page, 'alice');
    });

    test('a wrong password is refused with a clear message', async ({ page }) => {
        await page.goto('/login');
        await fillLogin(page, 'alice', 'not-the-password');

        await expect(page.getByRole('alert')).toHaveText('Invalid email or password. Please try again.');
        await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
        await api(page.context().request, 'GET', '/api/auth/me', undefined, 401);
    });

    test('an email address cannot be registered twice', async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('button', { name: 'Create an account' }).click();
        await page.getByLabel('Username').fill('alice2');
        await page.getByLabel('Email').fill(emailOf('alice'));
        await page.getByLabel('Password').fill(PASSWORD);
        await page.getByRole('button', { name: 'Create account' }).click();

        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
    });
});

test('registration opens a session without a second sign-in', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();

    await page.getByLabel('Username').fill('alice');
    await page.getByLabel('Email').fill(emailOf('alice'));
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expectSignedIn(page, 'alice');
    expect((await api<User>(page.context().request, 'GET', '/api/auth/me')).username).toBe('alice');
    await page.reload();
    await expectSignedIn(page, 'alice');
});

test('the login and registration screens lead to each other', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await expect(page).toHaveTitle('Login — TaskFlow');

    await page.getByRole('button', { name: 'Create an account' }).click();
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
    await expect(page).toHaveTitle('Create account — TaskFlow');

    await page.getByRole('button', { name: 'Already have an account? Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});

test('signing out from the profile closes the session on the server', async ({ actor }) => {
    const { page } = await actor('alice');
    await expect(page.getByRole('heading', { name: 'Your next project starts here' })).toBeVisible();

    await page.getByRole('button', { name: 'Edit your profile' }).click();
    await page.getByRole('dialog', { name: 'Your profile' }).getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    // The session is closed on the server, not only hidden by the interface.
    await api(page.context().request, 'GET', '/api/auth/me', undefined, 401);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    await fillLogin(page, 'alice');
    await expect(page.getByRole('heading', { name: 'Your next project starts here' })).toBeVisible();
});
