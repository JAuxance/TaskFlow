import { apiAssetUrl } from "../api.js";
import {
    getWorkspaceMessages, sendWorkspaceMessage, subscribeWorkspaceChat, MESSAGE_PAGE_SIZE
} from "../workspaceChat.js";

export function renderWorkspaceChat(panel, workspace, user, navigation) {
    return renderChat(panel, user, navigation, {
        getMessages: page => getWorkspaceMessages(workspace.id, page),
        sendMessage: message => sendWorkspaceMessage(workspace.id, message),
        subscribe: callbacks => subscribeWorkspaceChat(workspace.id, callbacks),
        acceptsMessage: message => Number(message.workspace_id) === Number(workspace.id),
        title: "Workspace messages",
        description: "A shared conversation for everyone in this workspace.",
        emptyDescription: "Share the first update with your workspace.",
        placeholder: "Share an update or ask your team a question…",
        accessError: "You no longer have access to this workspace. Return to your workspaces to continue."
    });
}

export function renderChat(panel, user, navigation, config) {
    panel.innerHTML = `
        <div class="workspace-chat">
            ${config.embedded ? "" : `<header class="chat-header">
                <div><h2></h2><p class="section-description"></p></div>
                <div class="chat-tools">
                    <button type="button" class="btn-secondary chat-refresh">Refresh</button>
                </div>
            </header>`}
            <p class="chat-connection-note field-hint" hidden>${config.embedded
                ? "Connection lost. Reload the page to check for new messages."
                : "Live updates are unavailable. Refresh to check for new messages."}</p>
            <p class="chat-history-error form-message" role="alert" hidden></p>
            <div class="chat-thread" tabindex="0" aria-label="Message history" aria-busy="true">
                <div class="chat-history-actions"><button type="button" class="btn-quiet chat-older" hidden>Load older messages</button></div>
                <div class="chat-empty empty-state"><h3>Loading messages…</h3><p>Your conversation will appear here.</p></div>
                <div class="chat-messages" role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions" aria-atomic="false"></div>
            </div>
            <button type="button" class="btn-secondary chat-jump" hidden>New messages ↓</button>
            <form class="chat-composer">
                <label for="chat-message-input">Message</label>
                <textarea id="chat-message-input" name="message" rows="3" maxlength="2000" aria-describedby="chat-message-help chat-character-count" required></textarea>
                <div class="chat-composer-footer">
                    <p id="chat-message-help" class="field-hint">Enter to send · Shift + Enter for a new line</p>
                    <span id="chat-character-count" class="field-hint">0 / 2000</span>
                    <button type="submit" class="btn-primary" disabled>Send message</button>
                </div>
                <p class="chat-send-error form-message" role="alert" hidden></p>
            </form>
        </div>`;

    const thread = panel.querySelector(".chat-thread");
    const list = panel.querySelector(".chat-messages");
    const empty = panel.querySelector(".chat-empty");
    const older = panel.querySelector(".chat-older");
    const refresh = panel.querySelector(".chat-refresh");
    const jump = panel.querySelector(".chat-jump");
    const form = panel.querySelector(".chat-composer");
    const input = form.elements.message;
    if (!config.embedded) {
        panel.querySelector(".chat-header h2").textContent = config.title;
        panel.querySelector(".chat-header .section-description").textContent = config.description;
    }
    list.setAttribute("aria-label", config.title);
    input.placeholder = config.placeholder;
    const submit = form.querySelector('[type="submit"]');
    const historyError = panel.querySelector(".chat-history-error");
    const sendError = panel.querySelector(".chat-send-error");
    const messages = new Map();
    let closed = false;
    let loading = false;
    let refreshPending = false;
    let nextPage = 1;
    let hasOlder = false;
    let sending = false;
    let denied = false;
    let followLatest = true;
    const current = () => !closed && panel.isConnected && navigation.isCurrent();

    function feedback(element, text = "") {
        element.textContent = text;
        element.hidden = !text;
    }

    function updateComposer() {
        panel.querySelector("#chat-character-count").textContent = `${input.value.length} / 2000`;
        submit.disabled = denied || sending || !input.value.trim() || input.value.length > 2000;
        input.disabled = denied;
        input.readOnly = sending;
        submit.textContent = sending ? "Sending…" : "Send message";
        form.setAttribute("aria-busy", String(sending));
    }

    function scrollToLatest() {
        thread.scrollTop = thread.scrollHeight;
        followLatest = true;
        jump.hidden = true;
    }

    function addMessages(items, { history = false, prepend = false, own = false } = {}) {
        const height = thread.scrollHeight;
        const top = thread.scrollTop;
        const fresh = [];
        for (const message of items) {
            if (!config.acceptsMessage(message) || messages.has(Number(message.id))) continue;
            const row = messageRow(message, user);
            messages.set(Number(message.id), { message, row });
            fresh.push(row);
        }
        if (!fresh.length) return;
        config.onMessagesChanged?.();
        // Both the HTTP response and the live event may contain the same message.
        const ordered = [...messages.values()].sort((a, b) =>
            a.message.created_at.localeCompare(b.message.created_at) || Number(a.message.id) - Number(b.message.id));
        list.setAttribute("aria-live", history ? "off" : "polite");
        ordered.forEach(({ row }, index) => {
            if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
        });
        empty.hidden = true;
        if (prepend) thread.scrollTop = top + thread.scrollHeight - height;
        else if (own || (followLatest && !panel.hidden)) scrollToLatest();
        else if (!history) jump.hidden = false;
        list.setAttribute("aria-live", "polite");
    }

    function checkAccess(result) {
        if (result.status === 401) {
            navigation.renderLogin("Your session expired. Sign in again to continue.");
            return false;
        }
        if (result.status === 403 || result.status === 404) {
            denyAccess();
            return false;
        }
        return true;
    }

    function denyAccess() {
        denied = true;
        disconnect();
        feedback(historyError, config.accessError);
        older.hidden = true;
        if (refresh) refresh.disabled = true;
        updateComposer();
    }

    async function loadHistory(loadOlder = false) {
        if (!current() || denied) return;
        if (loading) {
            if (!loadOlder) refreshPending = true;
            return;
        }
        loading = true;
        if (refresh) refresh.disabled = true;
        older.disabled = true;
        thread.setAttribute("aria-busy", "true");
        feedback(historyError);
        // On reconnect, page back to the newest previously known message so gaps
        // larger than one page are recovered as well.
        const boundary = messages.size ? Math.max(...messages.keys()) : null;
        let page = loadOlder ? nextPage : 1;
        try {
            while (current()) {
                const result = await config.getMessages(page);
                if (!current() || !checkAccess(result)) return;
                if (!result.ok || !Array.isArray(result.data)) {
                    feedback(historyError, result.data?.error || (config.embedded
                        ? "Could not load messages. Reload the page to try again."
                        : "Could not load messages. Use Refresh to try again."));
                    if (!messages.size) empty.querySelector("h3").textContent = "Messages are unavailable";
                    return;
                }
                addMessages(result.data, { history: true, prepend: loadOlder });
                if (page >= nextPage) {
                    nextPage = page + 1;
                    hasOlder = result.data.length === MESSAGE_PAGE_SIZE;
                }
                if (!messages.size) {
                    empty.querySelector("h3").textContent = "Start the conversation";
                    empty.querySelector("p").textContent = config.emptyDescription;
                }
                if (loadOlder || boundary === null || result.data.length < MESSAGE_PAGE_SIZE
                    || result.data.some(message => Number(message.id) <= boundary)) break;
                page += 1;
            }
        } finally {
            loading = false;
            if (current()) {
                thread.setAttribute("aria-busy", "false");
                if (refresh) refresh.disabled = denied;
                older.disabled = false;
                older.hidden = !hasOlder || denied;
                if (refreshPending) {
                    refreshPending = false;
                    void loadHistory();
                }
            }
        }
    }

    let disconnect = () => {};
    disconnect = config.subscribe({
        onMessage(message) {
            if (current() && !denied) addMessages([message]);
        },
        onStatus(state) {
            if (!current()) return;
            panel.querySelector(".chat-connection-note").hidden = state !== "offline";
        },
        onJoined() { void loadHistory(); },
        onDenied(reason) {
            if (!current()) return;
            if (reason === "unauthorized") navigation.renderLogin("Sign in again to open messages.");
            else denyAccess();
        }
    });
    navigation.onCleanup(() => {
        closed = true;
        disconnect();
    });

    refresh?.addEventListener("click", () => void loadHistory());
    older.addEventListener("click", () => void loadHistory(true));
    jump.addEventListener("click", scrollToLatest);
    thread.addEventListener("scroll", () => {
        if (panel.hidden) return;
        followLatest = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 64;
        if (followLatest) jump.hidden = true;
    });
    input.addEventListener("input", updateComposer);
    input.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            if (!submit.disabled) form.requestSubmit();
        }
    });
    form.addEventListener("submit", async event => {
        event.preventDefault();
        const message = input.value.trim();
        if (!current() || denied || sending || !message || message.length > 2000) return;
        sending = true;
        updateComposer();
        feedback(sendError);
        try {
            const result = await config.sendMessage(message);
            if (!current() || !checkAccess(result)) return;
            if (!result.ok) {
                feedback(sendError, result.status === 0
                    ? "Sending could not be confirmed. Refresh messages before trying again. Your draft has been kept."
                    : result.data.error || "Could not send your message. Your draft has been kept.");
                return;
            }
            addMessages([result.data], { own: true });
            scrollToLatest();
            input.value = "";
        } finally {
            sending = false;
            if (current()) {
                updateComposer();
                if (!panel.hidden && !denied) input.focus();
            }
        }
    });
    void loadHistory();
    return { activate() { if (followLatest) scrollToLatest(); } };
}

