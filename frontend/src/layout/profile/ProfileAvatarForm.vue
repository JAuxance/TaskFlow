<script setup lang="ts">
import { reactive, ref } from 'vue';
import type { ApiResult } from '../../api/client';
import { removeAvatar, uploadAvatar } from '../../api/profile';
import type { User } from '../../api/types';
import FormMessage from '../../components/FormMessage.vue';
import { useSessionStore } from '../../stores/session';
import { useProfileLock } from './lock';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const session = useSessionStore();
const { busy, run } = useProfileLock();
const input = ref<HTMLInputElement | null>(null);
const message = reactive<{ text: string; type: 'error' | 'success' }>({ text: '', type: 'error' });

const fail = (text: string) => Object.assign(message, { text, type: 'error' });

function save(request: () => Promise<ApiResult<User>>, onSuccess: () => void) {
    return run(async () => {
        message.text = '';
        const result = await request();
        if (!result.ok) {
            fail(result.data.error);
            return;
        }
        session.update(result.data);
        onSuccess();
        Object.assign(message, { text: 'Profile updated.', type: 'success' });
    });
}

function upload() {
    const file = input.value?.files?.[0];
    if (!file) return fail('Choose an image first.');
    // Checked here for an immediate answer; the server checks the content again.
    if (!/\.(jpe?g|png|webp)$/i.test(file.name) || !ACCEPTED_TYPES.includes(file.type)) {
        return fail('Choose a JPG, PNG or WebP image.');
    }
    if (file.size > MAX_BYTES) return fail('Choose an image smaller than 5 MB.');
    return save(() => uploadAvatar(file), () => {
        if (input.value?.files?.[0] === file) input.value.value = '';
    });
}

function remove() {
    return save(removeAvatar, () => {
        if (input.value) input.value.value = '';
    });
}
</script>

<template>
    <form id="profile-avatar-form" class="settings-form profile-section" @submit.prevent="upload">
        <div class="field">
            <label for="profile-avatar-input">Profile picture</label>
            <input id="profile-avatar-input" ref="input" class="image-upload-input" type="file" name="avatar" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" required aria-describedby="profile-avatar-help">
            <p id="profile-avatar-help" class="field-hint">JPG, PNG or WebP · up to 5 MB</p>
        </div>
        <div class="form-actions">
            <button type="submit" class="btn-secondary" :disabled="busy">Upload picture</button>
            <button id="remove-avatar-button" type="button" class="btn-quiet" :disabled="busy" @click="remove">Remove picture</button>
        </div>
        <FormMessage id="profile-avatar-message" :text="message.text" :type="message.type" />
    </form>
</template>
