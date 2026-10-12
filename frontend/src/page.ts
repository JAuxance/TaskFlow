/**
 * After a navigation, name the browser tab after the main heading and move the
 * focus to it, so keyboard and screen-reader users land on the new screen.
 */
export function announcePage(): void {
    const heading = document.querySelector<HTMLElement>('#app h1');
    if (heading) {
        heading.id = 'page-title';
        heading.tabIndex = -1;
        document.title = heading.textContent === 'TaskFlow' ? 'TaskFlow — Sign in' : `${heading.textContent} — TaskFlow`;
        document.getElementById('page-content')?.setAttribute('aria-labelledby', heading.id);
        heading.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
}
