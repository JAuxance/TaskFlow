<script setup lang="ts">
// "Settings" tab: name, and for the primary owner the transfer of
// ownership and the deletion of the workspace.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Workspace, WorkspaceMember } from '../api/types';
import {
    deleteWorkspace, renameWorkspace, transferWorkspaceOwner,
} from '../api/workspaces';
import FormMessage from '../components/FormMessage.vue';
import { useBusy } from '../composables/useBusy';


const props = defineProps<{ workspace: Workspace; members: WorkspaceMember[] | null; isOwner: boolean; hidden: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const router = useRouter();

// --- Name ----------------------------------------------------------------------

const name = ref(props.workspace.name);
const nameMessage = ref('');
const { busy: renaming, run: runRename } = useBusy();

function rename() {
    const entered = name.value.trim();
    if (!entered) {
        nameMessage.value = 'Enter a workspace name.';
        return;
    }
    return runRename(async () => {
        nameMessage.value = '';
        const result = await renameWorkspace(props.workspace.id, entered);
        if (result.ok) emit('changed');
        else nameMessage.value = result.data.error || 'Could not save the workspace.';
    });
}

// --- Ownership -----------------------------------------------------------------

/** Only another member who already has the Owner role can become primary owner. */
const eligibleOwners = computed(() => (props.members ?? [])
    .filter(member => member.role === 'owner' && member.user_id !== props.workspace.owner_id));
const transferHelp = computed(() => !props.members ? 'Load workspace members before transferring ownership.'
    : eligibleOwners.value.length ? '' : 'Give another member the Owner role in the Members tab to transfer ownership.');
const newOwner = ref('');
const transferMessage = ref('');
const { busy: transferring, run: runTransfer } = useBusy();

function transfer() {
    const target = eligibleOwners.value.find(member => member.user_id === Number(newOwner.value));
    if (!target) return;
    if (!window.confirm(`Transfer primary ownership to ${target.user_name}? They will control ownership and workspace deletion.`)) return;
    return runTransfer(async () => {
        transferMessage.value = '';
        const result = await transferWorkspaceOwner(props.workspace.id, target.user_id);
        if (result.ok) emit('changed');
        else transferMessage.value = result.data.error || 'Could not transfer ownership.';
    });
}

// --- Deletion ------------------------------------------------------------------

const deleteMessage = ref('');
const { busy: deleting, run: runDelete } = useBusy();

function remove() {
    // Typing the exact name protects against a click made by mistake.
    const confirmation = window.prompt(
        `To permanently delete this workspace and its projects and tasks, type its name exactly: ${props.workspace.name}`);
    if (confirmation === null) return;
    if (confirmation !== props.workspace.name) {
        deleteMessage.value = 'The name does not match. Workspace deletion cancelled.';
        return;
    }
    return runDelete(async () => {
        deleteMessage.value = '';
        const result = await deleteWorkspace(props.workspace.id);
        if (result.ok) await router.push({ name: 'home' });
        else deleteMessage.value = result.data.error || 'Could not delete the workspace.';
    });
}
</script>

<template>
    <section id="panel-settings" class="tab-panel settings-panel" role="tabpanel" aria-labelledby="tab-settings" tabindex="0" :hidden="hidden">
        <div class="section-heading">
            <div><h2>Workspace settings</h2><p class="section-description">Manage this workspace's identity and ownership.</p></div>
        </div>
        <div class="settings-stack">
            <section class="settings-card" aria-labelledby="workspace-general-heading">
                <div class="settings-card-heading"><h3 id="workspace-general-heading">General</h3><p class="section-description">A clear name helps your team find the right workspace.</p></div>
                <form id="workspace-settings-form" class="inline-form workspace-settings" @submit.prevent="rename">
                    <div class="field field-wide">
                        <label for="workspace-name">Workspace name</label>
                        <input id="workspace-name" v-model="name" name="name" type="text" maxlength="50" required>
                    </div>
                    <button id="save-workspace-button" type="submit" class="btn-primary" :disabled="renaming" :aria-busy="renaming || undefined">Save name</button>
                </form>
                <FormMessage id="workspace-message" :text="nameMessage" />
            </section>


            <section v-if="isOwner" class="settings-card danger-zone" aria-labelledby="workspace-ownership-heading">
                <div class="settings-card-heading"><h3 id="workspace-ownership-heading">Ownership and deletion</h3><p class="section-description">Only the primary owner can make these changes.</p></div>
                <div class="danger-action workspace-transfer">
                    <h4>Transfer primary ownership</h4>
                    <p class="section-description">Another owner will manage ownership and workspace deletion. You will keep the Owner role.</p>
                    <form id="owner-transfer-form" class="inline-form" @submit.prevent="transfer">
                        <div class="field field-wide">
                            <label for="owner-transfer-select">New primary owner</label>
                            <select id="owner-transfer-select" v-model="newOwner" required :disabled="!eligibleOwners.length || transferring">
                                <option value="">Choose an owner</option>
                                <option v-for="member in eligibleOwners" :key="member.user_id" :value="String(member.user_id)">{{ member.user_name || 'Member' }}</option>
                            </select>
                        </div>
                        <button type="submit" class="btn-secondary" :disabled="!eligibleOwners.length || transferring" :aria-busy="transferring || undefined">Transfer ownership</button>
                    </form>
                    <p id="owner-transfer-help" class="field-hint">{{ transferHelp }}</p>
                    <FormMessage id="owner-transfer-message" :text="transferMessage" />
                </div>
                <div class="danger-action">
                    <div><h4>Delete workspace</h4><p class="section-description">Permanently delete this workspace, its projects and all their tasks.</p></div>
                    <button id="delete-workspace-button" type="button" class="btn-danger" :disabled="deleting" :aria-busy="deleting || undefined" @click="remove">Delete workspace</button>
                    <FormMessage id="workspace-delete-message" :text="deleteMessage" />
                </div>
            </section>
        </div>
    </section>
</template>
