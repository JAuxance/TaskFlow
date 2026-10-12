import { compose } from './support/stack';

export default async function globalTeardown(): Promise<void> {
    // E2E_KEEP_STACK=1 keeps the stack running to inspect a failure or rerun faster.
    if (process.env.E2E_KEEP_STACK === '1') return;
    compose('down', '--volumes');
}
