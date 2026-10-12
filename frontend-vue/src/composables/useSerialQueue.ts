/**
 * Run asynchronous actions one after the other, in the order they were added.
 *
 * The task screen needs it because the server saves a task by rewriting its
 * whole row: two saves sent at the same time could each overwrite the field
 * the other one changed. A failed action does not block the following ones.
 */
export function useSerialQueue() {
    let tail: Promise<unknown> = Promise.resolve();

    /** Add an action; the returned promise settles with that action's outcome. */
    function enqueue<T>(action: () => Promise<T>): Promise<T> {
        const pending = tail.then(action);
        tail = pending.catch(() => undefined);
        return pending;
    }

    /** Resolve once everything added so far has finished, whatever the outcome. */
    function idle(): Promise<void> {
        return tail.then(() => undefined);
    }

    return { enqueue, idle };
}
