import { execFileSync } from "node:child_process";
import { requireContext, } from "../context.js";
import { glabApi, glabApiList, glabExec, encodeProject } from "../glab.js";
import { AxiError } from "../errors.js";
import { getFlag, hasFlag, getPositional, getCount } from "../args.js";
import { renderOutput, renderData, renderHelp, renderCount } from "../render.js";
import { resolveUserId } from "../identity.js";
export const MR_HELP = `usage: gl-axi mr <subcommand> [flags]
subcommands[6]:
  create, show <id>, list, merge <id>, checks <id>, reviewer
flags{create}:
  -s/--source <branch> (default: current branch), -t/--target <branch> (default: main),
  --title <t>, --description <d>, --draft, --remove-source-branch
flags{list}:
  --state <opened|merged|closed|all> (default opened), --top <n> (default 30, max 1000),
  --author <username>, --source <branch>, --target <branch>
flags{merge}:
  --squash, --remove-source-branch
flags{reviewer}:
  reviewer add <id> --reviewer <username|id> [--required]
  reviewer list <id>
examples:
  gl-axi mr create --title "Add readiness gate" --remove-source-branch
  gl-axi mr show 42
  gl-axi mr list --state opened
  gl-axi mr checks 42
  gl-axi mr merge 42 --squash --remove-source-branch
  gl-axi mr reviewer add 42 --reviewer alice --required`;
/** REST base for the project's merge requests. */
function mrBase(ctx) {
    return `projects/${encodeProject(ctx.projectPath)}/merge_requests`;
}
/** The human web URL is deterministic from context. */
function mrUrl(ctx, iid) {
    if (iid === undefined || iid === null)
        return undefined;
    return `${ctx.baseUrl}/${ctx.projectPath}/-/merge_requests/${iid}`;
}
/** TOON-shaped projection of an MR (a few fields, not the full glab blob). */
function mrSummary(mr, ctx) {
    const author = mr["author"];
    return {
        id: mr["iid"],
        title: mr["title"],
        state: mr["state"],
        source: mr["source_branch"],
        target: mr["target_branch"],
        draft: mr["draft"] ?? mr["work_in_progress"] ?? false,
        author: author?.["username"],
        url: mr["web_url"] ?? mrUrl(ctx, mr["iid"]),
    };
}
function currentBranch() {
    try {
        return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    }
    catch {
        return undefined;
    }
}
async function listMrs(args, ctx) {
    const state = getFlag(args, "--state") ?? "opened";
    const top = getCount(args, "--top", 30, 1000);
    const params = new URLSearchParams();
    params.set("state", state);
    const author = getFlag(args, "--author");
    if (author)
        params.set("author_username", author);
    const source = getFlag(args, "--source");
    if (source)
        params.set("source_branch", source);
    const target = getFlag(args, "--target");
    if (target)
        params.set("target_branch", target);
    const mrs = await glabApiList(mrBase(ctx), params, ctx, top);
    const rows = mrs.map((mr) => mrSummary(mr, ctx));
    return renderOutput([
        renderCount("merge_requests", rows.length),
        renderData("merge_requests", rows),
        renderHelp(rows.length ? ["Inspect one: gl-axi mr show <id>"] : []),
    ]);
}
async function showMr(args, ctx) {
    const id = requireMrId(args);
    const mr = await glabApi(`${mrBase(ctx)}/${id}`, ctx);
    return renderOutput([renderData("merge_request", mrSummary(mr, ctx))]);
}
async function createMr(args, ctx) {
    const source = getFlag(args, "--source") ?? getFlag(args, "-s") ?? currentBranch();
    if (!source) {
        throw new AxiError("No source branch — pass --source or run inside a git checkout", "VALIDATION_ERROR");
    }
    const target = getFlag(args, "--target") ?? getFlag(args, "-t") ?? "main";
    const title = getFlag(args, "--title") ?? `Merge ${source} into ${target}`;
    const draft = hasFlag(args, "--draft");
    const removeSource = hasFlag(args, "--remove-source-branch");
    const glabArgs = [
        "mr", "create",
        "-R", ctx.projectPath,
        "--source-branch", source,
        "--target-branch", target,
        "--title", title,
    ];
    const description = getFlag(args, "--description");
    // Always pass a description so glab never drops into an interactive editor/prompt.
    glabArgs.push("--description", description ?? "");
    if (draft)
        glabArgs.push("--draft");
    if (removeSource)
        glabArgs.push("--remove-source-branch");
    glabArgs.push("--yes");
    const out = await glabExec(glabArgs, ctx);
    const iid = parseMrIid(out);
    const summary = {
        id: iid,
        title,
        source,
        target,
        draft,
        url: mrUrl(ctx, iid) ?? firstUrl(out),
    };
    return renderOutput([
        renderData("created", summary),
        renderHelp([
            `Track it: gl-axi mr checks ${iid ?? "<id>"}`,
            `Merge when checks pass: gl-axi mr merge ${iid ?? "<id>"}`,
        ]),
    ]);
}
async function mergeMr(args, ctx) {
    const id = requireMrId(args);
    const squash = hasFlag(args, "--squash");
    const removeSource = hasFlag(args, "--remove-source-branch");
    const glabArgs = ["mr", "merge", String(id), "-R", ctx.projectPath];
    if (squash)
        glabArgs.push("--squash");
    if (removeSource)
        glabArgs.push("--remove-source-branch");
    glabArgs.push("--yes");
    await glabExec(glabArgs, ctx);
    return renderOutput([
        renderData("merged", {
            id,
            squash,
            remove_source_branch: removeSource,
            url: mrUrl(ctx, id),
        }),
        renderHelp([
            "If a pipeline must pass first, glab sets merge-when-pipeline-succeeds; re-check: " +
                `gl-axi mr checks ${id}`,
        ]),
    ]);
}
/**
 * Pipeline + approval status folded into a single green/amber/red verdict — the
 * signal a merge-poll waits on. `head_pipeline.status` is the CI state; the
 * approvals endpoint gives the required/left counts.
 */
