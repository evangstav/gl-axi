import { requireContext, } from "../context.js";
import { glabApi, glabApiList, glabExec, encodeProject } from "../glab.js";
import { AxiError } from "../errors.js";
import { getFlag, getPositional, getCount } from "../args.js";
import { renderOutput, renderData, renderHelp, renderCount } from "../render.js";
export const ISSUE_HELP = `usage: gl-axi issue <subcommand> [flags]
subcommands[4]:
  create, update <id>, show <id>, list
flags{create}:
  --title <t> (required), --description <d>, --assignee <username>, --label <a,b>
flags{update}:
  --title, --description, --assignee, --label, --state <opened|closed>
flags{list}:
  --state <opened|closed|all> (default opened), --top <n> (default 30, max 1000),
  --assignee <username>, --author <username>, --label <a,b>
examples:
  gl-axi issue create --title "Wire up gate" --assignee alice --label backend
  gl-axi issue update 17 --state closed
  gl-axi issue list --state opened --assignee alice
  gl-axi issue show 17`;
/** REST base for the project's issues. */
function issueBase(ctx) {
    return `projects/${encodeProject(ctx.projectPath)}/issues`;
}
/** The human web URL is deterministic from context. */
function issueUrl(ctx, iid) {
    if (iid === undefined || iid === null)
        return undefined;
    return `${ctx.baseUrl}/${ctx.projectPath}/-/issues/${iid}`;
}
/** TOON-shaped projection of an issue. */
function issueSummary(issue, ctx) {
    const author = issue["author"];
    const assignees = issue["assignees"] ?? [];
    return {
        id: issue["iid"],
        title: issue["title"],
        state: issue["state"],
        author: author?.["username"],
        assignees: assignees
            .map((a) => a["username"])
            .filter((u) => typeof u === "string"),
        labels: issue["labels"] ?? [],
        url: issue["web_url"] ?? issueUrl(ctx, issue["iid"]),
    };
}
async function createIssue(args, ctx) {
    const title = getFlag(args, "--title");
    if (!title) {
        throw new AxiError("--title is required", "VALIDATION_ERROR");
    }
    const glabArgs = ["issue", "create", "-R", ctx.projectPath, "--title", title];
    const description = getFlag(args, "--description");
    // Always pass a description so glab never drops into an interactive editor/prompt.
    glabArgs.push("--description", description ?? "");
    const assignee = getFlag(args, "--assignee");
    if (assignee)
        glabArgs.push("--assignee", assignee);
    const label = getFlag(args, "--label");
    if (label)
        glabArgs.push("--label", label);
    glabArgs.push("--yes");
    const out = await glabExec(glabArgs, ctx);
    const iid = parseIssueIid(out);
    return renderOutput([
        renderData("created", {
            id: iid,
            title,
            assignee,
            url: issueUrl(ctx, iid) ?? firstUrl(out),
        }),
        renderHelp([
            `Inspect: gl-axi issue show ${iid ?? "<id>"}`,
            `Close it: gl-axi issue update ${iid ?? "<id>"} --state closed`,
        ]),
    ]);
}
async function updateIssue(args, ctx) {
    const id = requireIssueId(args);
    const title = getFlag(args, "--title");
    const description = getFlag(args, "--description");
    const assignee = getFlag(args, "--assignee");
    const label = getFlag(args, "--label");
    const state = getFlag(args, "--state");
    const fieldArgs = ["issue", "update", String(id), "-R", ctx.projectPath];
    if (title)
        fieldArgs.push("--title", title);
    if (description !== undefined)
        fieldArgs.push("--description", description);
    if (assignee)
        fieldArgs.push("--assignee", assignee);
    if (label)
        fieldArgs.push("--label", label);
    const hasFieldChange = fieldArgs.length > 5;
    // GitLab issue state is not a field on `issue update`; it is a transition.
    let stateAction;
    if (state !== undefined) {
        if (state === "closed" || state === "close")
            stateAction = "close";
        else if (state === "opened" || state === "open" || state === "reopen")
            stateAction = "reopen";
        else
            throw new AxiError(`--state must be opened or closed (got "${state}")`, "VALIDATION_ERROR");
    }
    if (!hasFieldChange && !stateAction) {
        throw new AxiError("Nothing to update — pass at least one of --title/--description/--assignee/--label/--state", "VALIDATION_ERROR");
    }
    if (hasFieldChange)
        await glabExec(fieldArgs, ctx);
    if (stateAction) {
        await glabExec(["issue", stateAction, String(id), "-R", ctx.projectPath], ctx);
    }
    const issue = await glabApi(`${issueBase(ctx)}/${id}`, ctx);
    return renderOutput([
        renderData("updated", issueSummary(issue, ctx)),
        renderHelp([`Inspect: gl-axi issue show ${id}`]),
    ]);
}
async function showIssue(args, ctx) {
    const id = requireIssueId(args);
    const issue = await glabApi(`${issueBase(ctx)}/${id}`, ctx);
    return renderOutput([renderData("issue", issueSummary(issue, ctx))]);
}
async function listIssues(args, ctx) {
    const state = getFlag(args, "--state") ?? "opened";
    const top = getCount(args, "--top", 30, 1000);
    const params = new URLSearchParams();
    params.set("state", state);
    const assignee = getFlag(args, "--assignee");
    if (assignee)
        params.set("assignee_username", assignee);
    const author = getFlag(args, "--author");
    if (author)
        params.set("author_username", author);
    const label = getFlag(args, "--label");
    if (label)
        params.set("labels", label);
    const issues = await glabApiList(issueBase(ctx), params, ctx, top);
    const rows = issues.map((i) => issueSummary(i, ctx));
    return renderOutput([
        renderCount("issues", rows.length),
        renderData("issues", rows),
        renderHelp(rows.length ? ["Inspect one: gl-axi issue show <id>"] : []),
    ]);
}
/** Extract the issue iid from glab create output (URL or `#123`). */
function parseIssueIid(output) {
    const url = output.match(/\/issues\/(\d+)/);
    if (url)
        return Number(url[1]);
    const hash = output.match(/#(\d+)/);
    return hash ? Number(hash[1]) : undefined;
}
function firstUrl(output) {
    const m = output.match(/https?:\/\/\S+/);
    return m ? m[0] : undefined;
}
function requireIssueId(args) {
    const raw = getPositional(args, 1);
    if (!raw || !/^\d+$/.test(raw)) {
        throw new AxiError("An issue id is required, e.g. gl-axi issue show 17", "VALIDATION_ERROR");
    }
    return Number(raw);
}
export async function issueCommand(args, resolution) {
    const sub = args[0];
    if (sub === "--help" || sub === undefined)
        return ISSUE_HELP;
    const ctx = requireContext(resolution);
    switch (sub) {
        case "create":
            return createIssue(args, ctx);
        case "update":
            return updateIssue(args, ctx);
        case "show":
            return showIssue(args, ctx);
        case "list":
            return listIssues(args, ctx);
        default:
            throw new AxiError(`Unknown subcommand: ${sub}`, "VALIDATION_ERROR", [
                "Available: create, update, show, list",
            ]);
    }
}
//# sourceMappingURL=issue.js.map