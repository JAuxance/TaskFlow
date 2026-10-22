<script setup lang="ts">
// The profile dialog opened from the sidebar: who is signed in and the sign-out,
// then first name, data export and account deletion, one section per component.
import { computed, provide, ref } from 'vue';
import { useRouter } from 'vue-router';
import { logout } from '../api/auth';
import AppDialog from '../components/AppDialog.vue';
import FormMessage from '../components/FormMessage.vue';
import { useBusy } from '../composables/useBusy';
import { initialOf } from '../domain';
import { useSessionStore } from '../stores/session';
import { profileLockKey } from './profile/lock';
import ProfileDeletionForm from './profile/ProfileDeletionForm.vue';
import ProfileExportForm from './profile/ProfileExportForm.vue';
import ProfileNameForm from './profile/ProfileNameForm.vue';

const router = useRouter();
const session = useSessionStore();
const { busy, run } = useBusy();
const closed = ref(0);
provide(profileLockKey, { busy, run, closed });

const dialog = ref<InstanceType<typeof AppDialog> | null>(null);
const nameForm = ref<InstanceType<typeof ProfileNameForm> | null>(null);
const logoutMessage = ref('');

const user = computed(() => session.user);
const initial = computed(() => initialOf(user.value?.first_name || user.value?.username || user.value?.email));

// --- Copy email --------------------------------------------------------------

const copyLabel = ref('Copy email');
const copying = ref(false);

async function copyEmail(): Promise<void> {
    if (copying.value || !user.value) return;
    copying.value = true;
    try {
        await navigator.clipboard.writeText(user.value.email);
        copyLabel.value = 'Copied!';
        window.setTimeout(() => { copyLabel.value = 'Copy email'; }, 1500);
    } catch {
        nameForm.value?.showError('Could not copy the email. You can select and copy it manually.');
    } finally {
        copying.value = false;
    }
}

// --- Sign out ----------------------------------------------------------------

function signOut() {
    return run(async () => {
        logoutMessage.value = '';
        const result = await logout();
        // A 401 means the session was already closed on the server.
        if (!result.ok && result.status !== 401) {
            logoutMessage.value = result.data.error;
            return;
        }
        session.expire();
        await router.replace({ name: 'login' });
    });
}

defineExpose({ open: () => dialog.value?.open() });
</script>

<template>
    <AppDialog
        id="profile-dialog" ref="dialog" title="Your profile" title-id="profile-dialog-title"
        close-label="Close profile" :busy="busy" :aria-busy="busy || undefined" @close="closed += 1"
    >
        <div class="dialog-body">
            <div class="profile-identity">
                <span class="avatar avatar-large" aria-hidden="true"><span id="profile-initial">{{ initial }}</span></span>
                <div class="heading-copy">
                    <strong>{{ user?.username }}</strong>
                    <div class="email-copy"><span id="user-email" class="secondary-text">{{ user?.email }}</span><button id="copy-email-button" type="button" class="btn-quiet" :disabled="copying" @click="copyEmail">{{ copyLabel }}</button></div>
                </div>
                <button id="logout-button" type="button" class="btn-secondary" :disabled="busy" @click="signOut">Sign out</button>
            </div>
            <FormMessage id="profile-logout-message" :text="logoutMessage" />
            <div class="profile-forms">
                <ProfileNameForm ref="nameForm" />
            </div>
            <ProfileExportForm />
            <ProfileDeletionForm />
        </div>
    </AppDialog>
</template>
