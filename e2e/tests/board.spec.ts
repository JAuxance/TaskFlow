import type { Page } from '@playwright/test';
import { expect, kanbanColumn, openProject, openWorkspace, reloadApp, test, type ActorFactory } from '../support/test';
import { addMember, api, createProject, createTask, createWorkspace, type Task } from '../support/api';

// Moving a card on the board: across changes its status, up or down its priority.

const card = (page: Page, status: string, title: string) => kanbanColumn(page, status).getByRole('button', { name: new RegExp(title) });
const stored = (actor: { request: Parameters<typeof api>[0] }, task: Task) =>
    api<Task & { priority: string }>(actor.request, 'GET', `/api/tasks/${task.id}`).then(saved => `${saved.status} ${saved.priority}`);

async function openBoard(actor: ActorFactory) {
    const alice = await actor('alice');
    const workspace = await createWorkspace(alice.request, 'Design studio');
    const project = await createProject(alice.request, workspace.id, 'Website redesign');
    const brief = await createTask(alice.request, project.id, { title: 'Write the brief', priority: 'low' });
    await createTask(alice.request, project.id, { title: 'Choose the palette', priority: 'urgent' });
    await createTask(alice.request, project.id, { title: 'Review the mock-ups', status: 'review', priority: 'high' });
    await reloadApp(alice.page);
    await openProject(alice.page, 'Website redesign');
    await expect(card(alice.page, 'review', 'Review the mock-ups')).toBeVisible();
    return { alice, page: alice.page, workspace, brief };
}

test('a column lists its most pressing tasks first', async ({ actor }) => {
    const { page } = await openBoard(actor);
    // The urgent task was created after the low one, and still comes first.
    await expect(kanbanColumn(page, 'todo').getByRole('button')).toHaveText([/Choose the palette/, /Write the brief/]);
});









test('a guest cannot move a task', async ({ actor }) => {
    const { alice, workspace, brief } = await openBoard(actor);
    const gina = await actor('gina');
    await addMember(alice.request, workspace.id, 'gina', 'guest');
    await reloadApp(gina.page);
    await openWorkspace(gina.page, 'Design studio');
    await openProject(gina.page, 'Website redesign');

    const page = gina.page;
    const guestCard = card(page, 'todo', 'Write the brief');
    await expect(guestCard).not.toHaveAttribute('draggable');
    await expect(guestCard).not.toHaveAttribute('aria-describedby');
    await guestCard.focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expect(guestCard).toBeFocused();
    // The server refuses it as well.
    await api(gina.request, 'PATCH', `/api/tasks/${brief.id}`, { status: 'done' }, 403);
    expect(await stored(alice, brief)).toBe('todo low');
});
