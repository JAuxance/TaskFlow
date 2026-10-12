<script setup lang="ts">
import { reactive, ref } from 'vue';
import { updateFirstName } from '../../api/profile';
import FormMessage from '../../components/FormMessage.vue';
import { useSessionStore } from '../../stores/session';
import { useProfileLock } from './lock';

const session = useSessionStore();
const { busy, run } = useProfileLock();
const firstName = ref(session.user?.first_name ?? '');
const message = reactive<{ text: string; type: 'error' | 'success' }>({ text: '', type: 'error' });

function save() {
    const entered = firstName.value;
    return run(async () => {
        message.text = '';
        const result = await updateFirstName(entered.trim());
        if (!result.ok) {
            Object.assign(message, { text: result.data.error, type: 'error' });
            return;
        }
        session.update(result.data);
        // Show the stored value, unless the user already typed something else.
        if (firstName.value === entered) firstName.value = result.data.first_name ?? '';
        Object.assign(message, { text: 'Profile updated.', type: 'success' });
    });
}

/** The dialog reports here problems that have no section of their own. */
defineExpose({ showError: (text: string) => Object.assign(message, { text, type: 'error' }) });
</script>

<template>
    <form id="profile-name-form" class="settings-form profile-section" @submit.prevent="save">
        <div class="field">
            <label for="profile-first-name">First name (optional)</label>
            <input id="profile-first-name" v-model="firstName" name="first_name" autocomplete="given-name" maxlength="100" placeholder="Enter your first name" aria-describedby="profile-name-help">
            <p id="profile-name-help" class="field-hint">Leave empty to use your username instead.</p>
        </div>
        <button type="submit" class="btn-primary" :disabled="busy">Save name</button>
        <FormMessage id="profile-name-message" :text="message.text" :type="message.type" />
    </form>
</template>
