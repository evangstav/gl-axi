# gl-axi

AXI-compliant GitLab CLI wrapper — token-efficient [TOON](https://github.com/toon-format/toon) output over `glab` (merge requests, reviewers/approvers, issues). The GitLab equivalent of `gh-axi` / `ado-axi`.

`gl-axi` wraps the GitLab CLI (`glab`) the way `ado-axi` wraps `az`: it auto-resolves the
host + project from your GitLab git origin, reads the API token from the git credential
helper, projects responses into compact TOON, attaches contextual next-step hints, and
turns `glab`/GitLab failures into structured errors. It is built for agents that need
predictable, low-token GitLab interactions.

## Install

```sh
# From GitHub — uses the committed dist/, no install-time build:
npm install -g github:evangstav/gl-axi

# From npm, once published:
npm install -g gl-axi
```

The git-based install runs the committed `dist/` directly (there is no `prepare` step), so
it cannot fail on a missing build toolchain. Requires Node ≥ 20 and `glab` on `PATH`.

Local development:

```sh
npm install
npm run build        # compile src/ + bin/ → dist/
npm test             # build, then run the node:test suite
npm run typecheck    # tsc --noEmit
npm run dev -- mr list   # run from source via tsx
```

## Context & auth

- **Project**: the full GitLab project path (`namespace/repo`, including subgroups) is
  auto-detected from the `origin` remote. Override with `GL_REPO=namespace/repo` or
  `-R namespace/repo` (which may lead the command line: `gl-axi -R grp/repo mr list`).
- **Host**: taken from `GITLAB_HOST`, else the origin host, else `gitlab.com`. When you
  override `-R`/`GL_REPO` on a non-GitLab checkout, set `GITLAB_HOST` too.
- **Token**: read from the git credential helper for the host (the same
  `credential.helper store` mechanism a `glab`-authenticated checkout uses); `GITLAB_TOKEN`
  is honored only as a fallback. The token never appears in argv — it rides the env into
  `glab`.

No interactive login is required: if the credential helper has the token, `gl-axi` runs as
a standalone binary.

## Commands

### Merge requests — `gl-axi mr`

| Command | Description |
| --- | --- |
| `mr list [--state opened\|merged\|closed\|all] [--author <u>] [--source <b>] [--target <b>] [--top N]` | List merge requests (default state `opened`, top 30, max 1000) |
| `mr show <id>` | Show one merge request |
| `mr create [-s/--source <b>] [-t/--target <b>] [--title <t>] [--description <d>] [--draft] [--remove-source-branch]` | Create an MR (source defaults to the current branch, target to `main`) |
| `mr merge <id> [--squash] [--remove-source-branch]` | Merge/accept an MR |
| `mr checks <id>` | Pipeline + approval status folded into one verdict (`passing`/`pending`/`failing`) + breakdown — the merge-poll signal |
| `mr reviewer add <id> --reviewer <username\|id> [--required]` | Add a reviewer; `--required` also creates an MR-level approval rule |
| `mr reviewer list <id>` | List reviewers with their approval state |

### Issues — `gl-axi issue`

| Command | Description |
| --- | --- |
| `issue create --title <t> [--description <d>] [--assignee <u>] [--label <a,b>]` | Create an issue |
| `issue update <id> [--title] [--description] [--assignee] [--label] [--state opened\|closed]` | Update fields and/or transition state |
| `issue show <id>` | Show one issue |
| `issue list [--state opened\|closed\|all] [--assignee <u>] [--author <u>] [--label <a,b>] [--top N]` | List issues (default state `opened`, top 30, max 1000) |

### Setup — `gl-axi setup hooks`

Installs the AXI session-start hook so agents get `gl-axi`'s ambient context.

## How it maps to `glab`

`gl-axi` uses two `glab` surfaces. **Reads** go through `glab api` (the REST passthrough)
because `glab`'s porcelain list/view commands don't emit JSON — `glab api` is the GitLab
analogue of `az ... -o json`, returning the raw response that projects cleanly into TOON.
**Mutations** go through `glab` porcelain, which owns branch/prompt handling; the new
object's id/URL is parsed from stdout.

| gl-axi | glab |
| --- | --- |
| `mr list` | `glab api projects/:id/merge_requests?…` |
| `mr show <id>` | `glab api projects/:id/merge_requests/<iid>` |
| `mr create` | `glab mr create -s … -b … -t … --yes` |
| `mr merge <id>` | `glab mr merge <iid> [--squash] [--remove-source-branch] --yes` |
| `mr checks <id>` | `glab api …/merge_requests/<iid>` (pipeline) + `…/approvals` |
| `mr reviewer add <id>` | `glab mr update <iid> --reviewer +<u>` (+ `…/approval_rules` when `--required`) |
| `mr reviewer list <id>` | `glab api …/merge_requests/<iid>` + `…/approvals` |
| `issue create` | `glab issue create -t … --yes` |
| `issue update <id>` | `glab issue update <iid> …` and/or `glab issue close`/`reopen` |
| `issue show <id>` | `glab api projects/:id/issues/<iid>` |
| `issue list` | `glab api projects/:id/issues?…` |

The project is always addressed by its URL-encoded full path (`projects/<namespace%2Frepo>`),
so results never depend on `glab`'s own working-directory resolution.

## Output

TOON, with a definitive count line for lists, a `next:` block of contextual suggestions, and
structured errors (`code` + actionable `help`). Example:

```
merge_requests: 1

merge_requests[1]{id,title,state,source,target,draft,author,url}:
  42,Add readiness gate,opened,feature/gate,main,false,alice,https://gitlab.example/grp/repo/-/merge_requests/42

next:
  Inspect one: gl-axi mr show <id>
```

## License

MIT
