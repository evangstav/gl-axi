# Repository Guidelines

## Project Structure & Module Organization

`gl-axi` is a small TypeScript CLI for GitLab merge-request and issue workflows, wrapping
the GitLab CLI (`glab`). It mirrors the structure and conventions of its sibling `ado-axi`.

| Path | Purpose |
| --- | --- |
| `bin/gl-axi.ts` | executable entry point used by `npm run dev` |
| `src/cli.ts` | top-level command routing and help text |
| `src/commands/` | command implementations: `mr`, `issue`, `setup` |
| `src/args.ts`, `src/context.ts`, `src/glab.ts` | argument parsing, host/project/token context, and `glab` integration |
| `src/identity.ts` | username → numeric user-id resolution (for required-approver rules) |
| `src/render.ts`, `src/errors.ts` | TOON rendering and structured error handling |
| `dist/` | generated build output; do not edit by hand |

## Build, Test, and Development Commands

| Task | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Run locally | `npm run dev -- mr list` |
| Build distributable JS and declarations | `npm run build` |
| Type-check without emitting files | `npm run typecheck` |
| Run regression tests | `npm test` |

`npm test` builds first, then runs every `test/*.test.js` file through Node's built-in test
runner.

**The compiled `dist/` is committed to the repo.** The git-based global install
(`npm install -g github:evangstav/gl-axi`) uses it directly — there is no install-time build
(no `prepare` script), so it can't fail on missing runtime deps. Because of this you **must
run `npm run build` and commit the refreshed `dist/` whenever you change source**, or the
published binary will drift from `src/`. `prepack` rebuilds `dist/` when packing/publishing.

## Coding Style & Naming Conventions

TypeScript ES modules targeting Node 20+. Keep `strict` TypeScript clean, prefer small
modules with named exports, and keep command-specific logic under `src/commands/`. Use
lower-case file names that describe the responsibility (`context.ts`, `glab.ts`). Avoid
hand-editing generated files in `dist/`.

## Testing Guidelines

Tests live under `test/` and use Node's built-in `node:test` runner with a fake `glab` and
`git` on `PATH` (see `test/helpers.js`). The fake `glab` APPENDS each invocation behind a
`--INVOCATION--` marker so multi-call flows (e.g. `mr checks` = MR + approvals; required
reviewer = update + user lookup + approval rule) can be asserted call-by-call. Cover the
exact `glab` args built, the TOON output shape, and error rendering before changing
behavior. **There is no live GitLab in CI** — never assert against a real host.

## GitLab / `glab` Domain Notes

These are non-obvious `glab`/GitLab behaviors the wrapper relies on; preserve them.

- **`glab` porcelain does not emit JSON.** `glab mr list`/`view`, `glab issue list`/`view`
  have no `-F/--output json`. So **reads go through `glab api`** (the REST passthrough,
  the GitLab analogue of `az -o json`) and **mutations go through `glab` porcelain**
  (`mr create`, `mr merge`, `mr update`, `issue create/update/close/reopen`). After a
  porcelain mutation, the new object's iid/URL is parsed from stdout (`/merge_requests/<n>`,
  `/issues/<n>`, or `!n`/`#n`).
- **Address the project by URL-encoded full path.** API endpoints use
  `projects/<encodeURIComponent(namespace/repo)>` (e.g. `projects/grp%2Frepo/...`) so the
  result never depends on `glab`'s own cwd resolution. `--hostname <host>` is passed
  explicitly to every `glab api` call.
- **Host + project resolution.** Project path: `-R`/`--repo` flag → `GL_REPO` env → git
  origin. Host: `GITLAB_HOST` env → git origin host → `gitlab.com`. The full path may have
  multiple segments (GitLab subgroups). Token comes from `git credential fill` for the host
  base URL; `GITLAB_TOKEN` is only a fallback. `glab` reads the host + token from the
  `GITLAB_HOST`/`GITLAB_TOKEN` env vars `glab.ts` injects, so the token never touches argv.
  An explicit **HTTPS** port in the origin is part of the API host and is kept
  (`gitlab.example:8443`); an **SSH** port is the SSH port, not the HTTPS API port, so
  `parseRemoteUrl` drops it.
- **List reads paginate past GitLab's 100-row `per_page` cap.** GitLab silently
  truncates any `per_page` above 100, so `mr list`/`issue list` `--top N` (default 30,
  max 1000) is served by `glab.ts`'s `glabApiList`, which pages with
  `per_page=min(100, remaining)` (and an explicit `page=`) until it has `N` rows or hits a
  short page. A non-numeric/non-positive `--top` falls back to the default. The single
  default-budget call still asks for one page.
- **`mr checks` folds two API calls into one verdict.** Pipeline status from
  `head_pipeline.status` on the MR + `approvals_left`/`approvals_required` from the
  `…/approvals` endpoint → `failing` (pipeline failed/canceled), `pending` (pipeline running
  or approvals outstanding), or `passing`.
- **`--required` reviewer is an approval rule, not a reviewer field.** A plain reviewer is
  set with `glab mr update --reviewer +<who>`, which takes a **username only**. `--reviewer`
  also accepts a numeric user id, so `identity.ts`'s `resolveUsername` first turns a numeric
  id into its username (`GET /users/:id`) before the porcelain call (a username passes
  through untouched, no API call). `--required` additionally resolves the reviewer to a
  numeric id via `GET /users?username=` (a numeric input is used directly) and POSTs an
  MR-level approval rule (`…/merge_requests/<iid>/approval_rules`, `approvals_required=1`,
  `user_ids[]=<id>`).
- **Issue state is a transition, not a field.** `glab issue update` has no `--state`;
  `--state closed`/`opened` routes to `glab issue close`/`reopen`.
- **Descriptions are native Markdown.** GitLab MR/issue descriptions accept Markdown
  directly — no HTML conversion (unlike `ado-axi`'s `markdown.ts`).
- **Non-interactive mutations.** `mr create` and `issue create` always pass a description
  (default `""`) plus `--yes` so `glab` never opens an editor or prompts.
- **Not published to npm.** Install from GitHub (`npm install -g github:evangstav/gl-axi`),
  which uses the committed `dist/` with no install-time build, or clone + `npm install &&
  npm run build`.

## Security & Configuration Tips

The CLI expects the GitLab token from the git credential helper, with `GITLAB_TOKEN` only as
a fallback. Do not store tokens in tracked files, shell snippets, examples, or screenshots;
`src/errors.ts` redacts `token`/`password`/`PRIVATE-TOKEN` values from surfaced messages.
