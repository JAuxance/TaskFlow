// Rules of the board: how a column is ordered, and what moving a card changes.
import type { TaskPriority, TaskStatus } from '../api/types';

export const STATUS_ORDER: readonly TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];
/** From the most pressing to the least: the order of the cards in a column. */
export const PRIORITY_ORDER: readonly TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

interface Card { id: number; status: TaskStatus; priority: TaskPriority }
export type Move = { status?: TaskStatus; priority?: TaskPriority };

const rank = (priority: string) => {
    const index = PRIORITY_ORDER.indexOf(priority as TaskPriority);
    return index === -1 ? PRIORITY_ORDER.length : index;
};

/** The cards of a column: by priority, then in the order they were created. */
export function sortForBoard<T extends { id: number; priority: string }>(tasks: readonly T[]): T[] {
    return [...tasks].sort((a, b) => rank(a.priority) - rank(b.priority) || a.id - b.id);
}

/**
 * What dropping `card` in the column `status` changes, at `index` among the
 * other cards of that column. The card takes the status of the column and the
 * priority of the card it lands under; at the top, that of the card below.
 * In an empty column it keeps its priority. Null when nothing changes.
 */
export function dropChanges(card: Card, status: TaskStatus, others: readonly Card[], index: number): Move | null {
    const neighbour = others[index - 1] ?? others[index];
    const changes: Move = {};
    if (status !== card.status) changes.status = status;
    if (neighbour && neighbour.priority !== card.priority) changes.priority = neighbour.priority;
    return Object.keys(changes).length ? changes : null;
}

/**
 * The same moves from the keyboard, one step at a time: `columns` to the
 * right (+1) or left (-1), `levels` up (+1) or down (-1) in priority.
 * Null at the edge of the board or of the scale.
 */
export function stepChanges(card: Card, columns: number, levels: number): Move | null {
    const status = STATUS_ORDER[STATUS_ORDER.indexOf(card.status) + columns];
    // A higher priority is earlier in the order.
    const priority = PRIORITY_ORDER[PRIORITY_ORDER.indexOf(card.priority) - levels];
    const changes: Move = {};
    if (columns && status) changes.status = status;
    if (levels && priority) changes.priority = priority;
    return Object.keys(changes).length ? changes : null;
}
