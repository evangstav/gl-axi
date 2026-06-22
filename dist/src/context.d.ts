export interface GitLabContext {
    /** GitLab hostname, e.g. gitlab.swpd or gitlab.com */
    host: string;
    /** Base web/API URL, e.g. https://gitlab.swpd */
    baseUrl: string;
    /** Full project path (namespace + repo), e.g. genai-data-intelligence/taxis */
    projectPath: string;
    /** Namespace (everything before the last path segment), e.g. genai-data-intelligence */
    namespace: string;
    /** Repository (last path segment), e.g. taxis */
    repo: string;
    /** API token, pulled from the git credential helper */
    token: string;
    /** How the project path was resolved */
    source: "flag" | "env" | "git";
}
/**
 * Outcome of context resolution. Resolution has two distinct failure modes — an
 * unresolvable project path vs. a missing token — that need different guidance, so
 * they are reported separately instead of collapsing into a single `undefined`.
 */
export type ContextResolution = {
    ok: true;
    context: GitLabContext;
} | {
    ok: false;
    reason: "no-project";
} | {
    ok: false;
    reason: "no-token";
    host: string;
};
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
export declare function resolveContext(flagValue?: string): ContextResolution;
/**
 * Narrow a resolution to a usable context, or throw a failure-specific error. A
 * missing project points the user at the repo path; a missing token points at the
 * credential helper (the least obvious part of resolution) rather than the repo.
 */
export declare function requireContext(resolution: ContextResolution | undefined): GitLabContext;
interface Origin {
    host: string;
    projectPath: string;
}
/**
 * Parse a GitLab remote URL into host + full project path. Handles the common forms:
 *   https://{host}[:port]/{group}/.../{repo}.git
 *   https://{user}@{host}[:port]/{group}/.../{repo}.git
 *   ssh://git@{host}[:port]/{group}/.../{repo}.git
 *   git@{host}:{group}/.../{repo}.git
 * The project path may have multiple segments (GitLab subgroups).
 *
 * An explicit HTTPS port is part of the API host and is preserved (a self-managed
 * instance may serve the API on e.g. :8443). An SSH port is the SSH port, not the
 * HTTPS API port, so it is dropped — the API is reached over HTTPS on the host.
 */
export declare function parseRemoteUrl(url: string): Origin | undefined;
export {};
