import { execFileSync } from 'node:child_process';
import path from 'node:path';

// E2E_FRONTEND selects the frontend under test: the current one (default) or
// the Vue rebuild served by Vite. Both talk to the same disposable backend.
export const FRONTEND = process.env.E2E_FRONTEND ?? 'legacy';
if (FRONTEND !== 'legacy' && FRONTEND !== 'vue') {
    throw new Error(`E2E_FRONTEND must be "legacy" or "vue", not "${FRONTEND}"`);
}
export const isLegacyFrontend = FRONTEND === 'legacy';

// Screens the Vue frontend already has. A test that crosses several screens
// stops where the migration stops; on the current frontend it goes all the way.
const VUE_SCREENS = [
    'login', 'register', 'dashboard', 'profile', 'workspace-overview', 'workspace-members',
    'kanban', 'task-details', 'task-details-guest', 'workspace-messages', 'direct-messages',
];
export const isMigrated = (screen: string) => isLegacyFrontend || VUE_SCREENS.includes(screen);

export const FRONTEND_ORIGIN = isLegacyFrontend ? 'http://localhost:5500' : 'http://localhost:5173';
export const API_URL = 'http://localhost:5000';
export const SENTINEL_EMAIL = 'e2e-sentinel@example.com';

const REPO = path.resolve(__dirname, '..', '..');
const COMPOSE_FILE = path.join(REPO, 'compose.e2e.yaml');

/** Run a Docker Compose command against the disposable stack, never another one. */
export function compose(...args: string[]): string {
    return execFileSync('docker', ['compose', '-f', COMPOSE_FILE, ...args], {
        cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
}

/** Run SQL as the owner of the disposable database. */
export function sql(statement: string): string {
    return compose('exec', '-T', 'db', 'psql', '-v', 'ON_ERROR_STOP=1',
        '-U', 'taskflow', '-d', 'taskflow', '-Atc', statement).trim();
}

/** Same reset as the integration tests: every table depends on users. */
export function resetDatabase(): void {
    sql('TRUNCATE users, file_cleanup_jobs RESTART IDENTITY CASCADE');
}

/** Contact address published by whatever backend answers on port 5000, if any. */
export async function backendIdentity(): Promise<string | null | undefined> {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/privacy', { signal: AbortSignal.timeout(2000) });
        return (await response.json()).contact_email ?? null;
    } catch {
        return undefined;
    }
}
