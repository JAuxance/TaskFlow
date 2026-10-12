import { createRouter, createWebHistory } from 'vue-router';
import FoundationView from './views/FoundationView.vue';

// Screens are added here as they are migrated from ../frontend.
export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'home', component: FoundationView },
        { path: '/:unknown(.*)*', redirect: '/' },
    ],
});
