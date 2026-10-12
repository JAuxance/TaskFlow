import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiRequest, resetCsrfToken } from '../api/client';
import type { User } from '../api/types';

export type SessionStatus = 'unknown' | 'signed-in' | 'signed-out' | 'unavailable';

export const useSessionStore = defineStore('session', () => {
    const user = ref<User | null>(null);
    const status = ref<SessionStatus>('unknown');
    const error = ref('');
    let firstLoad: Promise<void> | null = null;

    /** Ask the server who is signed in; a 401 simply means nobody is. */
    async function load(): Promise<void> {
        const result = await apiRequest<User>('/api/auth/me', { allowUnauthorized: true });
        if (result.ok) {
            user.value = result.data;
            status.value = 'signed-in';
            error.value = '';
        } else if (result.status === 401) {
            expire();
        } else {
            user.value = null;
            status.value = 'unavailable';
            error.value = result.data.error;
        }
    }

    /** Resolve once the session is known, asking the server only the first time. */
    function ensureLoaded(): Promise<void> {
        if (status.value !== 'unknown') return Promise.resolve();
        firstLoad ??= load();
        return firstLoad;
    }

    /** The server no longer recognizes the session: forget it locally as well. */
    function expire(): void {
        user.value = null;
        status.value = 'signed-out';
        error.value = '';
        resetCsrfToken();
    }

    return { user, status, error, load, ensureLoaded, expire };
});
