<script setup lang="ts">
// A conversation: history, live messages and the composer. Used by the
// workspace chat and by private messages; same behavior as renderChat() in
// frontend/js/views/workspaceChatView.js.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowReactive } from 'vue';
import { useRouter } from 'vue-router';
import type { ApiResult } from '../api/client';
import { MESSAGE_PAGE_SIZE } from '../api/messages';
import type { ChatMessage, MessageAuthor } from '../api/types';
import ProtectedImage from '../components/ProtectedImage.vue';
import { initialOf } from '../domain';
import { useSessionStore } from '../stores/session';
import type { ChatCallbacks } from './subscribe';

export interface ChatConfig {
    /** Shown inside a page that already has its own heading. */
    embedded?: boolean;
    title: string;
    description?: string;
    emptyDescription: string;
    placeholder: string;
    /** Shown when the server says the user may no longer read this conversation. */
    accessError: string;
    getMessages(page: number): Promise<ApiResult<ChatMessage[]>>;
    sendMessage(message: string): Promise<ApiResult<ChatMessage>>;
    subscribe(callbacks: ChatCallbacks): () => void;
    acceptsMessage(message: ChatMessage): boolean;
}

const MAX_LENGTH = 2000;
const timeFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const props = withDefaults(defineProps<{ config: ChatConfig; visible?: boolean }>(), { visible: true });
const emit = defineEmits<{ messagesChanged: [] }>();
const router = useRouter();
const session = useSessionStore();

const thread = ref<HTMLElement | null>(null);
const input = ref<HTMLTextAreaElement | null>(null);
const messages = shallowReactive(new Map<number, ChatMessage>());
const draft = ref('');
const historyError = ref('');
const sendError = ref('');
const emptyTitle = ref('Loading messages…');
const emptyText = ref('Your conversation will appear here.');
const offline = ref(false);
const loading = ref(false);
const sending = ref(false);
const denied = ref(false);
const hasOlder = ref(false);
const jumpVisible = ref(false);
const live = ref<'polite' | 'off'>('polite');
// The first load starts in onMounted: until then the thread is announced as busy.
const threadBusy = ref(true);

let closed = false;
let refreshPending = false;
let nextPage = 1;
let followLatest = true;
let disconnect = () => {};
const current = () => !closed;

// The same message can come from the HTTP answer and from the live event:
// keyed by id, it is shown once. Oldest first.
const ordered = computed(() => [...messages.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at) || a.id - b.id));

function describe(message: ChatMessage) {
    const author: MessageAuthor = message.author ?? {
        username: ('user_name' in message ? message.user_name : null) ?? null,
        first_name: ('first_name' in message ? message.first_name : null) ?? null,
        avatar_url: ('avatar_url' in message ? message.avatar_url : null) ?? null,
    };
    const name = author.first_name || author.username || 'Deleted member';
    const senderId = 'sender_id' in message ? message.sender_id : message.user_id;
    // The API sends these timestamps in UTC, without saying so.
    const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(message.created_at) ? message.created_at : `${message.created_at}Z`);
    const valid = !Number.isNaN(date.getTime());
    return {
        name, avatar: author.avatar_url, own: Number(senderId) === session.user?.id,
        dateTime: valid ? date.toISOString() : undefined,
        time: valid ? timeFormat.format(date) : '',
        fullTime: valid ? date.toLocaleString() : undefined,
    };
}

function scrollToLatest(): void {
    if (thread.value) thread.value.scrollTop = thread.value.scrollHeight;
    followLatest = true;
    jumpVisible.value = false;
}