function messageRow(message, user) {
    // History uses flat author fields; new messages include an author object.
    const author = message.author || {
        username: message.user_name, first_name: message.first_name, avatar_url: message.avatar_url
    };
    const name = author.first_name || author.username || "Deleted member";
    const own = Number(message.sender_id ?? message.user_id) === Number(user.id);
    const row = document.createElement("article");
    row.className = `chat-message${own ? " chat-message-own" : ""}`;
    row.dataset.messageId = message.id;
    row.innerHTML = `<span class="avatar" aria-hidden="true"><span></span></span>
        <div class="chat-message-content"><header class="chat-message-meta"><strong></strong><span class="chat-you" hidden>You</span><time></time></header><p class="chat-message-body"></p></div>`;
    row.querySelector(".avatar span").textContent = Array.from(name)[0]?.toUpperCase() || "?";
    row.querySelector("strong").textContent = name;
    row.querySelector(".chat-you").hidden = !own;
    row.querySelector(".chat-message-body").textContent = message.message;
    const url = apiAssetUrl(author.avatar_url);
    if (url) {
        const image = document.createElement("img");
        image.alt = "";
        image.src = url;
        image.addEventListener("error", () => image.remove(), { once: true });
        row.querySelector(".avatar").appendChild(image);
    }
    const time = row.querySelector("time");
    // PostgreSQL stores these timestamps in UTC without an offset in the API.
    const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/i.test(message.created_at)
        ? message.created_at : `${message.created_at}Z`;
    const date = new Date(timestamp);
    if (!Number.isNaN(date.getTime())) {
        time.dateTime = date.toISOString();
        time.textContent = new Intl.DateTimeFormat(undefined, {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        }).format(date);
        time.title = date.toLocaleString();
    }
    return row;
}
