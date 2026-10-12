import { expect, it } from 'vitest';
import { colorOf, initialOf } from './domain';

it('keeps a known color and shows anything else as gray', () => {
    expect(colorOf('purple')).toBe('purple');
    expect(colorOf('magenta')).toBe('gray');
    expect(colorOf(null)).toBe('gray');
    expect(colorOf(undefined)).toBe('gray');
});

it('takes the first letter of a name for the avatar, whatever the alphabet', () => {
    expect(initialOf('alice')).toBe('A');
    expect(initialOf('élodie')).toBe('É');
    expect(initialOf('😀 team')).toBe('😀');
    expect(initialOf('')).toBe('?');
    expect(initialOf(null)).toBe('?');
});
