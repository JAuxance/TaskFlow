import { composer, expect, openWorkspace, reloadApp, socketEvent, test, type Actor, type ActorFactory } from '../support/test';
import { addMember, createWorkspace } from '../support/api';

async function twoMembers(actor: ActorFactory): Promise<[Actor, Actor]> {
    const alice = await actor('alice');
    const bob = await actor('bob');
    const workspace = await createWorkspace(alice.request, 'Design studio');
    await addMember(alice.request, workspace.id, 'bob', 'member');
    for (const { page } of [alice, bob]) {
        await reloadApp(page);
        await openWorkspace(page, 'Design studio');
    }
    return [alice, bob];
}

test('workspace messages reach the other member without a reload', async ({ actor }) => {
    const [alice, bob] = await twoMembers(actor);
    for (const { page } of [alice, bob]) {
        const joined = socketEvent(page, 'workspace_joined');
        await page.getByRole('tab', { name: 'Messages' }).click();
        await joined;
        await expect(page.getByRole('heading', { name: 'Start the conversation' })).toBeVisible();
    }

    await composer(alice.page).fill('Kickoff is on Monday');
    await alice.page.getByRole('button', { name: 'Send message' }).click();
    await expect(bob.page.getByRole('log')).toContainText('Kickoff is on Monday');
    await expect(composer(alice.page)).toHaveValue('');

    await composer(bob.page).fill('Noted, thanks');
    await composer(bob.page).press('Enter');
    await expect(alice.page.getByRole('log')).toContainText('Noted, thanks');

    // The sender receives its message by HTTP and by the live event: it is shown once.
    for (const { page } of [alice, bob]) {
        await expect(page.getByRole('log').getByRole('article')).toHaveCount(2);
    }
});

test('two members exchange private messages', async ({ actor }) => {
    const [alice, bob] = await twoMembers(actor);
    const navigation = (page: Actor['page']) => page.getByRole('navigation', { name: 'Workspaces' });

    await alice.page.getByRole('tab', { name: /Members/ }).click();
    const aliceJoined = socketEvent(alice.page, 'direct_message_joined');
    await alice.page.getByRole('button', { name: 'Send a private message to bob' }).click();
    await aliceJoined;
    await expect(alice.page.getByText('Conversation with bob')).toBeVisible();
    await composer(alice.page).fill('Can you review the brief?');
    await alice.page.getByRole('button', { name: 'Send message' }).click();
    await expect(alice.page.getByRole('log')).toContainText('Can you review the brief?');

    // The conversation appears in the recipient's sidebar on their next navigation.
    await bob.page.getByRole('button', { name: 'All workspaces' }).click();
    const conversation = navigation(bob.page).getByRole('button', { name: /alice/ });
    await expect(conversation).toContainText('Can you review the brief?');
    const bobJoined = socketEvent(bob.page, 'direct_message_joined');
    await conversation.click();
    await bobJoined;
    await expect(bob.page.getByText('Conversation with alice')).toBeVisible();
    await expect(bob.page.getByRole('log')).toContainText('Can you review the brief?');

    await composer(bob.page).fill('On it');
    await bob.page.getByRole('button', { name: 'Send message' }).click();
    await expect(alice.page.getByRole('log')).toContainText('On it');
    await expect(navigation(alice.page).getByRole('button', { name: /bob/ })).toContainText('On it');
});
