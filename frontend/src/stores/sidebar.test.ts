import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSidebarStore } from './sidebar';

const workspace = { id: 1, owner_id: 1, name: 'Design studio', created_at: '2026-10-12T09:00:00', icon_type: null, icon_value: null, color: 'blue' };
function serve(status: number, body: unknown) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
}
beforeEach(() => { vi.unstubAllGlobals(); setActivePinia(createPinia()); });
it('reads workspaces without requesting retired conversations', async () => {
    serve(200, [workspace]);
    const sidebar = useSidebarStore();
    await sidebar.refresh();
    expect(sidebar.workspaces).toEqual([workspace]);
    expect(sidebar.workspacesError).toBe('');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/workspaces?limit=100&page=1');
});
it('reports a failed workspace request', async () => {
    serve(500, { error: 'database unavailable' });
    const sidebar = useSidebarStore();
    await sidebar.refresh();
    expect(sidebar.workspaces).toEqual([]);
    expect(sidebar.workspacesError).toBe('database unavailable');
});
it('leaves navigation to the session handler on expiry', async () => {
    const sidebar = useSidebarStore();
    serve(200, [workspace]); await sidebar.refresh();
    serve(401, { error: 'session expired' }); await sidebar.refresh();
    expect(sidebar.workspaces).toEqual([workspace]);
});
