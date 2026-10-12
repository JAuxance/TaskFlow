import { inject, type InjectionKey, type Ref } from 'vue';

/**
 * One lock for the whole profile dialog: while a section saves, the others
 * wait and the dialog cannot be closed, as in the current frontend.
 */
export interface ProfileLock {
    busy: Ref<boolean>;
    run(action: () => Promise<void>): Promise<void>;
    /** Incremented each time the dialog closes, so sections forget passwords. */
    closed: Ref<number>;
}

export const profileLockKey: InjectionKey<ProfileLock> = Symbol('profile lock');

export function useProfileLock(): ProfileLock {
    const lock = inject(profileLockKey);
    if (!lock) throw new Error('A profile section must be used inside the profile dialog');
    return lock;
}
