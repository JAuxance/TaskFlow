import { expect, test } from '../support/test';
import { PASSWORD, emailOf, signUp } from '../support/api';

test('a visitor registers, signs out and signs back in', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();

    await page.getByLabel('Username').fill('alice');
    await page.getByLabel('Email').fill(emailOf('alice'));
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Registration opens the session: the dashboard appears without a second login.
    await expect(page.getByRole('heading', { name: 'All workspaces' })).toBeVisible();
    const profile = page.getByRole('button', { name: 'Edit your profile' });
    await expect(profile).toContainText('alice');
    await expect(profile).toContainText(emailOf('alice'));

    await profile.click();
    await page.getByRole('dialog', { name: 'Your profile' }).getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    // The session is closed on the server, not only hidden by the interface.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    await page.getByLabel('Email').fill(emailOf('alice'));
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'All workspaces' })).toBeVisible();

    // The session survives a reload.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'All workspaces' })).toBeVisible();
});

test('a wrong password is refused with a clear message', async ({ page, playwright }) => {
    const setup = await playwright.request.newContext();
    await signUp(setup, 'alice');
    await setup.dispose();

    await page.goto('/');
    await page.getByLabel('Email').fill(emailOf('alice'));
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Login', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText('Invalid email or password. Please try again.');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});

test('an email address cannot be registered twice', async ({ page, playwright }) => {
    const setup = await playwright.request.newContext();
    await signUp(setup, 'alice');
    await setup.dispose();

    await page.goto('/');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await page.getByLabel('Username').fill('alice2');
    await page.getByLabel('Email').fill(emailOf('alice'));
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
});
