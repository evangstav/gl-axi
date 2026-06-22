import { execFileSync } from "node:child_process";
/**
 * Resolve the GitLab host/project and an API token.
 *
 * Project path priority: --repo/-R flag (namespace/repo) > GL_REPO env > git origin.
 * Host priority: GITLAB_HOST env > git origin host > gitlab.com.
 * The token is read from the git credential helper for the host base URL — the same
 * `credential.helper store` mechanism the taxis checkout uses (`git credential fill`
 * → password). This keeps the token out of argv/env files and lets gl-axi run as a
 * standalone binary; `GITLAB_TOKEN` is honored only as a fallback.
 */
export function resolveContext(flagValue) {
    const origin = readOrigin();
    const resolved = resolveProjectPath(flagValue, origin);
    if (!resolved)
        return undefined;
    const { projectPath, source } = resolved;
    const host = process.env["GITLAB_HOST"]?.trim() || origin?.host || "gitlab.com";
    const baseUrl = `https://${host}`;
    const token = readToken(baseUrl);
    if (!token)
        return undefined;
    const segments = projectPath.split("/").filter(Boolean);
    const repo = segments[segments.length - 1];
    const namespace = segments.slice(0, -1).join("/");
    return { host, baseUrl, projectPath, namespace, repo, token, source };
}
function resolveProjectPath(flagValue, origin) {
    const flagPath = normalizePath(flagValue);
    if (flagPath)
        return { projectPath: flagPath, source: "flag" };
    const envPath = normalizePath(process.env["GL_REPO"]);
    if (envPath)
        return { projectPath: envPath, source: "env" };
    if (origin)
        return { projectPath: origin.projectPath, source: "git" };
    return undefined;
}
/** A valid project path has at least two segments (namespace/repo). */
function normalizePath(value) {
    if (!value)
        return undefined;
    const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
    const segments = trimmed.split("/").filter(Boolean);
    if (segments.length < 2)
        return undefined;
    return segments.join("/");
}
function readOrigin() {
    try {
        const url = execFileSync("git", ["remote", "get-url", "origin"], {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return parseRemoteUrl(url);
    }
    catch {
        return undefined;
    }
}
/**
 * Parse a GitLab remote URL into host + full project path. Handles the common forms:
 *   https://{host}/{group}/.../{repo}.git
 *   https://{user}@{host}/{group}/.../{repo}.git
 *   ssh://git@{host}[:port]/{group}/.../{repo}.git
 *   git@{host}:{group}/.../{repo}.git
 * The project path may have multiple segments (GitLab subgroups).
 */
export function parseRemoteUrl(url) {
    const trimmed = url.trim();
    // https:// or ssh:// forms.
    const urlForm = trimmed.match(/^(?:https?|ssh):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/);
    if (urlForm) {
        const projectPath = stripPath(urlForm[2]);
        if (projectPath)
            return { host: urlForm[1], projectPath };
    }
    // scp-like form: git@host:group/repo.git
    const scpForm = trimmed.match(/^(?:[^@]+@)?([^/:]+):(.+?)(?:\.git)?\/?$/);
    if (scpForm) {
        const projectPath = stripPath(scpForm[2]);
        if (projectPath)
            return { host: scpForm[1], projectPath };
    }
    return undefined;
}
function stripPath(path) {
    const segments = path
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .filter(Boolean)
        .map((s) => decodeURIComponent(s));
    if (segments.length < 2)
        return undefined;
    return segments.join("/");
}
/** Pull the token from the git credential helper for the host base URL. */
function readToken(baseUrl) {
    try {
        const out = execFileSync("git", ["credential", "fill"], {
            input: `url=${baseUrl}\n\n`,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "ignore"],
        });
        for (const line of out.split("\n")) {
            if (line.startsWith("password=")) {
                const token = line.slice("password=".length).trim();
                if (token)
                    return token;
            }
        }
    }
    catch {
        /* fall through */
    }
    return process.env["GITLAB_TOKEN"]?.trim() || undefined;
}
//# sourceMappingURL=context.js.map