async function checksMr(args, ctx) {
    const id = requireMrId(args);
    const mr = await glabApi(`${mrBase(ctx)}/${id}`, ctx);
    const approvals = await glabApi(`${mrBase(ctx)}/${id}/approvals`, ctx);
    const pipeline = mr["head_pipeline"] ??
        mr["pipeline"];
    const pipelineStatus = pipeline?.["status"] ?? "none";
    const approvalsRequired = Number(approvals?.["approvals_required"] ?? 0);
    const approvalsLeft = Number(approvals?.["approvals_left"] ?? 0);
    const approved = approvals?.["approved"] ??
        approvalsLeft === 0;
    const FAILING = new Set(["failed", "canceled"]);
    const PENDING = new Set([
        "running", "pending", "created", "scheduled",
        "waiting_for_resource", "preparing", "manual",
    ]);
    const verdict = FAILING.has(pipelineStatus)
        ? "failing"
        : PENDING.has(pipelineStatus) || approvalsLeft > 0
            ? "pending"
            : "passing";
    return renderOutput([
        renderData("checks", {
            mr: id,
            verdict,
            pipeline: pipelineStatus,
            approved,
            approvals_required: approvalsRequired,
            approvals_left: approvalsLeft,
        }),
        renderHelp(verdict === "passing"
            ? [`Ready: gl-axi mr merge ${id}`]
            : verdict === "pending"
                ? [`Re-check shortly: gl-axi mr checks ${id}`]
                : ["The pipeline failed — push a fix before merging"]),
    ]);
}
async function reviewerCommand(args, ctx) {
    const action = args[1];
    if (action === "add")
        return addReviewer(args, ctx);
    if (action === "list")
        return listReviewers(args, ctx);
    throw new AxiError(`Unknown reviewer action: ${action ?? "(none)"}`, "VALIDATION_ERROR", ["Available: add, list"]);
}
/**
 * Add a reviewer. A plain reviewer is set with `glab mr update --reviewer +<who>`
 * (the `+` adds without replacing existing reviewers; GitLab accepts the username
 * directly). `--required` additionally makes them a required approver — which on
 * GitLab is an approval rule, not a reviewer field — so the username is resolved
 * to a numeric id and an MR-level approval rule (approvals_required=1) is created.
 */
