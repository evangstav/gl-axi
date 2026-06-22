import { AxiError, exitCodeForError } from "axi-sdk-js";
export { AxiError, exitCodeForError };
const patterns = [
    {
        // glab surfaces a missing project as "404 Project Not Found".
        pattern: /404 Project Not Found|project not found/i,
        code: "REPO_NOT_FOUND",
        message: () => "Project not found, or the token lacks access to it",
        suggestions: () => [
            "Confirm the project path (namespace/repo) and host",
            "Check the token has api/read_repository scope for this project",
        ],
    },
    {
        pattern: /merge request.*?!?(\d+).*?not found|404 MergeRequest Not Found/i,
        code: "NOT_FOUND",
        message: (m) => m[1] ? `Merge request !${m[1]} does not exist` : "Merge request not found",
    },
    {
        pattern: /404 Issue Not Found|issue.*?#?(\d+).*?not found/i,
        code: "NOT_FOUND",
        message: (m) => m[1] ? `Issue #${m[1]} does not exist` : "Issue not found",
    },
    {
        // `401` is word-bounded so it matches an HTTP 401 but not codes that merely
        // contain the digits "401".
        pattern: /\b401\b|401 Unauthorized|requires authentication|invalid[_ ]token|token is (?:invalid|expired|revoked)|GITLAB_TOKEN/i,
        code: "AUTH_REQUIRED",
        message: () => "GitLab auth failed — token missing, expired, or wrong scope",
        suggestions: () => [
            "Refresh the token in the git credential helper for this host",
            "Ensure the token has the scopes the operation needs (api, read/write_repository)",
        ],
    },
    {
        pattern: /\b403\b|Forbidden|insufficient[_ ]scope|not allowed/i,
        code: "FORBIDDEN",
        message: () => "Insufficient permissions for this action",
    },
    {
        pattern: /409 Conflict|already exists|merge request already exists/i,
        code: "VALIDATION_ERROR",
        message: () => "Conflict — a matching merge request may already exist for this branch",
        suggestions: () => ["Run `gl-axi mr list` to find it"],
    },
];
function firstErrorLine(stderr) {
    return (redactSensitive(stderr)
        .trim()
        .split("\n")
        .find((l) => l.trim().length > 0) ?? "");
}
function errorExcerpt(stderr) {
    const excerpt = redactSensitive(stderr)
        .trim()
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 4)
        .join("\n");
    return excerpt.length > 500 ? `${excerpt.slice(0, 500)}...` : excerpt;
}
function redactSensitive(value) {
    return value.replace(/\b(password|token|GITLAB_TOKEN|private[_-]token|PRIVATE-TOKEN)[=:]\s*\S+/gi, "$1=[redacted]");
}
export function mapGlabError(stderr, exitCode) {
    for (const { pattern, code, message, suggestions } of patterns) {
        const match = stderr.match(pattern);
        if (match) {
            return new AxiError(message(match, stderr), code, suggestions?.(match) ?? []);
        }
    }
    if (/not found|404/i.test(stderr)) {
        return new AxiError(firstErrorLine(stderr), "NOT_FOUND");
    }
    return new AxiError(errorExcerpt(stderr) || `glab exited with code ${exitCode}`, "UNKNOWN");
}
export function glabNotInstalledError() {
    return new AxiError("glab CLI is not installed — see https://gitlab.com/gitlab-org/cli", "GLAB_NOT_INSTALLED");
}
//# sourceMappingURL=errors.js.map