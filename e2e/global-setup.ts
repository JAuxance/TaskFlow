import { SENTINEL_EMAIL, backendIdentity, compose } from './support/stack';

export default async function globalSetup(): Promise<void> {
    // These tests create, expire and delete data. They must never reach the
    // development or production backend, which listens on the same port.
    const before = await backendIdentity();
    if (before !== undefined && before !== SENTINEL_EMAIL) {
        throw new Error(
            'Port 5000 is already served by another TaskFlow backend (probably your development '
            + 'stack). Stop it with `docker compose down`: the browser tests only run against '
            + 'the disposable stack from compose.e2e.yaml.');
    }

    compose('up', '-d', '--build', '--wait');

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        try {
            const health = await fetch('http://127.0.0.1:5000/health', { signal: AbortSignal.timeout(2000) });
            if (health.ok && (await health.json()).database === 'ok') break;
        } catch { /* the backend is still starting */ }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (await backendIdentity() !== SENTINEL_EMAIL) {
        throw new Error('The disposable TaskFlow stack did not start: check `docker compose -f compose.e2e.yaml logs`.');
    }
}
