import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAxiCli } from "axi-sdk-js";
import { resolveContext } from "./context.js";
import { mrCommand, MR_HELP } from "./commands/mr.js";
import { issueCommand, ISSUE_HELP } from "./commands/issue.js";
import { setupCommand, SETUP_HELP } from "./commands/setup.js";
export const DESCRIPTION = "Agent-ergonomic wrapper around the GitLab CLI (`glab`). Prefer this over raw `glab` for GitLab merge requests, reviewers/approvers, and issues. TOON output, structured errors, project + token auto-resolution.";
const VERSION = readPackageVersion();
export const TOP_HELP = `usage: gl-axi [command] [args] [flags]
commands[3]:
  mr, issue, setup
context:
  host + project (namespace/repo) auto-detected from the GitLab git origin; override
  with GL_REPO=namespace/repo (+ GITLAB_HOST) or -R namespace/repo. Token read from the
  git credential helper for the host (GITLAB_TOKEN as a fallback).
flags:
  -R/--repo <NAMESPACE/REPO>, --help, -v/--version
examples:
  gl-axi mr list
  gl-axi mr create --title "Add readiness gate" --remove-source-branch
  gl-axi mr checks 42
  gl-axi mr reviewer add 42 --reviewer alice --required
  gl-axi issue list --state opened
  gl-axi issue create --title "Wire up gate" --assignee alice
  gl-axi setup hooks`;
const COMMAND_HELP = {
    mr: MR_HELP,
    issue: ISSUE_HELP,
    setup: SETUP_HELP,
};
const COMMANDS = {
    mr: withContext("mr", mrCommand),
    issue: withContext("issue", issueCommand),
    setup: (args) => setupCommand(stripRepoFlag(args).strippedArgs),
};
export async function main(argv, stdout) {
    const normalizedArgv = normalizeLeadingRepoFlag(argv ?? process.argv.slice(2));
    await runAxiCli({
        argv: normalizedArgv,
        stdout,
        description: DESCRIPTION,
        version: VERSION,
        topLevelHelp: TOP_HELP,
        home: async () => `${DESCRIPTION}\n\n${TOP_HELP}`,
        commands: COMMANDS,
        getCommandHelp: (command) => COMMAND_HELP[command],
        resolveContext: ({ args }) => resolveContext(stripRepoFlag(args).repoFlag),
    });
}
function normalizeLeadingRepoFlag(args) {
    if (args.length < 2)
        return args;
    let repoFlag;
    let rest;
    const first = args[0];
    if ((first === "-R" || first === "--repo") && args[1]) {
        repoFlag = args[1];
        rest = args.slice(2);
    }
    else if (first.startsWith("-R=")) {
        repoFlag = first.slice(3);
        rest = args.slice(1);
    }
    else if (first.startsWith("--repo=")) {
        repoFlag = first.slice("--repo=".length);
        rest = args.slice(1);
    }
    if (!repoFlag || !rest?.length)
        return args;
    return [rest[0], ...rest.slice(1), "--repo", repoFlag];
}
function withContext(_command, handler) {
    return (args, ctx) => handler(stripRepoFlag(args).strippedArgs, ctx);
}
/** Pull `-R`/`--repo namespace/repo` out of args; it sets context, not a passthrough flag. */
function stripRepoFlag(args) {
    const stripped = [];
    let repoFlag;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if ((arg === "-R" || arg === "--repo") && i + 1 < args.length) {
            repoFlag = args[i + 1];
            i++;
            continue;
        }
        if (arg.startsWith("-R=")) {
            repoFlag = arg.slice(3);
            continue;
        }
        if (arg.startsWith("--repo=")) {
            repoFlag = arg.slice("--repo=".length);
            continue;
        }
        stripped.push(arg);
    }
    return { repoFlag, strippedArgs: stripped };
}
function readPackageVersion() {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const candidate of [
        join(here, "..", "package.json"),
        join(here, "..", "..", "package.json"),
    ]) {
        if (!existsSync(candidate))
            continue;
        const parsed = JSON.parse(readFileSync(candidate, "utf-8"));
        if (typeof parsed.version === "string" && parsed.version.length > 0) {
            return parsed.version;
        }
    }
    return "0.0.0";
}
//# sourceMappingURL=cli.js.map