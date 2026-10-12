<script setup lang="ts">
// The message of a form: hidden while empty, announced as an alert for
// errors and as a status otherwise.
withDefaults(defineProps<{ text?: string; type?: 'error' | 'success' | 'info' }>(), {
    text: '', type: 'error',
});
</script>

<template>
    <p class="form-message" :role="type === 'error' ? 'alert' : 'status'" :data-type="type" :hidden="!text">{{ text }}</p>
</template>
