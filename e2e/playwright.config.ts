import { defineConfig } from '@playwright/test';
import { FRONTEND_ORIGIN, isLegacyFrontend } from './support/stack';

const desktop = { viewport: { width: 1440, height: 900 } };
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

// Tests tagged @vue also pass on the Vue frontend: tag a test when its screens
// are migrated, until every test is tagged and the current frontend can be
// retired. Tests tagged @vue-only check the Vite setup and make no sense on
// the current frontend.
const selection = isLegacyFrontend ? { grepInvert: /@vue-only/ } : { grep: /@vue/ };

export default defineConfig({
    testDir: './tests',
    outputDir: './test-results',
    // One disposable database is shared and reset before each test.
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    timeout: 30_000,
    expect: { timeout: 7_000 },
    ...selection,
    globalSetup: './global-setup.ts',
    globalTeardown: './global-teardown.ts',
    // No platform suffix: reference screenshots are produced on Linux with Chromium only.
    snapshotPathTemplate: '{testDir}/../__screenshots__/{projectName}/{arg}{ext}',
    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['junit', { outputFile: isLegacyFrontend ? '../reports/e2e-junit.xml' : '../reports/e2e-vue-junit.xml' }],
    ],
    use: {
        baseURL: FRONTEND_ORIGIN,
        browserName: 'chromium',
        locale: 'en-GB',
        timezoneId: 'Europe/Paris',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: isLegacyFrontend ? {
        // Same static server as the README; the frontend then calls the API on port 5000.
        command: 'python3 -m http.server 5500 --bind 127.0.0.1 --directory ../frontend',
        url: 'http://127.0.0.1:5500/',
        reuseExistingServer: false,
        stdout: 'ignore',
        stderr: 'ignore',
    } : {
        // Vite serves the Vue frontend and proxies the API, as Nginx does in production.
        command: 'npm run dev --prefix ../frontend-vue',
        url: 'http://127.0.0.1:5173/',
        // E2E_REUSE_VITE=1 tests through a Vite server you already have running.
        reuseExistingServer: process.env.E2E_REUSE_VITE === '1',
        stdout: 'ignore',
        stderr: 'pipe',
    },
    projects: [
        { name: 'desktop-light', use: { ...desktop, colorScheme: 'light' } },
        { name: 'mobile-light', use: { ...mobile, colorScheme: 'light' }, testMatch: /(responsive|visual)\.spec\.ts/ },
        { name: 'desktop-dark', use: { ...desktop, colorScheme: 'dark' }, testMatch: /visual\.spec\.ts/ },
        { name: 'mobile-dark', use: { ...mobile, colorScheme: 'dark' }, testMatch: /visual\.spec\.ts/ },
    ],
});
