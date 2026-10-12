import { ref } from 'vue';

/** Run one action at a time: a second click while it is pending does nothing. */
export function useBusy() {
    const busy = ref(false);

    async function run(action: () => Promise<void>): Promise<void> {
        if (busy.value) return;
        busy.value = true;
        try {
            await action();
        } finally {
            busy.value = false;
        }
    }

    return { busy, run };
}