async function addMessages(items: ChatMessage[], { history = false, prepend = false, own = false } = {}): Promise<void> {
    const height = thread.value?.scrollHeight ?? 0;
    const top = thread.value?.scrollTop ?? 0;
    const fresh = items.filter(message => props.config.acceptsMessage(message) && !messages.has(message.id));
    if (!fresh.length) return;
    // A screen reader announces new messages, not a whole history.
    live.value = history ? 'off' : 'polite';
    for (const message of fresh) messages.set(message.id, message);
    emit('messagesChanged');
    await nextTick();
    if (!thread.value) return;
    // Older messages are added above: keep what the user was reading in place.
    if (prepend) thread.value.scrollTop = top + thread.value.scrollHeight - height;
    else if (own || (followLatest && props.visible)) scrollToLatest();
    else if (!history) jumpVisible.value = true;
    live.value = 'polite';
}

async function toLogin(notice: string): Promise<void> {
    session.expire(notice);
    await router.replace({ name: 'login' });
}

/** false when the answer means the user must leave or may no longer read. */
function checkAccess(result: ApiResult<unknown>): boolean {
    if (result.status === 401) {
        void toLogin('Your session expired. Sign in again to continue.');
        return false;
    }
    if (result.status === 403 || result.status === 404) {
        denyAccess();
        return false;
    }
    return true;
}

function denyAccess(): void {
    denied.value = true;
    disconnect();
    historyError.value = props.config.accessError;
}

async function loadHistory(loadOlder = false): Promise<void> {
    if (!current() || denied.value) return;
    if (loading.value) {
        if (!loadOlder) refreshPending = true;
        return;
    }
    loading.value = true;
    threadBusy.value = true;
    historyError.value = '';
    // After a reconnection, read back to the newest message already known, so
    // gaps larger than one page are recovered as well.
    const boundary = messages.size ? Math.max(...messages.keys()) : null;
    let page = loadOlder ? nextPage : 1;
    try {
        while (current()) {
            const result = await props.config.getMessages(page);
            if (!current() || !checkAccess(result)) return;
            if (!result.ok || !Array.isArray(result.data)) {
                historyError.value = (result.ok ? '' : result.data.error) || (props.config.embedded
                    ? 'Could not load messages. Reload the page to try again.'
                    : 'Could not load messages. Use Refresh to try again.');
                if (!messages.size) emptyTitle.value = 'Messages are unavailable';
                return;
            }
            await addMessages(result.data, { history: true, prepend: loadOlder });
            if (page >= nextPage) {
                nextPage = page + 1;
                hasOlder.value = result.data.length === MESSAGE_PAGE_SIZE;
            }
            if (!messages.size) {
                emptyTitle.value = 'Start the conversation';
                emptyText.value = props.config.emptyDescription;
            }
            if (loadOlder || boundary === null || result.data.length < MESSAGE_PAGE_SIZE
                || result.data.some(message => message.id <= boundary)) break;
            page += 1;
        }
    } finally {
        loading.value = false;
        if (current()) {
            threadBusy.value = false;
            if (refreshPending) {
                refreshPending = false;
                void loadHistory();
            }
        }
    }
}

onMounted(() => {
    disconnect = props.config.subscribe({
        onMessage(message) {
            if (current() && !denied.value) void addMessages([message]);
        },
        onStatus(status) {
            if (current()) offline.value = status === 'offline';
        },
        onJoined() { void loadHistory(); },
        onDenied(reason) {
            if (!current()) return;
            if (reason === 'unauthorized') void toLogin('Sign in again to open messages.');
            else denyAccess();
        },
    });
    void loadHistory();
});

onBeforeUnmount(() => {
    closed = true;
    disconnect();
});

function onScroll(): void {
    if (!props.visible || !thread.value) return;
    followLatest = thread.value.scrollHeight - thread.value.scrollTop - thread.value.clientHeight < 64;
    if (followLatest) jumpVisible.value = false;
}

const canSend = computed(() => !denied.value && !sending.value && draft.value.trim() !== '' && draft.value.length <= MAX_LENGTH);

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (canSend.value) void send();
}

