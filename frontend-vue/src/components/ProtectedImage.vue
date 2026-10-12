<script setup lang="ts">
// An avatar or workspace icon. Hidden while it loads; then the picture, or
// the fallback, or nothing when there is neither.
import { ref, watch } from 'vue';
import { loadProtectedImage } from '../api/images';

const props = withDefaults(defineProps<{ path?: string | null; fallback?: string }>(), {
    path: null, fallback: '',
});
const source = ref('');

watch(() => [props.path, props.fallback] as const, async ([path, fallback]) => {
    const url = await loadProtectedImage(path);
    // The picture changed while this one was loading: the newer request wins.
    if (path !== props.path) return;
    source.value = url ?? fallback;
}, { immediate: true });

/** A fallback that fails to load must not leave a broken image. */
function onError(): void {
    if (source.value !== props.fallback) source.value = props.fallback;
}
</script>

<template>
    <img :src="source || undefined" :hidden="!source" alt="" @error="onError">
</template>
