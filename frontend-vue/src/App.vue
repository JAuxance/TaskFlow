<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
// On the two legal pages, the footer also leads back to the application.
const legalPage = computed(() => route.name === 'privacy' || route.name === 'cookies');
</script>

<template>
    <RouterView />
    <footer class="site-footer"><nav class="privacy-links" aria-label="Privacy information"><a v-if="legalPage" href="/">TaskFlow</a><a href="/confidentialite/" :aria-current="route.name === 'privacy' ? 'page' : undefined">Privacy</a><a href="/cookies/" :aria-current="route.name === 'cookies' ? 'page' : undefined">Cookies &amp; storage</a></nav></footer>
</template>
