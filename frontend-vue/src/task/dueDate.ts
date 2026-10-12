// The due date of a task travels between three forms: what the server stores
// (with or without a time zone), what a datetime-local field holds (local
// time, no zone) and what is sent back.

const pad = (value: number) => String(value).padStart(2, '0');
const hasOffset = (value: string | null | undefined) => /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value ?? '');

/** The stored due date, as a datetime-local field expects it. */
export function toDateTimeField(value: string | null | undefined): string {
    if (!value) return '';
    // Without a zone the stored value already is local time: keep it as written.
    if (!hasOffset(value)) return value.replace(' ', 'T').replace(/(\.\d{3})\d+$/, '$1');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** What to send for a due date the user changed; `original` is the stored one. */
export function fromDateTimeField(value: string, original: string | null | undefined): string | null {
    if (!value) return null;
    if (!hasOffset(original)) return value;
    // A value stored with a zone stays zoned, without reading local input as UTC.
    const offset = -new Date(value).getTimezoneOffset();
    return `${value}${offset >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}
