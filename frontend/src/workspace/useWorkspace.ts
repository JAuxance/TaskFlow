import { computed, ref } from 'vue';
import type { Workspace, WorkspaceMember, WorkspaceRole } from '../api/types';
import { getWorkspace, getWorkspaceMembers } from '../api/workspaces';
import { useSessionStore } from '../stores/session';

/**
 * A workspace, its members and what the signed-in user may do in it. Shared
 * by the workspace screen and the screens of its projects and tasks.
 */
export function useWorkspace() {
    const session = useSessionStore();
    const workspace = ref<Workspace | null>(null);
    /** null while the list could not be read: nothing is assumed about roles. */
    const members = ref<WorkspaceMember[] | null>(null);
    const membersError = ref('');
    const error = ref('');

    const isOwner = computed(() => workspace.value !== null && workspace.value.owner_id === session.user?.id);
    const role = computed<WorkspaceRole | null>(() => isOwner.value ? 'owner'
        : members.value?.find(member => member.user_id === session.user?.id)?.role ?? null);
    const canManage = computed(() => role.value === 'owner' || role.value === 'admin');

    /** Read the workspace and its members; false when the workspace is unavailable. */
    async function load(workspaceId: number): Promise<boolean> {
        const [workspaceResult, membersResult] = await Promise.all([
            getWorkspace(workspaceId), getWorkspaceMembers(workspaceId),
        ]);
        members.value = membersResult.ok ? membersResult.data : null;
        membersError.value = membersResult.ok ? '' : membersResult.data.error;
        if (!workspaceResult.ok) {
            workspace.value = null;
            error.value = workspaceResult.data.error;
            return false;
        }
        workspace.value = workspaceResult.data;
        error.value = '';
        return true;
    }

    return { workspace, members, membersError, error, isOwner, role, canManage, load };
}

export type WorkspaceContext = ReturnType<typeof useWorkspace>;
