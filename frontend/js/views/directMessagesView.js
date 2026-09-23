import { renderChat } from "./workspaceChatView.js";
import { getDirectMessages, sendDirectMessage, subscribeDirectMessages, isDirectConversation } from "../directMessages.js";

export function renderDirectMessages(member, workspace, navigation) {
    const { content, user } = navigation;
    content.innerHTML = `
        <header class="page-heading page-heading-row">
            <div class="heading-copy"><h1>Direct messages</h1><p class="section-description direct-recipient"></p></div>
            <button type="button" class="btn-secondary direct-back">${workspace ? "Back to members" : "Back to workspaces"}</button>
        </header>
        <section class="direct-chat-panel" aria-label="Private conversation"></section>`;
    const name = member.first_name || member.username || member.user_name || member.user_email || "Member";
    content.querySelector(".direct-recipient").textContent = `Conversation with ${name}`;
    content.querySelector(".direct-back").addEventListener("click", () => workspace
        ? navigation.renderWorkspace(workspace, "members") : navigation.renderApp());
    renderChat(content.querySelector(".direct-chat-panel"), user, navigation, {
        getMessages: page => getDirectMessages(member.user_id, page),
        sendMessage: message => sendDirectMessage(member.user_id, message),
        subscribe: callbacks => subscribeDirectMessages(user.id, member.user_id, callbacks),
        acceptsMessage: message => isDirectConversation(message, user.id, member.user_id),
        onMessagesChanged: () => { void navigation.refreshConversations(); },
        title: name,
        embedded: true,
        emptyDescription: `Send your first private message to ${name}.`,
        placeholder: `Write a private message to ${name}…`,
        accessError: "This conversation is unavailable. You must still share a workspace with this member."
    });
}
