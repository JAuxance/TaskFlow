// Status columns and task ordering within each column.
import type { TaskPriority, TaskStatus } from '../api/types';

export const STATUS_ORDER: readonly TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];
/** From the most pressing to the least: the order of the cards in a column. */
export const PRIORITY_ORDER: readonly TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

const rank = (priority: string) => {
    const index = PRIORITY_ORDER.indexOf(priority as TaskPriority);
    return index === -1 ? PRIORITY_ORDER.length : index;
};

/** The cards of a column: by priority, then in the order they were created. */
export function sortForBoard<T extends { id: number; priority: string }>(tasks: readonly T[]): T[] {
    return [...tasks].sort((a, b) => rank(a.priority) - rank(b.priority) || a.id - b.id);
}
