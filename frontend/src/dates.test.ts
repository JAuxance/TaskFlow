import { expect, it } from 'vitest';
import { dueTime, formatShortDay } from './dates';

it('reads a date without a time as local midnight, not as UTC', () => {
    expect(dueTime('2026-10-16')).toBe(new Date(2026, 9, 16, 0, 0, 0).getTime());
});

it('keeps the time and the offset of a complete date', () => {
    expect(dueTime('2026-10-16T12:00:00')).toBe(new Date(2026, 9, 16, 12, 0, 0).getTime());
    expect(dueTime('2026-10-16T12:00:00+02:00')).toBe(Date.UTC(2026, 9, 16, 10, 0, 0));
});

it('has no due time for an empty or unreadable value', () => {
    expect(dueTime(null)).toBeNull();
    expect(dueTime('')).toBeNull();
    expect(dueTime('next week')).toBeNull();
});

it('writes a day as "16 Oct"', () => {
    expect(formatShortDay(new Date(2026, 9, 16, 12))).toBe('16 Oct');
});
