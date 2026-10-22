<script setup lang="ts">
// The address "/" has two faces: the presentation of TaskFlow for a visitor,
// the application for someone signed in.
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSessionStore } from '../stores/session';
import LandingView from '../views/LandingView.vue';
import AppLayout from './AppLayout.vue';

const route = useRoute();
const session = useSessionStore();
const visitor = computed(() => route.meta.landing === true && session.status !== 'signed-in');
</script>

<template>
    <LandingView v-if="visitor" />
    <AppLayout v-else />
</template>
