import { expect, it, vi } from 'vitest';
import { useSerialQueue } from './useSerialQueue';

/** A promise the test settles by hand. */
function deferred<T = void>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

it('starts an action only when the previous one has finished', async () => {
    const queue = useSerialQueue();
    const first = deferred();
    const order: string[] = [];
    const one = queue.enqueue(async () => { order.push('first starts'); await first.promise; order.push('first ends'); });
    const two = queue.enqueue(async () => { order.push('second starts'); });
    await Promise.resolve();
    await Promise.resolve();

    expect(order).toEqual(['first starts']);
    first.resolve();
    await Promise.all([one, two]);
    expect(order).toEqual(['first starts', 'first ends', 'second starts']);
});

it('keeps the order in which actions were added', async () => {
    const queue = useSerialQueue();
    const order: number[] = [];
    await Promise.all([3, 1, 2].map(step => queue.enqueue(async () => {
        await new Promise(resolve => setTimeout(resolve, step));
        order.push(step);
    })));

    expect(order).toEqual([3, 1, 2]);
});

it('gives each caller the outcome of its own action', async () => {
    const queue = useSerialQueue();
    const saved = queue.enqueue(async () => 'saved');
    const failed = queue.enqueue(async () => { throw new Error('refused'); });

    await expect(saved).resolves.toBe('saved');
    await expect(failed).rejects.toThrow('refused');
});

it('runs the following actions after a failure', async () => {
    const queue = useSerialQueue();
    const next = vi.fn(async () => 'still running');
    const failed = queue.enqueue(async () => { throw new Error('refused'); });
    const after = queue.enqueue(next);

    await expect(failed).rejects.toThrow('refused');
    await expect(after).resolves.toBe('still running');
});

it('is idle only once every action added so far has finished, even a failed one', async () => {
    const queue = useSerialQueue();
    const save = deferred();
    let idle = false;
    queue.enqueue(() => save.promise).catch(() => undefined);
    queue.enqueue(async () => { throw new Error('refused'); }).catch(() => undefined);
    void queue.idle().then(() => { idle = true; });
    await Promise.resolve();
    await Promise.resolve();

    expect(idle).toBe(false);
    save.resolve();
    await queue.idle();
    expect(idle).toBe(true);
});

it('is idle at once when nothing was added', async () => {
    await expect(useSerialQueue().idle()).resolves.toBeUndefined();
});
