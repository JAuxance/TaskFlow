import { inject, type InjectionKey } from 'vue';

/** Opens the dialog that creates a workspace; the layout provides it to every screen. */
export const createWorkspaceKey: InjectionKey<() => void> = Symbol('create workspace');

export function useCreateWorkspace(): () => void {
    const open = inject(createWorkspaceKey);
    if (!open) throw new Error('This screen must be shown inside the application layout');
    return open;
}
