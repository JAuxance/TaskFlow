// The design stays in the current frontend until the switch: one stylesheet for both.
import '../../frontend/css/style.css';

import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { setUnauthorizedHandler } from './api/client';
import { router } from './router';
import { useSessionStore } from './stores/session';

const app = createApp(App);
app.use(createPinia());
app.use(router);

const session = useSessionStore();
// One place decides what an expired session means, for every screen.
setUnauthorizedHandler(() => session.expire());
void session.load();

app.mount('#app');
