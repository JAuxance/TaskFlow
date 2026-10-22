import { describe, expect, it } from 'vitest';
import type { TaskPriority, TaskStatus } from '../api/types';
import { sortForBoard } from './board';

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
