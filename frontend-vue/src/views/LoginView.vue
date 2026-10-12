<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import markIcon from '../assets/icons/mark.svg';
import { login } from '../api/auth';
import FormMessage from '../components/FormMessage.vue';
import { useBusy } from '../composables/useBusy';
import { useSessionStore } from '../stores/session';

const router = useRouter();
const session = useSessionStore();
const { busy, run } = useBusy();

const email = ref('');
const password = ref('');
// Shown on arrival: why the user is back here (expired session), or why the
// session could not be checked (server unreachable). Said once.
const message = ref(session.error);
session.error = '';

function submit() {
    return run(async () => {
        message.value = '';
        const result = await login(email.value.trim(), password.value);
        if (!result.ok) {
            message.value = result.status === 401
                ? 'Invalid email or password. Please try again.' : result.data.error;
            return;
        }
        await session.load();
        await router.replace({ name: 'home' });
    });
}
</script>

<template>
    <main id="page-content" class="login-page">
        <form id="login-form" class="login-form" @submit.prevent="submit">
            <div class="login-heading">
                <div class="login-brand">
                    <img class="icon icon-mark" :src="markIcon" alt="" width="32" height="32">
                    <span>TaskFlow</span>
                </div>
                <h1>Login</h1>
            </div>
            <div class="login-fields">
                <div class="field">
                    <label for="email">Email</label>
                    <input id="email" v-model="email" type="email" name="email" autocomplete="username" maxlength="255" required>
                </div>
                <div class="field">
                    <label for="password">Password</label>
                    <input id="password" v-model="password" type="password" name="password" autocomplete="current-password" required>
                </div>
                <FormMessage id="message" class="login-message" aria-live="polite" :text="message" />
            </div>
            <button type="submit" class="btn-primary" :disabled="busy" :aria-busy="busy || undefined">Login</button>
            <button id="register-button" type="button" class="btn-quiet" @click="router.push({ name: 'register' })">Create an account</button>
            <a class="btn-quiet" href="/confidentialite/">Privacy notice</a>
        </form>
    </main>
</template>
