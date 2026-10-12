import { apiRequest, resetCsrfToken, type ApiResult } from './client';
import type { Account, RegisteredAccount } from './types';

const json = (body: unknown) => ({
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

/** The server issues a new CSRF token as soon as the session changes. */
async function changingSession<T>(request: Promise<ApiResult<T>>): Promise<ApiResult<T>> {
    const result = await request;
    if (result.ok) resetCsrfToken();
    return result;
}

export function login(email: string, password: string) {
    // A 401 here means wrong credentials, not an expired session.
    return changingSession(apiRequest<Account>('/api/auth/login', {
        method: 'POST', allowUnauthorized: true, ...json({ email, password }),
    }));
}

export function register(username: string, email: string, password: string) {
    return changingSession(apiRequest<RegisteredAccount>('/api/users', {
        method: 'POST', ...json({ username, email, password }),
    }));
}

export function logout() {
    // A 401 here means the session was already closed: the caller treats it as done.
    return changingSession(apiRequest<{ message: string }>('/api/auth/logout', {
        method: 'POST', allowUnauthorized: true,
    }));
}
