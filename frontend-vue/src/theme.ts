// Same rules as applyTheme() in frontend/js/app.js. public/theme-init.js has
// already set the theme on <html> before the stylesheet loaded.
import { computed, ref } from 'vue';

const STORAGE_KEY = 'taskflow-theme';
const root = document.documentElement;
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const theme = ref<'light' | 'dark'>('light');
const notSaved = ref(false);

function apply(preference: string | null | undefined): void {
    const chosen = preference === 'light' || preference === 'dark' ? preference : 'system';
    root.dataset.themePreference = chosen;
    theme.value = chosen === 'dark' || (chosen === 'system' && systemDark.matches) ? 'dark' : 'light';
    root.dataset.theme = theme.value;
    notSaved.value = false;
}

apply(root.dataset.themePreference);
systemDark.addEventListener('change', () => {
    if (root.dataset.themePreference === 'system') apply('system');
});
// Another tab changed the theme: follow it.
window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY || event.key === null) apply(event.newValue);
});

export function useTheme() {
    const label = computed(() => theme.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    const title = computed(() => notSaved.value
        ? `${label.value} (for this visit; preference could not be saved)` : label.value);

    function toggle(): void {
        const next = theme.value === 'dark' ? 'light' : 'dark';
        apply(next);
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            notSaved.value = true;
        }
    }

    return { theme, label, title, toggle };
}
