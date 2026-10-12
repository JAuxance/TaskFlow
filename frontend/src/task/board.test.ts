import { describe, expect, it } from 'vitest';
import type { TaskPriority, TaskStatus } from '../api/types';
import { dropChanges, sortForBoard, stepChanges } from './board';

const card = (id: number, priority: TaskPriority, status: TaskStatus = 'todo') => ({ id, status, priority });

describe('order of a column', () => {
    it('puts the most pressing cards first, then the oldest', () => {
        const sorted = sortForBoard([card(1, 'low'), card(2, 'urgent'), card(3, 'medium'), card(4, 'urgent'), card(5, 'high')]);
        expect(sorted.map(task => task.id)).toEqual([2, 4, 5, 3, 1]);
    });

    it('puts a priority it does not know last, and leaves the list it was given untouched', () => {
        const tasks = [{ id: 1, priority: 'someday' }, { id: 2, priority: 'low' }];
        expect(sortForBoard(tasks).map(task => task.id)).toEqual([2, 1]);
        expect(tasks.map(task => task.id)).toEqual([1, 2]);
    });
});

describe('dropping a card', () => {
    const column = [card(10, 'urgent', 'review'), card(11, 'medium', 'review'), card(12, 'low', 'review')];

    it('takes the status of the column and the priority of the card above', () => {
        expect(dropChanges(card(1, 'low'), 'review', column, 1)).toEqual({ status: 'review', priority: 'urgent' });
        expect(dropChanges(card(1, 'high'), 'review', column, 3)).toEqual({ status: 'review', priority: 'low' });
    });

    it('takes the priority of the first card when dropped at the top', () => {
        expect(dropChanges(card(1, 'low'), 'review', column, 0)).toEqual({ status: 'review', priority: 'urgent' });
    });

    it('keeps its priority in an empty column', () => {
        expect(dropChanges(card(1, 'high'), 'done', [], 0)).toEqual({ status: 'done' });
    });

    it('only changes the priority inside its own column', () => {
        const others = [card(10, 'urgent'), card(11, 'medium')];
        expect(dropChanges(card(1, 'low'), 'todo', others, 0)).toEqual({ priority: 'urgent' });
    });

    it('changes nothing when dropped where it already belongs', () => {
        expect(dropChanges(card(1, 'medium'), 'todo', [card(10, 'urgent'), card(11, 'medium')], 2)).toBeNull();
        expect(dropChanges(card(1, 'medium'), 'todo', [], 0)).toBeNull();
    });
});

describe('moving a card from the keyboard', () => {
    it('moves one column or one level at a time', () => {
        expect(stepChanges(card(1, 'medium', 'todo'), 1, 0)).toEqual({ status: 'in_progress' });
        expect(stepChanges(card(1, 'medium', 'review'), -1, 0)).toEqual({ status: 'in_progress' });
        expect(stepChanges(card(1, 'medium'), 0, 1)).toEqual({ priority: 'high' });
        expect(stepChanges(card(1, 'medium'), 0, -1)).toEqual({ priority: 'low' });
    });

    it('stops at the edges of the board and of the scale', () => {
        expect(stepChanges(card(1, 'medium', 'todo'), -1, 0)).toBeNull();
        expect(stepChanges(card(1, 'medium', 'done'), 1, 0)).toBeNull();
        expect(stepChanges(card(1, 'urgent'), 0, 1)).toBeNull();
        expect(stepChanges(card(1, 'low'), 0, -1)).toBeNull();
    });
});
