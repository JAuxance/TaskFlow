import { nextTick } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { redirectFor } from './guards';
import AppLayout from './layout/AppLayout.vue';
import { resetLayoutState, type Crumb } from './layout/state';
import { announcePage } from './page';
import { useSessionStore } from './stores/session';
import { useSidebarStore } from './stores/sidebar';
import DashboardView from './views/DashboardView.vue';
import LoginView from './views/LoginView.vue';
import PendingView from './views/PendingView.vue';
import ProjectView from './views/ProjectView.vue';
import RegisterView from './views/RegisterView.vue';
import TaskView from './views/TaskView.vue';
import WorkspaceView from './views/WorkspaceView.vue';

declare module 'vue-router' {
    interface RouteMeta {
        /** Only for a signed-in user; others are sent to the login screen. */
        requiresAuth?: boolean;
        /** Only for a visitor; a signed-in user is sent to the application. */
        guestOnly?: boolean;
        /** Extra class of the content area, used by the stylesheet. */
        pageClass?: string;
        /** Trail shown above the content; an entry without `to` is the current page. */
        breadcrumbs?: Crumb[];
    }
}

const toWorkspaces = { label: 'Workspaces', to: { name: 'home' } };
// Screens of the current frontend that still have to be migrated.
const pending = { component: PendingView, meta: { breadcrumbs: [toWorkspaces, { label: 'Not migrated yet' }] } };

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/login', name: 'login', component: LoginView, meta: { guestOnly: true } },
        { path: '/register', name: 'register', component: RegisterView, meta: { guestOnly: true } },
        {
            path: '/',
            component: AppLayout,
            meta: { requiresAuth: true },
            children: [
                {
                    path: '', name: 'home', component: DashboardView,
                    meta: { pageClass: 'dashboard-page', breadcrumbs: [{ label: 'Workspaces' }] },
                },
                {
                    path: 'workspaces/:id(\\d+)/:tab(messages|members|settings)?', name: 'workspace', component: WorkspaceView,
                    meta: { pageClass: 'workspace-page', breadcrumbs: [toWorkspaces] },
                },
                {
                    path: 'projects/:id(\\d+)', name: 'project', component: ProjectView,
                    meta: { pageClass: 'project-page', breadcrumbs: [toWorkspaces] },
                },
                {
                    path: 'tasks/:id(\\d+)', name: 'task', component: TaskView,
                    meta: { pageClass: 'task-page', breadcrumbs: [toWorkspaces] },
                },
                { path: 'messages/:userId(\\d+)', name: 'messages', ...pending },
            ],
        },
        { path: '/:unknown(.*)*', redirect: '/' },
    ],
});

router.beforeEach(async to => {
    const session = useSessionStore();
    await session.ensureLoaded();
    const target = redirectFor(to.meta, session.status === 'signed-in');
    if (target) return { name: target };
    if (to.meta.requiresAuth) {
        // Like the current frontend, a screen is shown with a fresh sidebar.
        await useSidebarStore().refresh();
        // The refresh may have revealed that the session expired.
        if (session.status !== 'signed-in') return { name: 'login' };
    }
    return true;
});

router.afterEach(async () => {
    // The new screen describes itself once its data is loaded.
    resetLayoutState();
    await nextTick();
    announcePage();
});
