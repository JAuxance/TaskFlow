// Shapes returned by the Flask API (docs/api.md). Types are added with the
// screen that first needs them, checked against the route that returns them.

/** Current user profile: GET /api/auth/me and the profile mutations. */
export interface User {
    id: number;
    username: string;
    email: string;
    first_name: string | null;
    avatar_url: string | null;
}

/** POST /api/auth/login. The full profile is read afterwards from /api/auth/me. */
export interface Account {
    id: number;
    username: string;
    email: string;
}

/** POST /api/users. */
export interface RegisteredAccount extends Account {
    created_at: string;
}

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

/** GET /api/workspaces and /api/workspaces/{id}. */
export interface Workspace {
    id: number;
    owner_id: number;
    name: string;
    created_at: string;
    icon_type: string | null;
    icon_value: string | null;
    color: string | null;
}

/** GET /api/workspaces/{id}/members. */
export interface WorkspaceMember {
    id: number;
    workspace_id: number;
    user_id: number;
    role: WorkspaceRole;
    created_at: string;
    user_name: string;
    avatar_url: string | null;
}

/** GET /api/workspaces/{id}/projects and /api/projects/{id}. */
export interface Project {
    id: number;
    workspace_id: number;
    name: string;
    description: string | null;
    created_at: string;
}

/** GET /api/projects/{id}/tasks and /api/tasks/{id}. */
export interface Task {
    id: number;
    project_id: number;
    creator_id: number | null;
    assignee_id: number | null;
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    due_date: string | null;
    color: string | null;
}

/** GET /api/users/me/deletion-preview. */
export interface DeletionPreview {
    can_delete: boolean;
    /** Workspaces the user owns with other members: they block the deletion. */
    blocked_workspaces: { id: number; name: string; other_members: number }[];
    /** Workspaces the user is alone in: deleted with the account. */
    workspaces_to_delete: { id: number; name: string }[];
    counts: {
        sessions: number;
        direct_messages: number;
        images: number;
        projects: number;
        tasks: number;
        workspace_messages: number;
        retained_tasks: number;
        retained_messages: number;
    };
}
