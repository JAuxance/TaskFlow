<script setup lang="ts">
// "Members" tab: who has access, with which role, and what the current user
// may change. Same rules as the members table of the current frontend.
import { reactive } from 'vue';
import { useRouter } from 'vue-router';
import type { Workspace, WorkspaceMember, WorkspaceRole } from '../api/types';
import { removeWorkspaceMember, setWorkspaceMemberRole } from '../api/workspaces';
import FormMessage from '../components/FormMessage.vue';
import ProtectedImage from '../components/ProtectedImage.vue';
import { ROLE_LABELS, initialOf } from '../domain';
import { useSessionStore } from '../stores/session';

const props = defineProps<{
    workspace: Workspace;
    members: WorkspaceMember[] | null;
    membersError: string;
    role: WorkspaceRole | null;
    isOwner: boolean;
    canManage: boolean;
    /** Roles the current user may give to someone else. */
    allowedRoles: WorkspaceRole[];
    hidden: boolean;
}>();
const emit = defineEmits<{ changed: [] }>();

const router = useRouter();
const session = useSessionStore();
const message = reactive<{ text: string; type: 'error' | 'success' }>({ text: '', type: 'error' });
/** Members whose role or membership is being saved. */
const saving = reactive(new Set<number>());

const isSelf = (member: WorkspaceMember) => member.user_id === session.user?.id;

/** Nobody manages the primary owner; an admin only manages members and guests. */
function canManageMember(member: WorkspaceMember): boolean {
    return props.canManage && member.user_id !== props.workspace.owner_id
        && (props.isOwner || member.role !== 'owner')
        && (props.role !== 'admin' || member.role === 'member' || member.role === 'guest');
}

async function changeRole(member: WorkspaceMember, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const role = select.value as WorkspaceRole;
    saving.add(member.user_id);
    message.text = '';
    try {
        const result = await setWorkspaceMemberRole(props.workspace.id, member.user_id, role);
        if (result.ok) {
            member.role = role;
            Object.assign(message, { text: `Role updated for ${member.user_name}.`, type: 'success' });
        } else {
            select.value = member.role;
            Object.assign(message, { text: result.data.error || "Could not update this member's role.", type: 'error' });
        }
    } finally {
        saving.delete(member.user_id);
    }
}

async function remove(member: WorkspaceMember): Promise<void> {
    if (!window.confirm(`Remove ${member.user_name} from this workspace?`)) return;
    saving.add(member.user_id);
    message.text = '';
    try {
        const result = await removeWorkspaceMember(props.workspace.id, member.user_id);
        if (result.ok) emit('changed');
        else Object.assign(message, { text: result.data.error || 'Could not remove this member.', type: 'error' });
    } finally {
        saving.delete(member.user_id);
    }
}

const openConversation = (member: WorkspaceMember) =>
    router.push({ name: 'messages', params: { userId: member.user_id }, query: { workspace: props.workspace.id } });
</script>

<template>
    <section id="panel-members" class="tab-panel" role="tabpanel" aria-labelledby="tab-members" tabindex="0" :hidden="hidden">
        <div class="section-heading">
            <div><h2>Members</h2><p class="section-description">See who has access to this workspace{{ canManage ? ' and manage their roles' : '' }}.</p></div>
        </div>
        <FormMessage id="member-message" :text="members ? message.text : membersError || 'Could not load workspace members.'" :type="members ? message.type : 'error'" />
        <div id="members-list" class="table-scroll">
            <p v-if="members && !members.length" class="empty-state">No members in this workspace.</p>
            <table v-else-if="members" class="member-table">
                <thead><tr>
                    <th scope="col">Name</th>
                    <th scope="col">Role</th><th scope="col">Actions</th>
                </tr></thead>
                <tbody>
                    <tr v-for="member in members" :key="member.user_id">
                        <td><span class="member-identity"><span class="avatar" aria-hidden="true"><span>{{ initialOf(member.user_name) }}</span><ProtectedImage :path="member.avatar_url" /></span><span class="member-name">{{ member.user_name }}{{ isSelf(member) ? ' (you)' : '' }}</span></span></td>
                        <td class="member-role-cell" data-label="Role">
                            <select
                                v-if="canManageMember(member)" class="member-role-select" :aria-label="`Role for ${member.user_name}`"
                                :value="member.role" :disabled="saving.has(member.user_id)" @change="changeRole(member, $event)"
                            >
                                <option v-for="value in allowedRoles" :key="value" :value="value">{{ ROLE_LABELS[value] }}</option>
                            </select>
                            <template v-else>{{ ROLE_LABELS[member.role] ?? member.role }}</template>
                        </td>
                        <td><button v-if="!isSelf(member)" type="button" class="btn-quiet direct-message-button" :aria-label="`Send a private message to ${member.user_name}`" @click="openConversation(member)">Message</button>{{ canManageMember(member) && !isSelf(member) ? ' ' : '' }}<button v-if="canManageMember(member)" type="button" class="btn-quiet btn-danger-quiet delete-member-button" :aria-label="`Remove ${member.user_name} from workspace`" :disabled="saving.has(member.user_id)" @click="remove(member)">Remove</button><span v-else-if="isSelf(member)" aria-label="No available actions">—</span></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>
