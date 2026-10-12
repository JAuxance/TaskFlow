import { apiRequest } from './client';
import type { DeletionPreview, User } from './types';

const json = (body: unknown) => ({
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

/** An empty name clears the optional first name. */
export function updateFirstName(firstName: string) {
    return apiRequest<User>('/api/users/me', { method: 'PATCH', ...json({ first_name: firstName }) });
}

export function uploadAvatar(file: File) {
    const body = new FormData();
    body.append('avatar', file);
    // No content type here: the browser adds the multipart boundary itself.
    return apiRequest<User>('/api/users/me/avatar', { method: 'POST', body });
}

export function removeAvatar() {
    return apiRequest<User>('/api/users/me/avatar', { method: 'DELETE' });
}

/** Everything the server holds about the user, after checking their password. */
export function exportMyData(password: string) {
    return apiRequest<Record<string, unknown>>('/api/users/me/data-export', { method: 'POST', ...json({ password }) });
}

export function getDeletionPreview() {
    return apiRequest<DeletionPreview>('/api/users/me/deletion-preview');
}

export function deleteAccount(password: string, confirmedWorkspaceIds: number[]) {
    // A 401 here means the account or its session is already gone: the caller treats it as done.
    return apiRequest<{ message: string }>('/api/users/me', {
        method: 'DELETE', allowUnauthorized: true, ...json({ password, confirmed_workspace_ids: confirmedWorkspaceIds }),
    });
}

/** Public address for data requests, or null when the server has none configured. */
export function getPrivacyContact() {
    return apiRequest<{ contact_email: string | null }>('/api/privacy');
}
