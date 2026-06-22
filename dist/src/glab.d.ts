import { type GitLabContext } from "./context.js";
export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
export interface ApiOptions {
    /** HTTP method; defaults to GET (or POST when fields are present, per glab). */
    method?: "GET" | "POST" | "PUT" | "DELETE";
    /** `--field key=value` parameters (glab infers JSON types). */
    fields?: [string, string][];
}
/**
 * Hit the GitLab REST API through `glab api` and return parsed JSON. This is the
 * GitLab analogue of `az ... -o json`: glab's porcelain (`mr list`, `mr view`,
 * `issue list`) does not emit JSON, but `glab api` returns the raw API response,
 * which projects cleanly into TOON. The project is addressed by its URL-encoded
 * full path, so the result never depends on glab's own cwd resolution.
 */
export declare function glabApi<T = unknown>(endpoint: string, ctx: GitLabContext, opts?: ApiOptions): Promise<T>;
/**
 * Run a `glab` porcelain command (e.g. `mr create`, `mr merge`) and return raw
 * stdout. Used for mutations where glab's porcelain owns branch/prompt handling;
 * the resulting id/URL is parsed from stdout by the caller.
 */
export declare function glabExec(args: string[], ctx: GitLabContext): Promise<string>;
/** GitLab caps `per_page` at 100; larger requests are silently truncated to it. */
export declare const GITLAB_MAX_PER_PAGE = 100;
/**
 * Fetch up to `limit` rows from a list endpoint, paginating past GitLab's 100-row
 * `per_page` cap so a `--top 250` honestly returns 250 (when they exist) instead of
 * silently stopping at 100. `path` is the endpoint without `per_page`/`page`; extra
 * query params belong in `params`.
 */
export declare function glabApiList<T = unknown>(path: string, params: URLSearchParams, ctx: GitLabContext, limit: number): Promise<T[]>;
/** URL-encode a full project path for use as the `:id` in a REST endpoint. */
export declare function encodeProject(projectPath: string): string;
