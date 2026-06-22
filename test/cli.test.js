import assert from "node:assert/strict";
import test from "node:test";
import { runCli, readInvocations, combinedOutput } from "./helpers.js";

const R = ["-R", "grp/repo"];

test("supports -R before the command as documented", async () => {
  const result = await runCli(["-R", "grp/repo", "mr", "show", "42"]);

  assert.equal(result.status, 0, combinedOutput(result));
  const [show] = readInvocations(result.glabLogFile);
  assert.deepEqual(show.slice(0, 2), ["api", "--hostname"]);
  assert.equal(
    show.some((a) => a.endsWith("/merge_requests/42")),
    true,
    JSON.stringify(show),
  );
});

test("unknown setup commands fail validation", async () => {
  const result = await runCli(["setup", "nope"]);

  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /Unknown setup command: nope/);
  assert.match(result.stdout, /VALIDATION_ERROR/);
});

test("glab failures surface a structured, actionable error", async () => {
  const result = await runCli(["mr", "show", "42", ...R], { GL_AXI_FAIL: "1" });

  assert.notEqual(result.status, 0);
  // 404 Project Not Found maps to a structured REPO_NOT_FOUND message.
  assert.match(combinedOutput(result), /Project not found/);
  assert.match(combinedOutput(result), /REPO_NOT_FOUND/);
});

test("a resolved project with no token points at the credential helper", async () => {
  // Project resolves via -R, but no token (git credential fake fails, GITLAB_TOKEN cleared).
  const result = await runCli(["mr", "list", ...R], { GITLAB_TOKEN: "" });

  assert.notEqual(result.status, 0);
  assert.match(combinedOutput(result), /AUTH_REQUIRED/);
  assert.match(combinedOutput(result), /credential helper/);
  // It must NOT mis-blame the repo path when the token is what's missing.
  assert.doesNotMatch(combinedOutput(result), /No GitLab project/);
});

test("no project and no token reports the project failure, not the token", async () => {
  // No -R, fake git has no origin → project can't resolve before the token is checked.
  const result = await runCli(["mr", "list"], { GITLAB_TOKEN: "" });

  assert.notEqual(result.status, 0);
  assert.match(combinedOutput(result), /No GitLab project/);
});

test("unknown top-level commands are rejected", async () => {
  const result = await runCli(["bogus"]);
  assert.notEqual(result.status, 0);
});

test("mr --help renders the mr usage block", async () => {
  const result = await runCli(["mr", "--help"]);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /usage: gl-axi mr <subcommand>/);
});

test("issue --help renders the issue usage block", async () => {
  const result = await runCli(["issue", "--help"]);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /usage: gl-axi issue <subcommand>/);
});

test("mr rejects an unknown subcommand", async () => {
  const result = await runCli(["mr", "frob", ...R]);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /Unknown subcommand: frob/);
});
