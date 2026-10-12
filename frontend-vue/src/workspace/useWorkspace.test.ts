import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '../stores/session';
import { useWorkspace } from './useWorkspace';

const workspace = { id: 3, owner_id: 1, name: 'Design studio', created_at: '2026-10-12T09:00:00', icon_type: null, icon_value: null, color: 'blue' };
const member = (userId: number, role: string) => ({ id: userId, workspace_id: 3, user_id: userId, role, created_at: '2026-10-12T09:00:00', user_name: `user${userId}`, avatar_url: null });
const members = [member(1, 'owner'), member(2, 'admin'), member(4, 'guest'), member(5, 'owner')];

type Answer = [status: number, body: unknown];

function serve(answers: { workspace: Answer; members: Answer }) {
    vi.stubGlobal('fetch', async (url: string) => {
        const [status, body] = url.includes('/members') ? answers.members : answers.workspace;
        return new Response(JSON.stringify(body), { status });
    });
}

/** The workspace as seen by the user with this id. */
async function seenBy(userId: number) {
    useSessionStore().update({ id: userId, username: `user${userId}`, email: `user${userId}@example.com`, first_name: null, avatar_url: null });
    const context = useWorkspace();
    const available = await context.load(3);
    return { context, available };
}

beforeEach(() => {
    vi.unstubAllGlobals();
    setActivePinia(createPinia());
    serve({ workspace: [200, workspace], members: [200, members] });
});

it('recognizes the primary owner and lets them manage', async () => {
    const { context } = await seenBy(1);
    expect(context.isOwner.value).toBe(true);
    expect(context.role.value).toBe('owner');
    expect(context.canManage.value).toBe(true);
});

it('gives another owner the Owner role without making them the primary owner', async () => {
    const { context } = await seenBy(5);
    expect(context.isOwner.value).toBe(false);
    expect(context.role.value).toBe('owner');
    expect(context.canManage.value).toBe(true);
});

it.each([[2, 'admin', true], [4, 'guest', false]] as const)('reads the role of member %i from the member list', async (userId, role, manages) => {
    const { context } = await seenBy(userId);
    expect(context.role.value).toBe(role);
    expect(context.canManage.value).toBe(manages);
});

it('assumes no role when the member list cannot be read', async () => {
    serve({ workspace: [200, workspace], members: [500, { error: 'database unavailable' }] });
    const { context, available } = await seenBy(2);

    expect(available).toBe(true);
    expect(context.members.value).toBeNull();
    expect(context.membersError.value).toBe('database unavailable');
    expect(context.role.value).toBeNull();
    expect(context.canManage.value).toBe(false);
});

it('reports a workspace the user cannot see', async () => {
    serve({ workspace: [404, { error: 'resource not found' }], members: [404, { error: 'resource not found' }] });
    const { context, available } = await seenBy(2);

    expect(available).toBe(false);
    expect(context.workspace.value).toBeNull();
    expect(context.error.value).toBe('resource not found');
});
