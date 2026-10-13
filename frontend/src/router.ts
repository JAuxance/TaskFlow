import { nextTick } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { arrivalFor, redirectFor } from './guards';
import RootView from './layout/RootView.vue';
import { resetLayoutState } from './layout/state';
import { announcePage } from './page';
import { useSessionStore } from './stores/session';
import { useSidebarStore } from './stores/sidebar';
import CookiesView from './views/CookiesView.vue';
import DirectMessagesView from './views/DirectMessagesView.vue';
import LoginView from './views/LoginView.vue';
import PrivacyView from './views/PrivacyView.vue';
import ProjectView from './views/ProjectView.vue';
import RegisterView from './views/RegisterView.vue';
import TaskView from './views/TaskView.vue';
import WelcomeView from './views/WelcomeView.vue';
import WorkspaceView from './views/WorkspaceView.vue';

declare module 'vue-router' {
    interface RouteMeta {
        /** Only for a signed-in user; others are sent to the login screen. */
        requiresAuth?: boolean;
        /** Only for a visitor; a signed-in user is sent to the application. */
        guestOnly?: boolean;
        /** Open to everyone: a visitor sees the presentation there, a signed-in user arrives in the application. */
        landing?: boolean;
        /** Extra class of the content area, used by the stylesheet. */
        pageClass?: string;
    }
}

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/login', name: 'login', component: LoginView, meta: { guestOnly: true } },
        { path: '/register', name: 'register', component: RegisterView, meta: { guestOnly: true } },
        // Legal pages: open to everyone, signed in or not. Their addresses are public and stay as they are.
        { path: '/confidentialite', name: 'privacy', component: PrivacyView },
        { path: '/cookies', name: 'cookies', component: CookiesView },
        {
            path: '/',
            component: RootView,
            children: [
                // A visitor sees the presentation instead (RootView). Signed in, this screen is only displayed
                // to someone without a workspace: the guard below opens the first one otherwise.
                { path: '', name: 'home', component: WelcomeView, meta: { landing: true, pageClass: 'welcome-page' } },
                {
                    path: 'workspaces/:id(\\d+)/:tab(messages|members|settings)?', name: 'workspace', component: WorkspaceView,
                    meta: { requiresAuth: true, pageClass: 'workspace-page' },
                },
                {
                    path: 'projects/:id(\\d+)', name: 'project', component: ProjectView,
                    meta: { requiresAuth: true, pageClass: 'project-page' },
                },
                {
                    path: 'tasks/:id(\\d+)', name: 'task', component: TaskView,
                    meta: { requiresAuth: true, pageClass: 'task-page' },
                },
                {
                    path: 'messages/:userId(\\d+)', name: 'messages', component: DirectMessagesView,
                    meta: { requiresAuth: true, pageClass: 'direct-messages-page' },
                },
            ],
        },
        { path: '/:unknown(.*)*', redirect: '/' },
    ],
});

router.beforeEach(async to => {
    const session = useSessionStore();
    await session.ensureLoaded();
    const signedIn = session.status === 'signed-in';
    const target = redirectFor(to.meta, signedIn);
    if (target) return { name: target };
    // A screen of the application: the protected ones, and "/" for someone signed in.
    if (to.meta.requiresAuth || (to.meta.landing && signedIn)) {
        // A screen is always shown with a fresh sidebar.
        const sidebar = useSidebarStore();
        await sidebar.refresh();
        // The refresh may have revealed that the session expired.
        if (session.status !== 'signed-in') return { name: 'login' };
        // Arriving opens the first workspace straight away; the welcome screen is for who has none.
        if (to.name === 'home') return arrivalFor(sidebar.workspaces) ?? true;
    }
    return true;
});

router.afterEach(async (_to, _from, failure) => {
    // Nothing changed, for instance when the screen already displayed is asked again: keep what it described.
    if (failure) return;
    // The new screen describes itself once its data is loaded.
    resetLayoutState();
    await nextTick();
    announcePage();
});
