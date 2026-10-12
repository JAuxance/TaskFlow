<script setup lang="ts">
// A modal dialog with the header shared by every dialog of the application.
// It cannot be closed while `busy`, so a pending save is never lost from view.
// A click beside it closes it, like its close button.
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

// The press and the release must both land beside the dialog: selecting the
// text of a field and releasing the button outside must not close anything.
let pressedBeside = false;

function isBeside(event: MouseEvent): boolean {
    const box = dialog.value?.getBoundingClientRect();
    // The backdrop belongs to the dialog element; a keyboard "click" targets a button instead.
    return event.target === dialog.value && !!box
        && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
}

function onClick(event: MouseEvent): void {
    if (pressedBeside && isBeside(event)) close();
    pressedBeside = false;
}

defineExpose({ open, close });
</script>

<template>
    <dialog
        ref="dialog" class="app-dialog" :aria-labelledby="titleId" @cancel="event => { if (busy) event.preventDefault(); }" @close="emit('close')"
        @pointerdown="pressedBeside = isBeside($event)" @click="onClick"
    >
        <div class="dialog-header">
            <h2 :id="titleId">{{ title }}</h2>
            <button type="button" class="dialog-close" :aria-label="closeLabel" @click="close">×</button>
        </div>
        <slot />
    </dialog>
</template>
