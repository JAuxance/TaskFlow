import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSidebarStore } from './sidebar';

const workspace = { id: 1, owner_id: 1, name: 'Design studio', created_at: '2026-10-12T09:00:00', icon_type: null, icon_value: null, color: 'blue' };
const conversation = { user_id: 2, username: 'bob', first_name: null, avatar_url: null, last_message: 'On it.', last_message_time: '2026-10-12T06:42:00' };

type Answer = [status: number, body: unknown];

/** Answer the two lists the sidebar reads. */
function serve(answers: { workspaces: Answer; conversations: Answer }) {
    vi.stubGlobal('fetch', async (url: string) => {
        const [status, body] = url.startsWith('/api/workspaces') ? answers.workspaces : answers.conversations;
        return new Response(JSON.stringify(body), { status });
    });
}

beforeEach(() => {
    vi.unstubAllGlobals();
    setActivePinia(createPinia());
});

it('reads the workspaces and the conversations', async () => {
    serve({ workspaces: [200, [workspace]], conversations: [200, [conversation]] });
    const sidebar = useSidebarStore();
    await sidebar.refresh();

    expect(sidebar.workspaces).toEqual([workspace]);
    expect(sidebar.conversations).toEqual([conversation]);
    expect(sidebar.workspacesError).toBe('');
    expect(sidebar.conversationsError).toBe('');
});

it('reports unreadable workspaces without hiding the conversations', async () => {
    serve({ workspaces: [500, { error: 'database unavailable' }], conversations: [200, [conversation]] });
    const sidebar = useSidebarStore();
    await sidebar.refresh();

    expect(sidebar.workspaces).toEqual([]);
    expect(sidebar.workspacesError).toBe('database unavailable');
    expect(sidebar.conversations).toEqual([conversation]);
});

it('keeps the conversations already shown when they cannot be read again', async () => {
    const sidebar = useSidebarStore();
    serve({ workspaces: [200, [workspace]], conversations: [200, [conversation]] });
    await sidebar.refresh();
    serve({ workspaces: [200, [workspace]], conversations: [500, { error: 'database unavailable' }] });
    await sidebar.refresh();

    expect(sidebar.conversations).toEqual([conversation]);
    expect(sidebar.conversationsError).toBe('database unavailable');
});

it('changes nothing when the session expired: the login screen takes over', async () => {
    const sidebar = useSidebarStore();
    serve({ workspaces: [200, [workspace]], conversations: [200, [conversation]] });
    await sidebar.refresh();
    serve({ workspaces: [401, { error: 'session expired' }], conversations: [401, { error: 'session expired' }] });
    await sidebar.refresh();

    expect(sidebar.workspaces).toEqual([workspace]);
    expect(sidebar.workspacesError).toBe('');
});
