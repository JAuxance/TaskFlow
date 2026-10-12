import { nextTick } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { redirectFor } from './guards';
import { announcePage } from './page';
import { useSessionStore } from './stores/session';
import HomeView from './views/HomeView.vue';
import LoginView from './views/LoginView.vue';
import RegisterView from './views/RegisterView.vue';

declare module 'vue-router' {
    interface RouteMeta {
        /** Only for a signed-in user; others are sent to the login screen. */
        requiresAuth?: boolean;
        /** Only for a visitor; a signed-in user is sent to the application. */
        guestOnly?: boolean;
    }
}

// Screens are added here as they are migrated from ../frontend.
export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/login', name: 'login', component: LoginView, meta: { guestOnly: true } },
        { path: '/register', name: 'register', component: RegisterView, meta: { guestOnly: true } },
        { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },
        { path: '/:unknown(.*)*', redirect: '/' },
    ],
});

router.beforeEach(async to => {
    const session = useSessionStore();
    await session.ensureLoaded();
    const target = redirectFor(to.meta, session.status === 'signed-in');
    return target ? { name: target } : true;
});

router.afterEach(async () => {
    await nextTick();
    announcePage();
});
