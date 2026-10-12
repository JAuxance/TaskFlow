import { addMember, api, createProject, createTask, createWorkspace } from './api';
import { reloadApp, type Actor, type ActorFactory } from './test';

/** "Today" for every page of the reference data, so due dates never drift. */
export const TODAY = new Date('2026-10-12T09:00:00+02:00');

export type Studio = { alice: Actor; bob: Actor; gina: Actor };

/**
 * A small but complete workspace: three roles, two projects, tasks in every
 * column (one overdue), a workspace discussion and a private conversation.
 * Layout checks and reference screenshots share it.
 */
export async function seedStudio(actor: ActorFactory): Promise<Studio> {
    const alice = await actor('alice');
    const bob = await actor('bob');
    const gina = await actor('gina');
    const workspace = await createWorkspace(alice.request, 'Design studio');
    await addMember(alice.request, workspace.id, 'bob', 'member');
    await addMember(alice.request, workspace.id, 'gina', 'guest');

    const website = await createProject(alice.request, workspace.id, 'Website redesign', 'New marketing site for the spring launch.');
    const mobile = await createProject(alice.request, workspace.id, 'Mobile app');
    for (const task of [
        { title: 'Write the creative brief', status: 'done', priority: 'medium', color: 'green', due_date: '2026-10-06T17:00:00', assignee_id: alice.user.id },
        { title: 'Design the home page', status: 'in_progress', priority: 'high', color: 'blue', due_date: '2026-10-16T12:00:00', assignee_id: bob.user.id, description: 'Hero, navigation and footer.\nStart from the approved wireframes.' },
        { title: 'Review the color palette', status: 'review', priority: 'medium', color: 'purple', due_date: '2026-10-14T09:00:00' },
        { title: 'Prepare the launch checklist', status: 'todo', priority: 'urgent', color: 'red', due_date: '2026-10-09T18:00:00' },
        { title: 'Collect client feedback', status: 'todo', priority: 'low' },
    ]) await createTask(alice.request, website.id, task);
    await createTask(alice.request, mobile.id, { title: 'Sketch the onboarding flow', color: 'yellow', due_date: '2026-10-21T10:00:00' });

    const post = (author: Actor, path: string, message: string) => api(author.request, 'POST', path, { message });
    await post(alice, `/api/workspaces/${workspace.id}/messages`, 'Kickoff is on Monday at 10.');
    await post(bob, `/api/workspaces/${workspace.id}/messages`, 'Noted, I will bring the first mock-ups.');
    await post(alice, `/api/users/${bob.user.id}/direct_messages`, 'Can you review the brief before Friday?');
    await post(bob, `/api/users/${alice.user.id}/direct_messages`, 'On it.');

    for (const { page } of [alice, bob, gina]) {
        await page.clock.setFixedTime(TODAY);
        await reloadApp(page);
    }
    return { alice, bob, gina };
}
