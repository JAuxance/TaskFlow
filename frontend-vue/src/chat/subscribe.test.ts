import { expect, it } from 'vitest';
import { isDirectConversation } from './subscribe';

it('accepts a private message in either direction between the two users', () => {
    expect(isDirectConversation({ sender_id: 1, receiver_id: 2 }, 1, 2)).toBe(true);
    expect(isDirectConversation({ sender_id: 2, receiver_id: 1 }, 1, 2)).toBe(true);
});

it('refuses a message that involves anyone else', () => {
    expect(isDirectConversation({ sender_id: 1, receiver_id: 3 }, 1, 2)).toBe(false);
    expect(isDirectConversation({ sender_id: 3, receiver_id: 2 }, 1, 2)).toBe(false);
    expect(isDirectConversation({ sender_id: 3, receiver_id: 4 }, 1, 2)).toBe(false);
});
