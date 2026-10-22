import { reactive } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

export interface Crumb {
    label: string;
    /** Where the entry leads; without it, the entry is the current page. */
    to?: RouteLocationRaw;
}

/**
 * What a screen tells the layout once it knows its data: the breadcrumb, and
 * the workspace to highlight in the sidebar. Reset at every navigation.
 */
export const layoutState = reactive<{ trail: Crumb[] | null; workspaceId: number | null }>({
    trail: null, workspaceId: null,
});

export function resetLayoutState(): void {
    layoutState.trail = null;
    layoutState.workspaceId = null;
}

export function describeScreen(trail: Crumb[], workspaceId: number | null = null): void {
    layoutState.trail = trail;
    layoutState.workspaceId = workspaceId;
}
