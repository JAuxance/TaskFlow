<script setup lang="ts">
// A modal dialog with the header shared by every dialog of the application.
// It cannot be closed while `busy`, so a pending save is never lost from view.
import { ref } from 'vue';

const props = withDefaults(defineProps<{ title: string; titleId: string; closeLabel?: string; busy?: boolean }>(), {
    closeLabel: 'Close', busy: false,
});
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);

function open(): void {
    dialog.value?.showModal();
}

function close(): void {
    if (!props.busy) dialog.value?.close();
}

defineExpose({ open, close });
</script>

<template>
    <dialog ref="dialog" class="app-dialog" :aria-labelledby="titleId" @cancel="event => { if (busy) event.preventDefault(); }" @close="emit('close')">
        <div class="dialog-header">
            <h2 :id="titleId">{{ title }}</h2>
            <button type="button" class="dialog-close" :aria-label="closeLabel" @click="close">×</button>
        </div>
        <slot />
    </dialog>
</template>
