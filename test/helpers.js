import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../dist/src/cli.js";

// ---------------------------------------------------------------------------
// Test harness: a fake `glab` on PATH that APPENDS each invocation behind a
// marker, so multi-call flows (e.g. checks = MR + approvals, required reviewer
// = update + users lookup + approval_rules) can be asserted call-by-call. A
// fake `git` keeps context resolution offline. Behavior toggles via env:
//   GL_AXI_FAIL            every glab call fails with a two-line stderr
//   GL_AXI_EMPTY           list endpoints return an empty array
//   GL_AXI_USER_NOTFOUND   `users?username=` returns []
// ---------------------------------------------------------------------------
export function makeLogHarness() {
  const dir = mkdtempSync(join(tmpdir(), "gl-axi-test-"));
  const glabLogFile = join(dir, "glab-log.txt");

  writeFileSync(
    join(dir, "git"),
    `#!/bin/sh
case "$1" in
  credential) exit 1 ;;
  remote) exit 1 ;;
  rev-parse) printf 'feature/demo\\n'; exit 0 ;;
esac
exit 1
`,
    { mode: 0o755 },
  );

  writeFileSync(
    join(dir, "glab"),
    `#!/bin/sh
{
  echo "--INVOCATION--"
  printf '%s\\n' "$@"
} >> "$GL_AXI_GLAB_LOG_FILE"

if [ "$GL_AXI_FAIL" = "1" ]; then
  printf '404 Project Not Found\\nsecond line with detail\\n' >&2
  exit 1
fi

# --- glab api (reads + approval-rule writes) -------------------------------
case "$*" in
  *"api"*"/approvals"*)
    printf '{"approved":false,"approvals_required":1,"approvals_left":1,"approved_by":[{"user":{"username":"dev2"}}]}\\n' ;;
  *"api"*"/approval_rules"*)
    printf '{"id":7,"name":"gl-axi: alice","approvals_required":1}\\n' ;;
  *"api"*"users?username="*)
    if [ "$GL_AXI_USER_NOTFOUND" = "1" ]; then
      printf '[]\\n'
    else
      printf '[{"id":501,"username":"alice","name":"Alice Dev"}]\\n'
    fi ;;
  *"api"*"/merge_requests/"*)
    printf '{"iid":42,"title":"Demo MR","state":"opened","source_branch":"feature/demo","target_branch":"main","draft":false,"author":{"username":"dev"},"web_url":"https://gitlab.example/grp/repo/-/merge_requests/42","head_pipeline":{"status":"success"},"reviewers":[{"username":"dev2","name":"Dev Two"}]}\\n' ;;
  *"api"*"/merge_requests"*)
    if [ "$GL_AXI_EMPTY" = "1" ]; then printf '[]\\n'; else
      printf '[{"iid":42,"title":"Demo MR","state":"opened","source_branch":"feature/demo","target_branch":"main","draft":false,"author":{"username":"dev"}}]\\n'
    fi ;;
  *"api"*"/issues/"*)
    printf '{"iid":17,"title":"Demo Issue","state":"opened","author":{"username":"dev"},"assignees":[{"username":"alice"}],"labels":["backend"],"web_url":"https://gitlab.example/grp/repo/-/issues/17"}\\n' ;;
  *"api"*"/issues"*)
    if [ "$GL_AXI_EMPTY" = "1" ]; then printf '[]\\n'; else
      printf '[{"iid":17,"title":"Demo Issue","state":"opened","author":{"username":"dev"},"assignees":[],"labels":[]}]\\n'
    fi ;;
  # --- glab porcelain (mutations) ------------------------------------------
  *"mr create"*)
    printf 'Creating merge request for feature/demo into main\\n!42 Demo MR (https://gitlab.example/grp/repo/-/merge_requests/42)\\n' ;;
  *"mr merge"*)
    printf 'Merging merge request !42\\n' ;;
  *"mr update"*)
    printf 'Updating merge request !42\\n' ;;
  *"issue create"*)
    printf '#17 Demo Issue (https://gitlab.example/grp/repo/-/issues/17)\\n' ;;
  *"issue update"*) printf 'Updating issue #17\\n' ;;
  *"issue close"*) printf 'Closing issue #17\\n' ;;
  *"issue reopen"*) printf 'Reopening issue #17\\n' ;;
  *) printf '{}\\n' ;;
esac
`,
    { mode: 0o755 },
  );

  return {
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      GL_AXI_GLAB_LOG_FILE: glabLogFile,
      GITLAB_TOKEN: "dummy",
    },
    glabLogFile,
  };
}

export async function runCli(args, extraEnv = {}) {
  return runWith(makeLogHarness, args, extraEnv, (h) => ({
    glabLogFile: h.glabLogFile,
  }));
}

/** Split the glab log into invocations, each an array of its argv lines. */
export function readInvocations(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return []; // glab was never invoked, so the log file does not exist
  }
  return text
    .split("--INVOCATION--")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split("\n"));
}

/** Value following `flag` within a single invocation's argv. */
export function argValue(inv, flag) {
  const i = inv.indexOf(flag);
  return i >= 0 && i + 1 < inv.length ? inv[i + 1] : undefined;
}

export function combinedOutput(result) {
  return `${result.stdout}${result.stderr ?? ""}`;
}

// Shared runner: swaps process.env for the harness, captures stdout, restores.
async function runWith(harnessFactory, args, extraEnv, extract) {
  const harness = harnessFactory();
  const originalEnv = process.env;
  const originalExitCode = process.exitCode;
  let stdout = "";

  process.env = { ...harness.env, ...extraEnv };
  process.exitCode = undefined;

  try {
    await main(args, {
      write: (chunk) => {
        stdout += String(chunk);
        return true;
      },
    });
    return {
      status: process.exitCode ?? 0,
      stdout,
      stderr: "",
      ...extract(harness),
    };
  } finally {
    process.env = originalEnv;
    process.exitCode = originalExitCode;
  }
}
