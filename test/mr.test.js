import assert from "node:assert/strict";
import test from "node:test";
import { runCli, readInvocations, argValue } from "./helpers.js";

const R = ["-R", "grp/repo"];

// --- list ------------------------------------------------------------------

test("mr list builds an api query with state and per_page", async () => {
  const result = await runCli(["mr", "list", ...R]);

  assert.equal(result.status, 0, result.stdout);
  const [list] = readInvocations(result.glabLogFile);
  assert.equal(list[0], "api");
  const endpoint = list[list.length - 1];
  assert.match(endpoint, /^projects\/grp%2Frepo\/merge_requests\?/);
  assert.match(endpoint, /state=opened/);
  assert.match(endpoint, /per_page=30/);
  assert.match(result.stdout, /merge_requests: 1/);
  // TOON renders the list as a columnar table keyed by the projected fields.
  assert.match(result.stdout, /merge_requests\[1\]\{id,title,state/);
  assert.match(result.stdout, /42,Demo MR,opened/);
});

test("mr list maps --state/--author/--source/--target/--top into the query", async () => {
  const result = await runCli(
    ["mr", "list", "--state", "merged", "--author", "alice", "--source", "feat", "--target", "main", "--top", "5", ...R],
  );

  const [list] = readInvocations(result.glabLogFile);
  const endpoint = list[list.length - 1];
  assert.match(endpoint, /state=merged/);
  assert.match(endpoint, /author_username=alice/);
  assert.match(endpoint, /source_branch=feat/);
  assert.match(endpoint, /target_branch=main/);
  assert.match(endpoint, /per_page=5/);
});

test("mr list handles an empty result set with a count and no rows", async () => {
  const result = await runCli(["mr", "list", ...R], { GL_AXI_EMPTY: "1" });
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /merge_requests: 0/);
});

// --- show ------------------------------------------------------------------

test("mr show fetches the MR by iid and projects a summary", async () => {
  const result = await runCli(["mr", "show", "42", ...R]);

  assert.equal(result.status, 0, result.stdout);
  const [show] = readInvocations(result.glabLogFile);
  assert.equal(show[show.length - 1], "projects/grp%2Frepo/merge_requests/42");
  assert.match(result.stdout, /merge_request:/);
  assert.match(result.stdout, /source: feature\/demo/);
  assert.match(result.stdout, /target: main/);
});

test("mr show requires a numeric id", async () => {
  const result = await runCli(["mr", "show", ...R]);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /merge request id is required/);
});

// --- create ----------------------------------------------------------------

test("mr create builds the porcelain command and parses the new iid", async () => {
  const result = await runCli([
    "mr", "create",
    "--source", "feature/x",
    "--target", "develop",
    "--title", "Add gate",
    "--description", "body",
    "--draft",
    "--remove-source-branch",
    ...R,
  ]);

  assert.equal(result.status, 0, result.stdout);
  const [create] = readInvocations(result.glabLogFile);
  assert.deepEqual(create.slice(0, 4), ["mr", "create", "-R", "grp/repo"]);
  assert.equal(argValue(create, "--source-branch"), "feature/x");
  assert.equal(argValue(create, "--target-branch"), "develop");
  assert.equal(argValue(create, "--title"), "Add gate");
  assert.equal(argValue(create, "--description"), "body");
  assert.equal(create.includes("--draft"), true);
  assert.equal(create.includes("--remove-source-branch"), true);
  assert.equal(create.includes("--yes"), true);
  assert.match(result.stdout, /created:/);
  assert.match(result.stdout, /id: 42/);
  assert.match(result.stdout, /merge_requests\/42/);
});

test("mr create defaults source to current branch and target to main", async () => {
  const result = await runCli(["mr", "create", "--title", "T", ...R]);

  assert.equal(result.status, 0, result.stdout);
  const [create] = readInvocations(result.glabLogFile);
  assert.equal(argValue(create, "--source-branch"), "feature/demo");
  assert.equal(argValue(create, "--target-branch"), "main");
  // A description is always supplied so glab never opens an editor.
  assert.equal(create.includes("--description"), true);
});

// --- merge -----------------------------------------------------------------

test("mr merge passes squash and remove-source-branch with --yes", async () => {
  const result = await runCli(["mr", "merge", "42", "--squash", "--remove-source-branch", ...R]);

  assert.equal(result.status, 0, result.stdout);
  const [merge] = readInvocations(result.glabLogFile);
  assert.deepEqual(merge.slice(0, 5), ["mr", "merge", "42", "-R", "grp/repo"]);
  assert.equal(merge.includes("--squash"), true);
  assert.equal(merge.includes("--remove-source-branch"), true);
  assert.equal(merge.includes("--yes"), true);
  assert.match(result.stdout, /merged:/);
});

