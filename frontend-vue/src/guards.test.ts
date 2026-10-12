import { expect, it } from 'vitest';
import { redirectFor } from './guards';

it('sends a visitor to the login screen when the page needs a session', () => {
    expect(redirectFor({ requiresAuth: true }, false)).toBe('login');
    expect(redirectFor({ requiresAuth: true }, true)).toBeNull();
});

it('sends a signed-in user away from the login and registration screens', () => {
    expect(redirectFor({ guestOnly: true }, true)).toBe('home');
    expect(redirectFor({ guestOnly: true }, false)).toBeNull();
});

it('leaves pages without a rule open to everyone', () => {
    expect(redirectFor({}, true)).toBeNull();
    expect(redirectFor({}, false)).toBeNull();
});
