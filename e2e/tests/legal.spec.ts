import { expect, test } from '../support/test';

test('the privacy and cookies pages are open to a visitor', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Privacy information' }).getByRole('link', { name: 'Privacy' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
    await expect(page).toHaveTitle('Privacy — TaskFlow');
    await expect(page.getByRole('heading', { name: 'The data used by TaskFlow' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Account deletion and shared content' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'contact the French data protection authority, the CNIL' }))
        .toHaveAttribute('href', 'https://www.cnil.fr/fr/adresser-une-plainte');

    // Each page links to the other, and its footer shows where the visitor is.
    await page.getByRole('main').getByRole('link', { name: 'Cookies & storage' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cookies & storage' })).toBeVisible();
    await expect(page).toHaveTitle('Cookies & storage — TaskFlow');
    const footer = page.getByRole('navigation', { name: 'Privacy information' });
    await expect(footer.getByRole('link', { name: 'Cookies & storage' })).toHaveAttribute('aria-current', 'page');
    await expect(footer.getByRole('link', { name: 'Privacy' })).not.toHaveAttribute('aria-current', 'page');

    await page.getByRole('link', { name: 'Back to TaskFlow' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Plan projects/ })).toBeVisible();
});

test('a signed-in user reads the privacy page and comes back to the application', async ({ actor }) => {
    const { page } = await actor('alice');
    await page.getByRole('navigation', { name: 'Privacy information' }).getByRole('link', { name: 'Privacy' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();

    await page.getByRole('navigation', { name: 'Privacy information' }).getByRole('link', { name: 'TaskFlow' }).click();
    await expect(page.getByRole('heading', { name: 'Your next project starts here' })).toBeVisible();
});

test('the privacy page matches its reference', async ({ page }) => {
    await page.goto('/confidentialite/');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(page).toHaveScreenshot('privacy.png', { fullPage: true });
});
