import { glabApi } from "./glab.js";
/** True when the value is already a numeric GitLab user id. */
export function looksLikeUserId(value) {
    return /^\d+$/.test(value.trim());
}
/**
 * Resolve a username to a numeric GitLab user id via `GET /users?username=`.
 * GitLab usernames are unique, so this returns at most one id. A numeric input
 * is treated as an id directly (no lookup). The required-approver path needs the
 * numeric id because approval rules are keyed by `user_ids[]`, while plain
 * reviewer assignment (`glab mr update --reviewer`) accepts the username as-is.
 */
export async function resolveUserId(value, ctx) {
    const trimmed = value.trim();
    if (looksLikeUserId(trimmed))
        return Number(trimmed);
    const users = await glabApi(`users?username=${encodeURIComponent(trimmed)}`, ctx);
    if (!Array.isArray(users) || users.length === 0)
        return undefined;
    return users[0].id;
}
//# sourceMappingURL=identity.js.map