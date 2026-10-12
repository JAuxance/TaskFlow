export interface AccessRules {
    requiresAuth?: boolean;
    guestOnly?: boolean;
}

/** Where a navigation must be redirected, if anywhere. */
export function redirectFor(rules: AccessRules, signedIn: boolean): 'login' | 'home' | null {
    if (rules.requiresAuth && !signedIn) return 'login';
    if (rules.guestOnly && signedIn) return 'home';
    return null;
}

/** Where arriving at the application leads: the first workspace of the sidebar, or the list when there is none. */
export function arrivalFor(workspaces: readonly { id: number }[]): { name: 'workspace'; params: { id: number } } | { name: 'workspaces' } {
    const first = workspaces[0];
    return first ? { name: 'workspace', params: { id: first.id } } : { name: 'workspaces' };
}