test("mr merge omits squash when not requested", async () => {
  const result = await runCli(["mr", "merge", "42", ...R]);
  const [merge] = readInvocations(result.glabLogFile);
  assert.equal(merge.includes("--squash"), false);
});

// --- checks ----------------------------------------------------------------

test("mr checks folds pipeline + approvals into a single verdict", async () => {
  const result = await runCli(["mr", "checks", "42", ...R]);

  assert.equal(result.status, 0, result.stdout);
  const invs = readInvocations(result.glabLogFile);
  assert.equal(invs.length, 2, JSON.stringify(invs));
  assert.equal(invs[0][invs[0].length - 1], "projects/grp%2Frepo/merge_requests/42");
  assert.equal(invs[1][invs[1].length - 1], "projects/grp%2Frepo/merge_requests/42/approvals");
  // pipeline success but approvals_left=1 → pending.
  assert.match(result.stdout, /verdict: pending/);
  assert.match(result.stdout, /pipeline: success/);
  assert.match(result.stdout, /approvals_left: 1/);
});

// --- reviewer --------------------------------------------------------------

test("reviewer add sets a reviewer via mr update with a + prefix", async () => {
  const result = await runCli(["mr", "reviewer", "add", "42", "--reviewer", "alice", ...R]);

  assert.equal(result.status, 0, result.stdout);
  const invs = readInvocations(result.glabLogFile);
  assert.equal(invs.length, 1, JSON.stringify(invs));
  assert.deepEqual(invs[0].slice(0, 3), ["mr", "update", "42"]);
  assert.equal(argValue(invs[0], "--reviewer"), "+alice");
  assert.match(result.stdout, /reviewer_added:/);
  assert.match(result.stdout, /required: false/);
});

test("reviewer add --required resolves the user id and creates an approval rule", async () => {
  const result = await runCli(["mr", "reviewer", "add", "42", "--reviewer", "alice", "--required", ...R]);

  assert.equal(result.status, 0, result.stdout);
  const invs = readInvocations(result.glabLogFile);
  // 1) mr update reviewer, 2) users?username lookup, 3) approval_rules POST.
  assert.equal(invs.length, 3, JSON.stringify(invs));
  assert.deepEqual(invs[0].slice(0, 3), ["mr", "update", "42"]);
  assert.match(invs[1][invs[1].length - 1], /users\?username=alice/);
  const rule = invs[2];
  assert.equal(rule.includes("-X"), true);
  assert.equal(rule[rule.indexOf("-X") + 1], "POST");
  assert.equal(rule.some((a) => a === "user_ids[]=501"), true, JSON.stringify(rule));
  assert.equal(rule.some((a) => a === "approvals_required=1"), true);
  assert.match(result.stdout, /approval_rule: true/);
});

test("reviewer add --required with a numeric id skips the lookup", async () => {
  const result = await runCli(["mr", "reviewer", "add", "42", "--reviewer", "777", "--required", ...R]);

  assert.equal(result.status, 0, result.stdout);
  const invs = readInvocations(result.glabLogFile);
  // update + approval_rules only — no users lookup.
  assert.equal(invs.length, 2, JSON.stringify(invs));
  assert.equal(invs.some((i) => i.some((a) => a.includes("users?username="))), false);
  assert.equal(invs[1].some((a) => a === "user_ids[]=777"), true, JSON.stringify(invs[1]));
});

test("reviewer add --required surfaces an unresolvable username", async () => {
  const result = await runCli(
    ["mr", "reviewer", "add", "42", "--reviewer", "ghost", "--required", ...R],
    { GL_AXI_USER_NOTFOUND: "1" },
  );

  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /Could not resolve.*ghost/);
});

test("reviewer add requires --reviewer", async () => {
  const result = await runCli(["mr", "reviewer", "add", "42", ...R]);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /--reviewer is required/);
});

test("reviewer list shows reviewers with their approval state", async () => {
  const result = await runCli(["mr", "reviewer", "list", "42", ...R]);

  assert.equal(result.status, 0, result.stdout);
  const invs = readInvocations(result.glabLogFile);
  assert.equal(invs.length, 2, JSON.stringify(invs));
  assert.match(result.stdout, /reviewers: 1/);
  // dev2 appears in approved_by → approved true.
  assert.match(result.stdout, /dev2,Dev Two,true/);
});

test("reviewer rejects an unknown action", async () => {
  const result = await runCli(["mr", "reviewer", "frob", "42", ...R]);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stdout, /Unknown reviewer action: frob/);
});
