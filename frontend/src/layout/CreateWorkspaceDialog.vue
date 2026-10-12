<script setup lang="ts">
// The dialog that creates a workspace, opened from the sidebar or from the
// welcome screen. Once created, the workspace is opened.
import { nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import { createWorkspace } from '../api/workspaces';
import AppDialog from '../components/AppDialog.vue';
import FormMessage from '../components/FormMessage.vue';
import { useBusy } from '../composables/useBusy';

const router = useRouter();
const dialog = ref<InstanceType<typeof AppDialog> | null>(null);
const { busy: creating, run } = useBusy();
const name = ref('');
const message = ref('');

async function submit(): Promise<void> {
    const entered = name.value.trim();
    if (!entered) {
        message.value = 'Enter a workspace name.';
        return;
    }
    let createdId = 0;
    await run(async () => {
        message.value = '';
        const result = await createWorkspace(entered);
        if (!result.ok) {
            message.value = result.data.error;
            return;
        }
        createdId = result.data.id;
    });
    if (!createdId) return;
    name.value = '';
    // The dialog refuses to close while the save is pending: wait for it to know it ended.
    await nextTick();
    dialog.value?.close();
    // Every navigation refreshes the sidebar: the new workspace is listed on arrival.
    await router.push({ name: 'workspace', params: { id: createdId } });
}

defineExpose({ open: () => dialog.value?.open() });
</script>

<template>
    <AppDialog id="create-workspace-dialog" ref="dialog" title="New workspace" title-id="create-workspace-title" :busy="creating">
        <form id="create-workspace-form" class="dialog-body" @submit.prevent="submit">
            <p class="secondary-text">Create a space for your team and its projects.</p>
            <div class="field">
                <label for="workspace-name-input">Workspace name</label>
                <input id="workspace-name-input" v-model="name" name="name" type="text" placeholder="e.g. Design studio" maxlength="50" required autofocus>
            </div>
            <FormMessage id="workspace-message" :text="message" />
            <div class="dialog-actions"><button id="cancel-workspace-button" type="button" class="btn-secondary" @click="dialog?.close()">Cancel</button><button type="submit" class="btn-primary" :disabled="creating" :aria-busy="creating || undefined">Create workspace</button></div>
        </form>
    </AppDialog>
</template>
