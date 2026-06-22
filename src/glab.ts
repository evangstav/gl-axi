import { execFile } from "node:child_process";
import { type GitLabContext } from "./context.js";
import { AxiError, glabNotInstalledError, mapGlabError } from "./errors.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB

function run(args: string[], ctx: GitLabContext): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      "glab",
      args,
      {
        maxBuffer: MAX_BUFFER_BYTES,
        // glab reads the host + token from these env vars, so the token never
        // touches argv. Mirrors how azp/ado-axi pass AZURE_DEVOPS_EXT_PAT.
        env: {
          ...process.env,
          GITLAB_HOST: ctx.host,
          GITLAB_TOKEN: ctx.token,
        },
      },
      (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          resolve({ stdout: "", stderr: "ENOENT", exitCode: 127 });
          return;
        }
        const code = error
          ? ((error as Error & { code?: string | number }).code ?? 1)
          : 0;
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          exitCode: typeof code === "number" ? code : 1,
        });
      },
    );
  });
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
export async function glabApi<T = unknown>(
  endpoint: string,
  ctx: GitLabContext,
  opts: ApiOptions = {},
): Promise<T> {
  const args = ["api", "--hostname", ctx.host];
  if (opts.method) args.push("-X", opts.method);
  for (const [key, value] of opts.fields ?? []) {
    args.push("-F", `${key}=${value}`);
  }
  args.push(endpoint);

  const result = await run(args, ctx);
  if (result.stderr === "ENOENT") throw glabNotInstalledError();
  if (result.exitCode !== 0) {
    throw mapGlabError(result.stderr || result.stdout, result.exitCode);
  }
  const body = result.stdout.trim();
  if (!body) return undefined as T;
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new AxiError(
      `Unexpected glab api output: ${body.slice(0, 200)}`,
      "UNKNOWN",
    );
  }
}

/**
 * Run a `glab` porcelain command (e.g. `mr create`, `mr merge`) and return raw
 * stdout. Used for mutations where glab's porcelain owns branch/prompt handling;
 * the resulting id/URL is parsed from stdout by the caller.
 */
export async function glabExec(
  args: string[],
  ctx: GitLabContext,
): Promise<string> {
  const result = await run(args, ctx);
  if (result.stderr === "ENOENT") throw glabNotInstalledError();
  if (result.exitCode !== 0) {
    throw mapGlabError(result.stderr || result.stdout, result.exitCode);
  }
  // glab prints progress to stderr and the created object's URL to stdout; some
  // builds mix them, so hand back both for URL/id extraction.
  return `${result.stdout}\n${result.stderr}`;
}

/** URL-encode a full project path for use as the `:id` in a REST endpoint. */
export function encodeProject(projectPath: string): string {
  return encodeURIComponent(projectPath);
}
