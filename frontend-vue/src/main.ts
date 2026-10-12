// The design stays in the current frontend until the switch: one stylesheet for both.
import '../../frontend/css/style.css';
import '../../frontend/css/privacy.css';

import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { setUnauthorizedHandler } from './api/client';
import { router } from './router';
import { useSessionStore } from './stores/session';

const app = createApp(App);
app.use(createPinia());

const session = useSessionStore();
// One place decides what an expired session means, for every screen.
setUnauthorizedHandler(() => {
    session.expire();
    if (router.currentRoute.value.meta.requiresAuth) void router.replace({ name: 'login' });
});

app.use(router);
// Keep the static "Loading TaskFlow…" message until the session and the first screen are known.
void router.isReady().then(() => app.mount('#app'));
