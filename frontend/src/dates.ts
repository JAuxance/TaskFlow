const shortDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** "16 Oct". */
export const formatShortDay = (date: Date | number) => shortDay.format(date);

/**
 * When a task is due, in milliseconds. A date without a time belongs to the
 * user's calendar, so it starts at local midnight; an explicit offset is kept.
 */
export function dueTime(value: string | null | undefined): number | null {
    if (!value) return null;
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
}
