// Live messages over Socket.IO. One connection per open chat, as in
// frontend/js/workspaceChat.js: it joins its room at every (re)connection and
// stops for good when the server refuses access.
import { io } from 'socket.io-client';
import type { ChatMessage, DirectMessage, WorkspaceMessage } from '../api/types';

export type ChatStatus = 'connecting' | 'live' | 'offline';

export interface ChatCallbacks {
    onMessage(message: ChatMessage): void;
    onStatus(status: ChatStatus): void;
    /** The room is joined: messages sent meanwhile can now be read again. */
    onJoined(): void;
    /** The server refused; `reason` is its message ("unauthorized" for an expired session). */
    onDenied(reason: string): void;
}

interface Room<Message> {
    joinEvent: string;
    joinedEvent: string;
    messageEvent: string;
    payload: Record<string, number>;
    acceptsJoin(data: Record<string, unknown>): boolean;
    acceptsMessage(message: Message): boolean;
}

/** Subscribe to a room; the returned function ends the subscription. */
function subscribe<Message extends ChatMessage>(room: Room<Message>, callbacks: ChatCallbacks): () => void {
    // Same origin as the page: Vite in development, Nginx in production relay /socket.io.
    const socket = io({ withCredentials: true, autoConnect: false, forceNew: true });
    socket.on('connect', () => {
        callbacks.onStatus('connecting');
        socket.emit(room.joinEvent, room.payload);
    });
    socket.on(room.joinedEvent, (data: Record<string, unknown>) => {
        if (!room.acceptsJoin(data)) return;
        callbacks.onStatus('live');
        callbacks.onJoined();
    });
    socket.on(room.messageEvent, (message: Message) => {
        if (room.acceptsMessage(message)) callbacks.onMessage(message);
    });
    socket.on('disconnect', () => callbacks.onStatus('offline'));
    socket.on('connect_error', () => callbacks.onStatus('offline'));
    socket.on('socket_error', (data: { message: string }) => {
        socket.disconnect();
        callbacks.onStatus('offline');
        callbacks.onDenied(data.message);
    });

    const goOffline = () => {
        socket.disconnect();
        callbacks.onStatus('offline');
    };
    const goOnline = () => {
        callbacks.onStatus('connecting');
        socket.connect();
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    if (navigator.onLine) goOnline();
    else goOffline();

    return () => {
        window.removeEventListener('offline', goOffline);
        window.removeEventListener('online', goOnline);
        socket.removeAllListeners();
        socket.disconnect();
    };
}

export function subscribeWorkspaceChat(workspaceId: number, callbacks: ChatCallbacks): () => void {
    return subscribe<WorkspaceMessage>({
        joinEvent: 'join_workspace', joinedEvent: 'workspace_joined', messageEvent: 'new_message',
        payload: { workspace_id: workspaceId },
        acceptsJoin: data => Number(data.workspace_id) === workspaceId,
        acceptsMessage: message => Number(message.workspace_id) === workspaceId,
    }, callbacks);
}

/** A message belongs to the conversation between these two users, in either direction. */
export function isDirectConversation(message: Pick<DirectMessage, 'sender_id' | 'receiver_id'>, userId: number, otherUserId: number): boolean {
    return (Number(message.sender_id) === userId && Number(message.receiver_id) === otherUserId)
        || (Number(message.sender_id) === otherUserId && Number(message.receiver_id) === userId);
}

export function subscribeDirectMessages(userId: number, otherUserId: number, callbacks: ChatCallbacks): () => void {
    return subscribe<DirectMessage>({
        joinEvent: 'join_direct_message', joinedEvent: 'direct_message_joined', messageEvent: 'new_direct_message',
        payload: { user_id: otherUserId },
        acceptsJoin: data => Number(data.user_id) === otherUserId,
        acceptsMessage: message => isDirectConversation(message, userId, otherUserId),
    }, callbacks);
}
