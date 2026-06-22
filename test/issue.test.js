import assert from "node:assert/strict";
import test from "node:test";
import { runCli, readInvocations, argValue } from "./helpers.js";

const R = ["-R", "grp/repo"];

// --- create ----------------------------------------------------------------

test("issue create builds the porcelain command and parses the new iid", async () => {
  const result = await runCli([
    "issue", "create",
    "--title", "Wire up gate",
    "--description", "body",
    "--assignee", "alice",
    "--label", "backend,urgent",
    ...R,
  ]);

  assert.equal(result.status, 0, result.stdout);
  const [create] = readInvocations(result.glabLogFile);
  assert.deepEqual(create.slice(0, 4), ["issue", "create", "-R", "grp/repo"]);
  assert.equal(argValue(create, "--title"), "Wire up gate");
  assert.equal(argValue(create, "--description"), "body");
  assert.equal(argValue(create, "--assignee"), "alice");
  assert.equal(argValue(create, "--label"), "backend,urgent");
  assert.equal(create.includes("--yes"), true);
  assert.match(result.stdout, /created:/);
  assert.match(result.stdout, /id: 17/);
  assert.match(result.stdout, /issues\/17/);
});

test("issue create requires --title", async () => {
  const result = await runCli(["issue", "create", ...R]);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /--title is required/);
});

// --- update ----------------------------------------------------------------

test("issue update maps field flags then re-fetches the issue", async () => {
  const result = await runCli([
    "issue", "update", "17",
    "--title", "New title",
    "--assignee", "bob",
    "--label", "ux",
    ...R,
  ]);

  assert.equal(result.status, 0, result.stdout);
  const invs = readInvocations(result.glabLogFile);
  // update porcelain + a show via api.
  assert.deepEqual(invs[0].slice(0, 3), ["issue", "update", "17"]);
  assert.equal(argValue(invs[0], "--title"), "New title");
  assert.equal(argValue(invs[0], "--assignee"), "bob");
  assert.equal(argValue(invs[0], "--label"), "ux");
  assert.equal(invs[invs.length - 1][invs[invs.length - 1].length - 1], "projects/grp%2Frepo/issues/17");
  assert.match(result.stdout, /updated:/);
});

test("issue update --state closed routes to issue close", async () => {
  const result = await runCli(["issue", "update", "17", "--state", "closed", ...R]);

  assert.equal(result.status, 0, result.stdout);
  const invs = readInvocations(result.glabLogFile);
  // No field change → no `issue update`; a close transition then a re-fetch.
  assert.equal(invs.some((i) => i[0] === "issue" && i[1] === "update"), false);
  assert.deepEqual(invs[0].slice(0, 3), ["issue", "close", "17"]);
});

test("issue update --state opened routes to issue reopen", async () => {
  const result = await runCli(["issue", "update", "17", "--state", "opened", ...R]);
  const invs = readInvocations(result.glabLogFile);
  assert.deepEqual(invs[0].slice(0, 3), ["issue", "reopen", "17"]);
});

test("issue update with a field change and a state change runs both", async () => {
  const result = await runCli(["issue", "update", "17", "--title", "T", "--state", "closed", ...R]);

  assert.equal(result.status, 0, result.stdout);
  const invs = readInvocations(result.glabLogFile);
  assert.equal(invs[0][1], "update");
  assert.deepEqual(invs[1].slice(0, 3), ["issue", "close", "17"]);
});

test("issue update rejects an invalid --state", async () => {
  const result = await runCli(["issue", "update", "17", "--state", "frozen", ...R]);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /--state must be opened or closed/);
});

test("issue update with no changes is rejected before any glab call", async () => {
  const result = await runCli(["issue", "update", "17", ...R]);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /Nothing to update/);
  assert.equal(readInvocations(result.glabLogFile).length, 0);
});

// --- show ------------------------------------------------------------------

test("issue show projects id/title/state/assignees/labels", async () => {
  const result = await runCli(["issue", "show", "17", ...R]);

  assert.equal(result.status, 0, result.stdout);
  const [show] = readInvocations(result.glabLogFile);
  assert.equal(show[show.length - 1], "projects/grp%2Frepo/issues/17");
  assert.match(result.stdout, /issue:/);
  assert.match(result.stdout, /title: Demo Issue/);
  assert.match(result.stdout, /state: opened/);
});

// --- list ------------------------------------------------------------------

test("issue list builds an api query from --state/--assignee/--author/--label", async () => {
  const result = await runCli(
    ["issue", "list", "--state", "closed", "--assignee", "alice", "--author", "bob", "--label", "backend", "--top", "7", ...R],
  );

  assert.equal(result.status, 0, result.stdout);
  const [list] = readInvocations(result.glabLogFile);
  const endpoint = list[list.length - 1];
  assert.match(endpoint, /^projects\/grp%2Frepo\/issues\?/);
  assert.match(endpoint, /state=closed/);
  assert.match(endpoint, /assignee_username=alice/);
  assert.match(endpoint, /author_username=bob/);
  assert.match(endpoint, /labels=backend/);
  assert.match(endpoint, /per_page=7/);
  assert.match(result.stdout, /issues: 1/);
});

test("issue list handles an empty result set", async () => {
  const result = await runCli(["issue", "list", ...R], { GL_AXI_EMPTY: "1" });
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /issues: 0/);
});

test("issue rejects an unknown subcommand", async () => {
  const result = await runCli(["issue", "frob", ...R]);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /Unknown subcommand: frob/);
});
