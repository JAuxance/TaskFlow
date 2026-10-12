// Every call resolves to { ok, status, data } and never throws. On failure,
// data.error is always a message for the user.

export interface ApiFailure {
    error: string;
    code?: string;
}

export type ApiResult<T> =
    | { ok: true; status: number; data: T }
    | { ok: false; status: number; data: ApiFailure };

export interface ApiOptions extends Omit<RequestInit, 'credentials' | 'signal'> {
    /** Give up after this delay instead of waiting forever. */
    timeoutMs?: number;
    /** A 401 is an expected answer here (login, first profile read), not an expired session. */
    allowUnauthorized?: boolean;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DEFAULT_TIMEOUT_MS = 15_000;

let csrfToken: string | null = null;
let csrfRequest: Promise<ApiResult<{ csrf_token?: unknown }>> | null = null;
let unauthorizedHandler: (() => void) | null = null;

/** Called whenever the server answers 401 to a request that expected a session. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
    unauthorizedHandler = handler;
}

/** The server issues a new token when the session changes (login, registration, logout). */
export function resetCsrfToken(): void {
    csrfToken = null;
}

const failure = (status: number, error: string): ApiResult<never> => ({ ok: false, status, data: { error } });

async function send<T>(endpoint: string, options: ApiOptions, headers: Headers): Promise<ApiResult<T>> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, allowUnauthorized: _allowUnauthorized, ...init } = options;
    let response: Response;
    try {
        response = await fetch(endpoint, {
            ...init, headers, credentials: 'include', signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        return failure(0, error instanceof DOMException && error.name === 'TimeoutError'
            ? 'TaskFlow took too long to respond. Check your connection and try again.'
            : 'Unable to reach TaskFlow. Check your connection and try again.');
    }
    let data: unknown;
    try {
        data = await response.json();
    } catch {
        return failure(response.status, response.status === 413
            ? 'This image is too large. Choose a smaller file (under 5 MB).'
            : 'The server returned an unexpected response. Please try again.');
    }
    if (response.ok) return { ok: true, status: response.status, data: data as T };
    const body = (typeof data === 'object' && data !== null ? data : {}) as Partial<ApiFailure>;
    if (typeof body.error !== 'string') {
        return failure(response.status, response.status === 429
            ? 'Too many requests. Please wait a moment and try again.'
            : 'This action could not be completed. Please try again.');
    }
    return { ok: false, status: response.status, data: { ...body, error: body.error } };
}

function requestCsrfToken() {
    // Concurrent saves share one request, so they all use the token of the same session.
    csrfRequest ??= send<{ csrf_token?: unknown }>('/api/auth/csrf', { cache: 'no-store' }, new Headers())
        .finally(() => { csrfRequest = null; });
    return csrfRequest;
}

async function sendMutation<T>(endpoint: string, options: ApiOptions): Promise<ApiResult<T>> {
    if (csrfToken === null) {
        const csrf = await requestCsrfToken();
        if (!csrf.ok) return csrf;
        if (typeof csrf.data.csrf_token !== 'string') {
            return failure(0, 'Unable to prepare a secure request. Please try again.');
        }
        csrfToken = csrf.data.csrf_token;
    }
    const headers = new Headers(options.headers);
    headers.set('X-CSRF-Token', csrfToken);
    return send<T>(endpoint, options, headers);
}

export async function apiRequest<T = unknown>(endpoint: string, options: ApiOptions = {}): Promise<ApiResult<T>> {
    const method = (options.method ?? 'GET').toUpperCase();
    let result: ApiResult<T>;
    if (SAFE_METHODS.has(method)) {
        result = await send<T>(endpoint, options, new Headers(options.headers));
    } else {
        result = await sendMutation<T>(endpoint, options);
        // The server refused before doing anything, so sending the same request
        // once more with a fresh token cannot apply the change twice.
        if (!result.ok && result.status === 403 && result.data.code === 'csrf_failed') {
            resetCsrfToken();
            result = await sendMutation<T>(endpoint, options);
        }
    }
    if (result.status === 401 && !options.allowUnauthorized) unauthorizedHandler?.();
    return result;
}

/** Read every page of a list endpoint (100 items per page, the server maximum). */
export async function apiCollection<T = unknown>(endpoint: string): Promise<ApiResult<T[]>> {
    const items: T[] = [];
    for (let page = 1; ; page += 1) {
        const result = await apiRequest<unknown>(`${endpoint}?limit=100&page=${page}`);
        if (!result.ok) return result;
        if (!Array.isArray(result.data)) {
            return failure(result.status, 'The server returned an unexpected list. Please try again.');
        }
        items.push(...result.data as T[]);
        if (result.data.length < 100) return { ok: true, status: result.status, data: items };
    }
}
