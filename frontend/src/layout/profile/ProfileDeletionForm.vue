<script setup lang="ts">
// Account deletion in two steps: the server first lists what will be removed,
// then deletes only what the user has reviewed, with their password.
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { deleteAccount, getDeletionPreview } from '../../api/profile';
import type { DeletionPreview } from '../../api/types';
import FormMessage from '../../components/FormMessage.vue';
import { useSessionStore } from '../../stores/session';
import { useProfileLock } from './lock';

const router = useRouter();
const session = useSessionStore();
const { busy, run, closed } = useProfileLock();
const preview = ref<DeletionPreview | null>(null);
const confirmed = ref(false);
const password = ref('');
const message = reactive<{ text: string; type: 'error' | 'info' }>({ text: '', type: 'error' });

const fail = (text: string) => Object.assign(message, { text, type: 'error' });

function forgetReview(): void {
    preview.value = null;
    confirmed.value = false;
}

// Nothing reviewed or typed survives a closed dialog.
watch(closed, () => {
    password.value = '';
    forgetReview();
});

const summaryLines = computed(() => {
    const summary = preview.value;
    if (!summary) return [];
    const count = summary.counts;
    return [
        ...summary.blocked_workspaces.map(workspace =>
            `${workspace.name} — ${workspace.other_members} other member(s). Transfer ownership in Members, or delete the workspace in its settings.`),
        'Your profile and all memberships will be removed; all sessions will end.',
        `${count.direct_messages} direct message(s) will be removed for both participants.`,
        `${count.images} current uploaded image(s) will be removed; failed file cleanup is retried separately.`,
        `Workspaces deleted (no other members): ${summary.workspaces_to_delete.map(workspace => workspace.name).join(', ') || 'none'}.`,
        `Inside these workspaces: ${count.projects} project(s), ${count.tasks} task(s), ${count.workspace_messages} chat message(s).`,
        `In other owners' workspaces: ${count.retained_tasks} related task(s) and ${count.retained_messages} authored message(s) remain, with account links removed.`,
    ];
});

function review() {
    return run(async () => {
        forgetReview();
        Object.assign(message, { text: 'Loading deletion summary…', type: 'info' });
        const result = await getDeletionPreview();
        if (!result.ok) {
            fail(result.data.error);
            return;
        }
        preview.value = result.data;
        message.text = '';
    });
}

function submit() {
    if (busy.value) return;
    message.text = '';
    const entered = password.value;
    if (!entered.trim()) return fail('Enter your current password.');
    const reviewed = preview.value;
    if (!reviewed?.can_delete || !confirmed.value) return fail('Review and confirm the deletion summary first.');
    if (!window.confirm('Delete your account, direct messages and the solo workspaces listed in the summary? This cannot be undone.')) return;
    return run(async () => {
        try {
            const result = await deleteAccount(entered, reviewed.workspaces_to_delete.map(workspace => workspace.id));
            // A 401 means the account or its session is already gone.
            if (result.ok || result.status === 401) {
                session.expire();
                await router.replace({ name: 'login' });
                return;
            }
            // The data changed since the review: it has to be reviewed again.
            if (result.status === 409) forgetReview();
            fail(result.data.error);
        } finally {
            password.value = '';
        }
    });
}
</script>

<template>
    <!-- The explanation on one side, the controls on the other. -->
    <form id="profile-delete-form" class="profile-section profile-row" @submit.prevent="submit">
        <div class="profile-row-intro">
            <h3>Delete account</h3>
            <p id="profile-delete-help" class="field-hint">Review what will be deleted before continuing. If you own a workspace with other members, transfer ownership or explicitly delete that workspace first. Deleting this account removes your direct messages for both participants. Text in other workspaces can remain and may still contain personal information.</p>
        </div>
        <div class="settings-form">
            <button id="review-deletion-button" type="button" class="btn-secondary" :disabled="busy" @click="review">Review deletion</button>
            <div id="profile-delete-summary" class="deletion-summary" aria-live="polite" :hidden="!preview">
                <template v-if="preview">
                    <strong>{{ preview.can_delete ? 'Your deletion summary' : 'Handle these shared workspaces first' }}</strong>
                    <ul>
                        <li v-for="line in summaryLines" :key="line">{{ line }}</li>
                    </ul>
                </template>
            </div>
            <p class="field-hint">Counts describe the current data and can change. Use the privacy contact for personal information in shared content. Backup retention is described in the privacy notice.</p>
            <label class="deletion-confirm"><input id="confirm-account-deletion" v-model="confirmed" type="checkbox" required :disabled="busy || !preview?.can_delete"> I have reviewed the summary and understand this cannot be undone.</label>
            <div class="field">
                <label for="profile-delete-password">Current password</label>
                <input id="profile-delete-password" v-model="password" name="password" type="password" autocomplete="current-password" required aria-describedby="profile-delete-help">
            </div>
            <button id="delete-account-button" type="submit" class="btn-danger" :disabled="busy || !preview?.can_delete || !confirmed">Delete my account</button>
            <FormMessage id="profile-delete-message" :text="message.text" :type="message.type" />
        </div>
    </form>
</template>
