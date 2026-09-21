import { API_BASE_URL, apiRequest } from "./api.js";

export const MESSAGE_PAGE_SIZE = 50;

export function getWorkspaceMessages(workspaceId, page = 1) {
    return apiRequest(`/api/workspaces/${workspaceId}/messages?limit=${MESSAGE_PAGE_SIZE}&page=${page}`);
}

export function sendWorkspaceMessage(workspaceId, message) {
    return apiRequest(`/api/workspaces/${workspaceId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
    });
}

export function subscribeWorkspaceChat(workspaceId, { onMessage, onStatus, onJoined, onDenied }) {
    return subscribeChat({
        joinEvent: "join_workspace", joinedEvent: "workspace_joined", messageEvent: "new_message",
        payload: { workspace_id: workspaceId },
        acceptsJoin: data => Number(data.workspace_id) === Number(workspaceId),
        acceptsMessage: message => Number(message.workspace_id) === Number(workspaceId)
    }, { onMessage, onStatus, onJoined, onDenied });
}

export function subscribeChat(config, { onMessage, onStatus, onJoined, onDenied }) {
    if (typeof window.io !== "function") {
        onStatus("offline");
        return () => {};
    }
    const socket = window.io(API_BASE_URL, {
        withCredentials: true,
        autoConnect: false,
        forceNew: true
    });
    socket.on("connect", () => {
        onStatus("connecting");
        socket.emit(config.joinEvent, config.payload);
    });
    socket.on(config.joinedEvent, data => {
        if (!config.acceptsJoin(data)) return;
        onStatus("live");
        onJoined();
    });
    socket.on(config.messageEvent, message => {
        if (config.acceptsMessage(message)) onMessage(message);
    });
    socket.on("disconnect", () => onStatus("offline"));
    socket.on("connect_error", () => onStatus("offline"));
    socket.on("socket_error", data => {
        socket.disconnect();
        onStatus("offline");
        onDenied(data.message);
    });
    const goOffline = () => {
        socket.disconnect();
        onStatus("offline");
    };
    const goOnline = () => {
        onStatus("connecting");
        socket.connect();
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    if (navigator.onLine) goOnline();
    else goOffline();
    return () => {
        window.removeEventListener("offline", goOffline);
        window.removeEventListener("online", goOnline);
        socket.removeAllListeners();
        socket.disconnect();
    };
}
