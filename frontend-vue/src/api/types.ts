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
