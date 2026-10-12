import { execFileSync } from 'node:child_process';
import path from 'node:path';

// The frontend is served by Vite, which relays API calls to the backend. The
// tests also call the backend directly to prepare data.
export const FRONTEND_ORIGIN = 'http://localhost:5173';
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
