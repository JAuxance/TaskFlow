<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import markIcon from '../../../frontend/assets/icons/mark.svg';
import { register } from '../api/auth';
import FormMessage from '../components/FormMessage.vue';
import { useBusy } from '../composables/useBusy';
import { useSessionStore } from '../stores/session';

const router = useRouter();
const session = useSessionStore();
const { busy, run } = useBusy();

const username = ref('');
const email = ref('');
const password = ref('');
const message = ref('');

function submit() {
    return run(async () => {
        message.value = '';
        const result = await register(username.value.trim(), email.value.trim(), password.value);
        if (!result.ok) {
            message.value = result.data.error;
            return;
        }
        // Registration opens the session: no second sign-in.
        await session.load();
        await router.replace({ name: 'home' });
    });
}
</script>

<template>
    <main id="page-content" class="login-page">
        <form id="register-form" class="login-form" @submit.prevent="submit">
            <div class="login-heading">
                <div class="login-brand">
                    <img class="icon icon-mark" :src="markIcon" alt="" width="32" height="32">
                    <span>TaskFlow</span>
                </div>
                <h1>Create account</h1>
                <p class="secondary-text">Create your TaskFlow account.</p>
            </div>
            <div class="login-fields">
                <div class="field">
                    <label for="username">Username</label>
                    <input id="username" v-model="username" type="text" name="username" autocomplete="username" maxlength="50" required>
                </div>
                <div class="field">
                    <label for="email">Email</label>
                    <input id="email" v-model="email" type="email" name="email" autocomplete="email" maxlength="255" required>
                </div>
                <div class="field">
                    <label for="password">Password</label>
                    <input id="password" v-model="password" type="password" name="password" autocomplete="new-password" minlength="8" required>
                </div>
                <FormMessage id="message" class="login-message" aria-live="polite" :text="message" />
            </div>
            <p class="field-hint">Your username, email and password are needed to create and secure your account. Read how your data is used in the <a href="/confidentialite/">Privacy information</a>.</p>
            <button type="submit" class="btn-primary" :disabled="busy" :aria-busy="busy || undefined">Create account</button>
            <button id="login-button" type="button" class="btn-quiet" @click="router.push({ name: 'login' })">Already have an account? Sign in</button>
        </form>
    </main>
</template>
