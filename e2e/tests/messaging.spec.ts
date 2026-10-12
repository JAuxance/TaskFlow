import type { Page, Route } from '@playwright/test';
import { composer, expect, openWorkspace, reloadApp, socketEvent, test, type Actor, type ActorFactory } from '../support/test';
import { addMember, createWorkspace } from '../support/api';
import { sql } from '../support/stack';

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

test('workspace messages reach the other member without a reload', { tag: '@vue' }, async ({ actor }) => {
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

test('two members exchange private messages', { tag: '@vue' }, async ({ actor }) => {
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

async function openWorkspaceChat(page: Page) {
    const joined = socketEvent(page, 'workspace_joined');
    await page.getByRole('tab', { name: 'Messages' }).click();
    await joined;
}

test('a long history is read fifty messages at a time', { tag: '@vue' }, async ({ actor }) => {
    const [alice] = await twoMembers(actor);
    sql(`INSERT INTO workspace_messages(workspace_id, user_id, content)
         SELECT workspace_id, user_id, 'Message ' || n FROM workspace_members, generate_series(1, 60) n WHERE role = 'owner'`);
    const page = alice.page;
    await openWorkspaceChat(page);
    const messages = page.getByRole('log').getByRole('article');

    // The latest fifty, oldest first, with the newest at the bottom.
    await expect(messages).toHaveCount(50);
    await expect(messages.last()).toContainText('Message 60');
    await expect(messages.first()).toContainText('Message 11');

    await page.getByRole('button', { name: 'Load older messages' }).click();
    await expect(messages).toHaveCount(60);
    await expect(messages.first()).toContainText('Message 1');
    await expect(page.getByRole('button', { name: 'Load older messages' })).toBeHidden();
});

test('an empty message cannot be sent, and a refused one stays in the field', { tag: '@vue' }, async ({ actor }) => {
    const [alice] = await twoMembers(actor);
    const page = alice.page;
    await openWorkspaceChat(page);
    const send = page.getByRole('button', { name: 'Send message' });

    await expect(send).toBeDisabled();
    await composer(page).fill('   ');
    await expect(send).toBeDisabled();
    await composer(page).fill('Kickoff is on Monday');
    await expect(page.locator('#chat-character-count')).toHaveText('20 / 2000');
    await expect(send).toBeEnabled();

    // The server fails: the draft is kept so nothing has to be typed again.
    const refuse = (route: Route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        const origin = route.request().headers().origin;
        return route.fulfill({
            status: 500, json: { error: 'message creation failed' },
            headers: origin ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' } : {},
        });
    };
    await page.route('**/api/workspaces/*/messages', refuse);
    await send.click();
    await expect(page.locator('.chat-send-error')).toHaveText('message creation failed');
    await expect(composer(page)).toHaveValue('Kickoff is on Monday');

    await page.unroute('**/api/workspaces/*/messages');
    await send.click();
    await expect(page.getByRole('log')).toContainText('Kickoff is on Monday');
    await expect(composer(page)).toHaveValue('');
});

test('a private conversation ends when the two members no longer share a workspace', { tag: '@vue' }, async ({ actor }) => {
    const [alice, bob] = await twoMembers(actor);
    await alice.page.getByRole('tab', { name: /Members/ }).click();
    const joined = socketEvent(alice.page, 'direct_message_joined');
    await alice.page.getByRole('button', { name: 'Send a private message to bob' }).click();
    await joined;
    await composer(alice.page).fill('Before leaving');
    await alice.page.getByRole('button', { name: 'Send message' }).click();
    await expect(alice.page.getByRole('log')).toContainText('Before leaving');

    // Bob is removed from the only workspace they share.
    sql(`DELETE FROM workspace_members WHERE user_id = ${bob.user.id}`);
    await composer(alice.page).fill('Are you still there?');
    await alice.page.getByRole('button', { name: 'Send message' }).click();

    await expect(alice.page.getByText('This conversation is unavailable. You must still share a workspace with this member.')).toBeVisible();
    await expect(composer(alice.page)).toBeDisabled();
    await alice.page.getByRole('button', { name: 'Back to members' }).click();
    await expect(alice.page.getByRole('tab', { name: /Members/ })).toHaveAttribute('aria-selected', 'true');
});
