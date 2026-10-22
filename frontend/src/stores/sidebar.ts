import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Workspace } from '../api/types';
import { getWorkspaces } from '../api/workspaces';

/** Workspaces available to the signed-in user. */
export const useSidebarStore = defineStore('sidebar', () => {
    const workspaces = ref<Workspace[]>([]);
    const workspacesError = ref('');

    async function refresh(): Promise<void> {
        const result = await getWorkspaces();
        if (result.status === 401) return;
        workspaces.value = result.ok ? result.data : [];
        workspacesError.value = result.ok ? '' : result.data.error;
    }

    return { workspaces, workspacesError, refresh };
});
