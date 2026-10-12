<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { exportMyData, getPrivacyContact } from '../../api/profile';
import FormMessage from '../../components/FormMessage.vue';
import { useProfileLock } from './lock';

const { busy, run, closed } = useProfileLock();
const password = ref('');
const message = reactive<{ text: string; type: 'error' | 'success' | 'info' }>({ text: '', type: 'error' });
// Shown until the server gives the address configured for this deployment.
const contactEmail = ref('contact@auxance.dev');

onMounted(async () => {
    const result = await getPrivacyContact();
    if (result.ok && result.data.contact_email) contactEmail.value = result.data.contact_email;
});

// A password must not stay in a closed dialog.
watch(closed, () => { password.value = ''; });

/** Hand the data to the browser as a file, without sending it anywhere. */
function download(data: unknown): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'taskflow-my-data.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function submit() {
    return run(async () => {
        Object.assign(message, { text: 'Preparing your download…', type: 'info' });
        try {
            const result = await exportMyData(password.value);
            if (!result.ok) {
                Object.assign(message, { text: result.data.error, type: 'error' });
                return;
            }
            download(result.data);
            Object.assign(message, { text: 'Download requested. Check your browser downloads.', type: 'success' });
        } finally {
            password.value = '';
        }
    });
}
</script>

<template>
    <!-- The explanation on one side, the controls on the other. -->
    <form id="profile-export-form" class="profile-section profile-row" @submit.prevent="submit">
        <div class="profile-row-intro">
            <h3>My data</h3>
            <p id="profile-export-help" class="field-hint">Download a JSON copy of your profile, memberships, tasks you created or are assigned to in accessible workspaces, and messages you sent. The file contains personal information: keep it somewhere private. Downloading does not delete your account.</p>
        </div>
        <div class="settings-form">
            <div class="field">
                <label for="profile-export-password">Current password for download</label>
                <input id="profile-export-password" v-model="password" name="password" type="password" autocomplete="current-password" required aria-describedby="profile-export-help">
            </div>
            <button type="submit" class="btn-secondary" :disabled="busy">Download my data</button>
            <FormMessage id="profile-export-message" :text="message.text" :type="message.type" />
            <p class="field-hint">For image copies, logs, other data or a username/email correction, use the privacy contact. An email change requires verification.</p>
            <p class="field-hint" data-privacy-contact>For data requests: <a :href="`mailto:${contactEmail}?subject=TaskFlow%20-%20personal%20data%20request`">{{ contactEmail }}</a>. Please never send your password.</p>
            <nav class="privacy-links" aria-label="Privacy information"><a href="/confidentialite/">Privacy</a><a href="/cookies/">Cookies &amp; storage</a></nav>
        </div>
    </form>
</template>
