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
