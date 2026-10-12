import { defineConfig } from '@playwright/test';
import { FRONTEND_ORIGIN } from './support/stack';

const desktop = { viewport: { width: 1440, height: 900 } };
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

export default defineConfig({
    testDir: './tests',
    outputDir: './test-results',
    // One disposable database is shared and reset before each test.
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    timeout: 30_000,
    expect: { timeout: 7_000 },
    globalSetup: './global-setup.ts',
    globalTeardown: './global-teardown.ts',
    // No platform suffix: reference screenshots are produced on Linux with Chromium only.
    snapshotPathTemplate: '{testDir}/../__screenshots__/{projectName}/{arg}{ext}',
    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['junit', { outputFile: '../reports/e2e-junit.xml' }],
    ],
    use: {
        baseURL: FRONTEND_ORIGIN,
        browserName: 'chromium',
        locale: 'en-GB',
        timezoneId: 'Europe/Paris',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: {
        // Same static server as the README; the frontend then calls the API on port 5000.
        command: 'python3 -m http.server 5500 --bind 127.0.0.1 --directory ../frontend',
        url: 'http://127.0.0.1:5500/',
        reuseExistingServer: false,
        stdout: 'ignore',
        stderr: 'ignore',
    },
    projects: [
        { name: 'desktop-light', use: { ...desktop, colorScheme: 'light' } },
        { name: 'mobile-light', use: { ...mobile, colorScheme: 'light' }, testMatch: /(responsive|visual)\.spec\.ts/ },
        { name: 'desktop-dark', use: { ...desktop, colorScheme: 'dark' }, testMatch: /visual\.spec\.ts/ },
        { name: 'mobile-dark', use: { ...mobile, colorScheme: 'dark' }, testMatch: /visual\.spec\.ts/ },
    ],
});
