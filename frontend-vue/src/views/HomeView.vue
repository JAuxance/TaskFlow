<script setup lang="ts">
// Temporary page for a signed-in user, until the dashboard is migrated.
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import markIcon from '../../../frontend/assets/icons/mark.svg';
import { logout } from '../api/auth';
import FormMessage from '../components/FormMessage.vue';
import { useBusy } from '../composables/useBusy';
import { useSessionStore } from '../stores/session';

const router = useRouter();
const session = useSessionStore();
const { busy, run } = useBusy();
const message = ref('');

function signOut() {
    return run(async () => {
        message.value = '';
        const result = await logout();
        // A 401 means the session was already closed on the server.
        if (!result.ok && result.status !== 401) {
            message.value = result.data.error;
            return;
        }
        session.expire();
        await router.replace({ name: 'login' });
    });
}
</script>

<template>
    <main id="page-content" class="login-page">
        <section class="login-form">
            <div class="login-heading">
                <div class="login-brand">
                    <img class="icon icon-mark" :src="markIcon" alt="" width="32" height="32">
                    <span>TaskFlow</span>
                </div>
                <h1>Signed in</h1>
            </div>
            <p role="status">Signed in as {{ session.user?.username }} ({{ session.user?.email }}).</p>
            <p class="secondary-text">The dashboard has not been migrated yet. Your workspaces are on port 5500.</p>
            <button type="button" class="btn-secondary" :disabled="busy" :aria-busy="busy || undefined" @click="signOut">Sign out</button>
            <FormMessage :text="message" />
        </section>
    </main>
</template>
