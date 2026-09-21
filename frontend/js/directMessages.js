import { apiRequest } from "./api.js";
import { MESSAGE_PAGE_SIZE, subscribeChat } from "./workspaceChat.js";

export function getDirectMessages(userId, page = 1) {
    return apiRequest(`/api/users/${userId}/direct_messages?limit=${MESSAGE_PAGE_SIZE}&page=${page}`);
}

export function sendDirectMessage(userId, message) {
    return apiRequest(`/api/users/${userId}/direct_messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
    });
}

export function isDirectConversation(message, currentUserId, otherUserId) {
    return (Number(message.sender_id) === Number(currentUserId) && Number(message.receiver_id) === Number(otherUserId))
        || (Number(message.sender_id) === Number(otherUserId) && Number(message.receiver_id) === Number(currentUserId));
}

export function subscribeDirectMessages(userId, otherUserId, callbacks) {
    return subscribeChat({
        joinEvent: "join_direct_message", joinedEvent: "direct_message_joined", messageEvent: "new_direct_message",
        payload: { user_id: Number(otherUserId) },
        acceptsJoin: data => Number(data.user_id) === Number(otherUserId),
        acceptsMessage: message => isDirectConversation(message, userId, otherUserId)
    }, callbacks);
}
