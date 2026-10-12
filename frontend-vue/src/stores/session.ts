import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiRequest, resetCsrfToken } from '../api/client';
import type { User } from '../api/types';

export type SessionStatus = 'unknown' | 'signed-in' | 'signed-out' | 'unavailable';

export const useSessionStore = defineStore('session', () => {
    const user = ref<User | null>(null);
    const status = ref<SessionStatus>('unknown');
    const error = ref('');

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
            status.value = 'unavailable';
            error.value = result.data.error;
        }
    }

    /** The server no longer recognizes the session: forget it locally as well. */
    function expire(): void {
        user.value = null;
        status.value = 'signed-out';
        error.value = '';
        resetCsrfToken();
    }

    return { user, status, error, load, expire };
});
