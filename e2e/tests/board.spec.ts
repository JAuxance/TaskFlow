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

test('dragging a task to another column changes its status and gives it the priority of the task above', async ({ actor }) => {
    const { alice, page, brief } = await openBoard(actor);
    const target = card(page, 'review', 'Review the mock-ups');
    const box = (await target.boundingBox())!;
    // Dropped on the lower half of the card: it lands under it.
    await card(page, 'todo', 'Write the brief').dragTo(target, { targetPosition: { x: 40, y: box.height - 6 } });

    await expect(card(page, 'review', 'Write the brief')).toContainText('High priority');
    // Two tasks of the same priority stay in the order they were created.
    await expect(kanbanColumn(page, 'review').getByRole('button')).toHaveText([/Write the brief/, /Review the mock-ups/]);
    await expect(card(page, 'todo', 'Write the brief')).toHaveCount(0);
    // Saved by the server, not only displayed.
    await expect.poll(() => stored(alice, brief)).toBe('review high');
});

test('dragging a task to the top of its column gives it the priority of the first task', async ({ actor }) => {
    const { alice, page, brief } = await openBoard(actor);
    await card(page, 'todo', 'Write the brief').dragTo(card(page, 'todo', 'Choose the palette'), { targetPosition: { x: 40, y: 6 } });

    await expect(card(page, 'todo', 'Write the brief')).toContainText('Urgent priority');
    await expect.poll(() => stored(alice, brief)).toBe('todo urgent');
});

test('the same moves are available from the keyboard', async ({ actor }) => {
    const { alice, page, brief } = await openBoard(actor);
    await card(page, 'todo', 'Write the brief').focus();

    await page.keyboard.press('Shift+ArrowRight');
    const moved = card(page, 'in_progress', 'Write the brief');
    await expect(moved).toBeFocused();
    await page.keyboard.press('Shift+ArrowUp');
    await expect(moved).toContainText('Medium priority');
    await expect(moved).toBeFocused();
    // Each move is announced to screen readers.
    await expect(page.locator('.visually-hidden[role="status"]')).toHaveText('Write the brief: In Progress, Medium priority.');
    await expect.poll(() => stored(alice, brief)).toBe('in_progress medium');

    // At the edge of the board, nothing moves.
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(card(page, 'todo', 'Write the brief')).toBeFocused();
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(card(page, 'todo', 'Write the brief')).toBeFocused();
});

test('a move refused by the server is undone and explained', async ({ actor }) => {
    const { alice, page, brief } = await openBoard(actor);
    await page.route('**/api/tasks/*', route => route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Storage is unavailable.' }) })
        : route.fallback());

    await card(page, 'todo', 'Write the brief').focus();
    await page.keyboard.press('Shift+ArrowRight');

    await expect(page.locator('#tasks-message')).toHaveText('Storage is unavailable.');
    await expect(card(page, 'todo', 'Write the brief')).toContainText('Low priority');
    await expect(card(page, 'in_progress', 'Write the brief')).toHaveCount(0);
    expect(await stored(alice, brief)).toBe('todo low');
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
    await expect(guestCard).toHaveAttribute('draggable', 'false');
    await expect(page.getByText(/Drag a task/)).toHaveCount(0);
    await guestCard.focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expect(guestCard).toBeFocused();
    // The server refuses it as well.
    await api(gina.request, 'PATCH', `/api/tasks/${brief.id}`, { status: 'done' }, 403);
    expect(await stored(alice, brief)).toBe('todo low');
});
