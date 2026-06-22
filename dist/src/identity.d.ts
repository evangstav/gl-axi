import { type GitLabContext } from "./context.js";
/** True when the value is already a numeric GitLab user id. */
export declare function looksLikeUserId(value: string): boolean;
/**
 * Resolve a username to a numeric GitLab user id via `GET /users?username=`.
 * GitLab usernames are unique, so this returns at most one id. A numeric input
 * is treated as an id directly (no lookup). The required-approver path needs the
 * numeric id because approval rules are keyed by `user_ids[]`, while plain
 * reviewer assignment (`glab mr update --reviewer`) accepts the username as-is.
 */
export declare function resolveUserId(value: string, ctx: GitLabContext): Promise<number | undefined>;
/**
 * Resolve a reviewer reference to a username. `glab mr update --reviewer` only
 * accepts usernames, but the reviewer surface also accepts a numeric user id, so a
 * numeric input is looked up via `GET /users/:id` to recover its username. A
 * non-numeric input is already a username and is returned as-is (no API call).
 * Returns undefined when a numeric id matches no user.
 */
export declare function resolveUsername(value: string, ctx: GitLabContext): Promise<string | undefined>;
