import type { WorkspaceRole } from './api/types';

/** Colors a workspace or a task can carry; anything else is shown as gray. */
export const COLORS = ['gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple'] as const;
export type Color = typeof COLORS[number];

export function colorOf(value: string | null | undefined): Color {
    return (COLORS as readonly string[]).includes(value ?? '') ? value as Color : 'gray';
}

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
    owner: 'Owner', admin: 'Admin', member: 'Member', guest: 'Guest',
};

/** First letter shown in an avatar when there is no picture. */
export function initialOf(name: string | null | undefined): string {
    return Array.from(name ?? '')[0]?.toUpperCase() || '?';
}