async function send(): Promise<void> {
    const message = draft.value.trim();
    if (!current() || !canSend.value) return;
    sending.value = true;
    sendError.value = '';
    try {
        const result = await props.config.sendMessage(message);
        if (!current() || !checkAccess(result)) return;
        if (!result.ok) {
            // Status 0: the answer was lost, so the message may or may not have been stored.
            sendError.value = result.status === 0
                ? 'Sending could not be confirmed. Refresh messages before trying again. Your draft has been kept.'
                : result.data.error || 'Could not send your message. Your draft has been kept.';
            return;
        }
        await addMessages([result.data], { own: true });
        scrollToLatest();
        draft.value = '';
    } finally {
        sending.value = false;
        if (current()) {
            await nextTick();
            if (props.visible && !denied.value) input.value?.focus();
        }
    }
}

/** Called when the conversation comes back into view. */
defineExpose({ activate: () => { if (followLatest) scrollToLatest(); } });
</script>

<template>
    <div class="workspace-chat">
        <header v-if="!config.embedded" class="chat-header">
            <div><h2>{{ config.title }}</h2><p class="section-description">{{ config.description }}</p></div>
            <div class="chat-tools">
                <button type="button" class="btn-secondary chat-refresh" :disabled="loading || denied" @click="loadHistory()">Refresh</button>
            </div>
        </header>
        <p class="chat-connection-note field-hint" :hidden="!offline">{{ config.embedded ? 'Connection lost. Reload the page to check for new messages.' : 'Live updates are unavailable. Refresh to check for new messages.' }}</p>
        <p class="chat-history-error form-message" role="alert" :hidden="!historyError">{{ historyError }}</p>
        <div ref="thread" class="chat-thread" tabindex="0" aria-label="Message history" :aria-busy="threadBusy" @scroll="onScroll">
            <div class="chat-history-actions"><button type="button" class="btn-quiet chat-older" :hidden="!hasOlder || denied" :disabled="loading" @click="loadHistory(true)">Load older messages</button></div>
            <div class="chat-empty empty-state" :hidden="messages.size > 0"><h3>{{ emptyTitle }}</h3><p>{{ emptyText }}</p></div>
            <div class="chat-messages" role="log" :aria-label="config.title" :aria-live="live" aria-relevant="additions" aria-atomic="false">
                <article
                    v-for="[message, shown] in ordered.map(item => [item, describe(item)] as const)" :key="message.id"
                    class="chat-message" :class="{ 'chat-message-own': shown.own }" :data-message-id="message.id"
                >
                    <span class="avatar" aria-hidden="true"><span>{{ initialOf(shown.name) }}</span><ProtectedImage :path="shown.avatar" /></span>
                    <div class="chat-message-content"><header class="chat-message-meta"><strong>{{ shown.name }}</strong><span class="chat-you" :hidden="!shown.own">You</span><time :datetime="shown.dateTime" :title="shown.fullTime">{{ shown.time }}</time></header><p class="chat-message-body">{{ message.message }}</p></div>
                </article>
            </div>
        </div>
        <button type="button" class="btn-secondary chat-jump" :hidden="!jumpVisible" @click="scrollToLatest">New messages ↓</button>
        <form class="chat-composer" :aria-busy="sending" @submit.prevent="send">
            <label for="chat-message-input">Message</label>
            <textarea id="chat-message-input" ref="input" v-model="draft" name="message" rows="3" :maxlength="MAX_LENGTH" aria-describedby="chat-message-help chat-character-count" required :placeholder="config.placeholder" :disabled="denied" :readonly="sending" @keydown="onKey" />
            <div class="chat-composer-footer">
                <p id="chat-message-help" class="field-hint">Enter to send · Shift + Enter for a new line</p>
                <span id="chat-character-count" class="field-hint">{{ draft.length }} / {{ MAX_LENGTH }}</span>
                <button type="submit" class="btn-primary" :disabled="!canSend">{{ sending ? 'Sending…' : 'Send message' }}</button>
            </div>
            <p class="chat-send-error form-message" role="alert" :hidden="!sendError">{{ sendError }}</p>
        </form>
    </div>
</template>
