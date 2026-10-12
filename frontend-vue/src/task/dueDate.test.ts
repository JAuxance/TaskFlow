import { expect, it } from 'vitest';
import { fromDateTimeField, toDateTimeField } from './dueDate';

it('shows a due date stored without a zone exactly as written', () => {
    expect(toDateTimeField('2026-10-16T12:00:00')).toBe('2026-10-16T12:00:00');
    expect(toDateTimeField('2026-10-16 12:00:00')).toBe('2026-10-16T12:00:00');
    expect(toDateTimeField('2026-10-16T12:00:00.123456')).toBe('2026-10-16T12:00:00.123');
});

it('shows a zoned due date in the local time of the user', () => {
    const local = new Date('2026-10-16T10:00:00Z');
    const pad = (value: number) => String(value).padStart(2, '0');
    const expected = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`
        + `T${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}`;

    expect(toDateTimeField('2026-10-16T10:00:00Z')).toBe(expected);
    expect(toDateTimeField('2026-10-16T12:00:00+02:00')).toBe(expected);
});

it('shows an empty field for a missing or unreadable due date', () => {
    expect(toDateTimeField(null)).toBe('');
    expect(toDateTimeField('')).toBe('');
    expect(toDateTimeField('not a dateZ')).toBe('');
});

it('clears the due date when the field is emptied', () => {
    expect(fromDateTimeField('', '2026-10-16T12:00:00')).toBeNull();
});

it('sends local time as typed when the stored date had no zone', () => {
    expect(fromDateTimeField('2026-10-20T09:30', '2026-10-16T12:00:00')).toBe('2026-10-20T09:30');
    expect(fromDateTimeField('2026-10-20T09:30', null)).toBe('2026-10-20T09:30');
});

it('keeps a zone on a date that was stored with one, at the same instant as typed', () => {
    const sent = fromDateTimeField('2026-10-20T09:30', '2026-10-16T10:00:00Z');

    expect(sent).toMatch(/^2026-10-20T09:30[+-]\d{2}:\d{2}$/);
    expect(new Date(sent!).getTime()).toBe(new Date('2026-10-20T09:30').getTime());
});