async function addReviewer(args, ctx) {
    const id = requireMrId(args, 2);
    const reviewer = getFlag(args, "--reviewer");
    if (!reviewer) {
        throw new AxiError("--reviewer is required (username or numeric user id)", "VALIDATION_ERROR");
    }
    const required = hasFlag(args, "--required");
    await glabExec(["mr", "update", String(id), "-R", ctx.projectPath, "--reviewer", `+${reviewer}`], ctx);
    let ruleCreated = false;
    if (required) {
        const userId = await resolveUserId(reviewer, ctx);
        if (userId === undefined) {
            throw new AxiError(`Could not resolve "${reviewer}" to a GitLab user for the required-approver rule`, "VALIDATION_ERROR", [
                "Pass the reviewer's numeric user id",
                "Or confirm the username with `gl-axi mr reviewer list <id>`",
            ]);
        }
        await glabApi(`${mrBase(ctx)}/${id}/approval_rules`, ctx, {
            method: "POST",
            fields: [
                ["name", `gl-axi: ${reviewer}`],
                ["approvals_required", "1"],
                ["user_ids[]", String(userId)],
            ],
        });
        ruleCreated = true;
    }
    return renderOutput([
        renderData("reviewer_added", {
            mr: id,
            reviewer,
            required,
            approval_rule: ruleCreated,
        }),
        renderHelp([`List reviewers: gl-axi mr reviewer list ${id}`]),
    ]);
}
async function listReviewers(args, ctx) {
    const id = requireMrId(args, 2);
    const mr = await glabApi(`${mrBase(ctx)}/${id}`, ctx);
    const approvals = await glabApi(`${mrBase(ctx)}/${id}/approvals`, ctx);
    const approvedBy = new Set((approvals?.["approved_by"] ?? [])
        .map((a) => a["user"]?.["username"])
        .filter((u) => typeof u === "string"));
    const reviewers = mr["reviewers"] ?? [];
    const rows = reviewers.map((r) => ({
        username: r["username"],
        name: r["name"],
        approved: approvedBy.has(r["username"]),
    }));
    return renderOutput([
        renderCount("reviewers", rows.length),
        renderData("reviewers", rows),
        renderHelp(rows.length
            ? []
            : [`Add one: gl-axi mr reviewer add ${id} --reviewer <who>`]),
    ]);
}
/** Extract the MR iid from glab create output (URL or `!123`). */
function parseMrIid(output) {
    const url = output.match(/\/merge_requests\/(\d+)/);
    if (url)
        return Number(url[1]);
    const bang = output.match(/!(\d+)/);
    return bang ? Number(bang[1]) : undefined;
}
function firstUrl(output) {
    const m = output.match(/https?:\/\/\S+/);
    return m ? m[0] : undefined;
}
function requireMrId(args, start = 1) {
    const raw = getPositional(args, start);
    if (!raw || !/^\d+$/.test(raw)) {
        throw new AxiError("A merge request id is required, e.g. gl-axi mr show 42", "VALIDATION_ERROR");
    }
    return Number(raw);
}
export async function mrCommand(args, resolution) {
    const sub = args[0];
    if (sub === "--help" || sub === undefined)
        return MR_HELP;
    const ctx = requireContext(resolution);
    switch (sub) {
        case "create":
            return createMr(args, ctx);
        case "show":
            return showMr(args, ctx);
        case "list":
            return listMrs(args, ctx);
        case "merge":
            return mergeMr(args, ctx);
        case "checks":
            return checksMr(args, ctx);
        case "reviewer":
            return reviewerCommand(args, ctx);
        default:
            throw new AxiError(`Unknown subcommand: ${sub}`, "VALIDATION_ERROR", [
                "Available: create, show, list, merge, checks, reviewer",
            ]);
    }
}
//# sourceMappingURL=mr.js.map