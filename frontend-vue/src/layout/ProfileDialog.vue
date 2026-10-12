<script setup lang="ts">
// The profile dialog opened from the sidebar. For now it shows the account and
// signs out; the name, picture, data export and account deletion sections of
// the current frontend are migrated in the next step.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { logout } from '../api/auth';
import AppDialog from '../components/AppDialog.vue';
import FormMessage from '../components/FormMessage.vue';
import ProtectedImage from '../components/ProtectedImage.vue';
import { useBusy } from '../composables/useBusy';
import { initialOf } from '../domain';
import { useSessionStore } from '../stores/session';

const router = useRouter();
const session = useSessionStore();
const { busy, run } = useBusy();
const dialog = ref<InstanceType<typeof AppDialog> | null>(null);
const logoutMessage = ref('');

const user = computed(() => session.user);
const initial = computed(() => initialOf(user.value?.first_name || user.value?.username || user.value?.email));

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
        close-label="Close profile" :busy="busy" :aria-busy="busy || undefined"
    >
        <div class="dialog-body">
            <div class="profile-identity">
                <span class="avatar avatar-large" aria-hidden="true"><span id="profile-initial">{{ initial }}</span><ProtectedImage id="profile-avatar" :path="user?.avatar_url" /></span>
                <div class="heading-copy">
                    <strong>{{ user?.username }}</strong>
                    <div class="email-copy"><span id="user-email" class="secondary-text">{{ user?.email }}</span></div>
                </div>
            </div>
            <div class="settings-form profile-section">
                <button id="logout-button" type="button" class="btn-secondary" :disabled="busy" @click="signOut">Sign out</button>
                <FormMessage id="profile-logout-message" :text="logoutMessage" />
            </div>
        </div>
    </AppDialog>
</template>
