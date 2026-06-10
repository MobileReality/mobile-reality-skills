---
name: coderabbit-fix
description: Pull CodeRabbit comments from current Bitbucket PR, classify by severity (Critical/Major/Minor/Nitpick) and effort (Quick Win/Heavy Lift), auto-fix Critical+Major Quick Wins after confirmation, flag Heavy Lift for human decision. Trigger when user says "/coderabbit", "coderabbit", "code rabbit", "pobierz komentarze CR", "fix code rabbit", or asks to apply CodeRabbit review feedback. Bitbucket Cloud only.
metadata:
  version: "1.0.0"
---

# CodeRabbit PR Review Fix

## Preconditions

1. **Node.js 20+** (LTS; native `fetch` is available from 18, 20 is the floor). The fetch script has zero npm dependencies.
2. **`BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN`** available in the environment (Atlassian **API token**, NOT an app password — Atlassian deprecated those). If both are missing, the script prints setup instructions on stderr and exits 1; relay them and stop.
   - bash / zsh: `export BITBUCKET_EMAIL="you@example.com"` and `export BITBUCKET_API_TOKEN="ATATT3xFfGF0..."`
   - PowerShell: `$env:BITBUCKET_EMAIL = "you@example.com"` and `$env:BITBUCKET_API_TOKEN = "ATATT3xFfGF0..."`
   - Generate a token at <https://id.atlassian.com/manage-profile/security/api-tokens> → "Create API token with scopes" → app = Bitbucket → scopes: `read:pullrequest`, `write:pullrequest`, `read:repository`.
   - **Fallback (any agent):** put `BITBUCKET_EMAIL` / `BITBUCKET_API_TOKEN` in a `.env` file at the repo root — the script reads it when env vars are absent.
3. **Bitbucket target (workspace + repo).** The script resolves it in this order: `--workspace`/`--repo` flags → `BITBUCKET_WORKSPACE`/`BITBUCKET_REPO` env → parsed from the `origin` git remote when it points at `bitbucket.org/<ws>/<repo>`. There is no hardcoded default (this skill is shared across teams). If none resolve, the script errors with these options — relay them. When the working repo's `origin` is its Bitbucket clone, no config is needed.
4. Working directory is the repo root with clean-ish git state. If uncommitted changes exist on tracked files, warn the user before applying fixes.
5. Current git branch maps to an open PR. If not, ask the user for the PR number.

## Codex setup

Codex runs scripts in a sandbox that by default **(a) blocks network** and **(b) strips `*TOKEN*` env vars**. Before first use under Codex, add to `~/.codex/config.toml`:

```toml
[sandbox_workspace_write]
network_access = true            # Linux/Windows; IGNORED on macOS (see below)

[shell_environment_policy]
ignore_default_excludes = true
include_only = ["PATH", "HOME", "BITBUCKET_EMAIL", "BITBUCKET_API_TOKEN"]
```

**macOS:** `network_access` is silently ignored by the Seatbelt sandbox. Run with:

```bash
codex --sandbox danger-full-access
```

(full host access for that session — acceptable for this read-only fetch, but on macOS **prefer Claude Code** for this skill, which has no such limitation).

Alternatively (any agent, any OS): put `BITBUCKET_EMAIL` / `BITBUCKET_API_TOKEN` in a `.env` file at the repo root — the script reads it as a fallback, sidestepping the env-strip entirely.

## Step 1 — Resolve PR + fetch

Argument: optional `<PR#>`. If absent, the script auto-resolves from the current branch.

```bash
node scripts/coderabbit-fetch.mjs --pr <prNum-or-omit> --out <tmpfile>
```

Pick any writable temp path for `<tmpfile>` (e.g. `./.coderabbit.json`, or an OS temp dir). Omit `--out` to print JSON to stdout instead. Add `--include-minor` to also pull Minor + Nitpick. If the target Bitbucket repo isn't the `origin` remote, pass `--workspace <ws> --repo <repo>` (or set the env vars).

Read the JSON. Shape: `{ prId, fetchedAt, counts: {total, critical, major, minor, nitpick, autoFixable, heavyLift}, findings: [...] }`.

Each finding has: `id, severity, effort, autoFixable, path, line, side, title, body, suggestion, url, isInline`.

## Step 2 — Show summary

Print one compact table to the user:

```
PR #<id> — <counts.total> findings (Critical/Major only by default)
  Critical: N    Major: N
  Quick Wins (auto-fixable): N
  Heavy Lift (needs decision): N

Quick Wins:
  [C] path:line — title
  [M] path:line — title
Heavy Lift:
  [C] path:line — title
  [M] path:line — title
```

If `counts.total == 0`: tell the user "No actionable CodeRabbit comments." and stop.

## Step 3 — Quick Win fix loop

For each finding where `autoFixable = true`:

1. Read the target file at `path` around `line` (±10 lines context).
2. If `suggestion` is non-null, the patch is the literal replacement at `line` (CodeRabbit ` ```suggestion ` blocks are concrete). Show the diff plan.
3. If `suggestion` is null, read the `body` and derive a minimal fix. Do NOT expand scope — the CR comment is the spec.
4. Ask the user: `Fix [C] path:line — title? (y/n/skip-rest/quit)`.
   - `y` → apply via Edit, mark done.
   - `n` → skip this one only.
   - `skip-rest` → leave remaining Quick Wins, jump to Step 4.
   - `quit` → stop entirely, no Step 4.
5. Track applied fixes for the verification step.

Match each fix to the existing module's patterns. Do not refactor surrounding code. Comment in code only if CodeRabbit's reasoning is non-obvious from the diff.

## Step 4 — Heavy Lift report

For each finding where `severity ∈ {Critical, Major}` AND `effort = Heavy Lift`:

Print under header `## Needs your decision`:

```
[C|M] path:line — title
  Why: <1 sentence from body>
  CodeRabbit proposes: <1 sentence>
  Trade-off / concern: <1 sentence on why it's not a Quick Win>
  URL: <comment url>
```

Keep each item under 5 lines. The user decides whether to handle now, defer, or push back on CR.

## Step 5 — Verify (only if Step 3 applied ≥1 fix)

- Run the project's own lint/test for the touched area. Find the nearest `package.json` (or other manifest) to a touched file and run its lint script — e.g. for a monorepo with `frontend/` + `backend/` subprojects: `cd frontend && npm run lint` when a `frontend/` file was touched, likewise for `backend/`. For a single-package repo, run the root `npm run lint` (or the equivalent for the stack).
- If lint fails, surface the errors and stop — do not commit, do not push.

## Step 6 — Stop

Do NOT commit or push automatically. End with:

```
Applied N fixes. M Heavy Lift items need your decision. Review the diff before committing.
```

## Notes

- Bitbucket Cloud API only. Workspace + repo are resolved from `--workspace`/`--repo` flags, `BITBUCKET_WORKSPACE`/`BITBUCKET_REPO` env, or the `origin` git remote (no hardcoded default — see Preconditions).
- Auth via Atlassian API token (id.atlassian.com), NOT an App Password. App Passwords are being disabled.
- Minor + Nitpick are filtered out by default. To include them: re-run with `--include-minor`.
- Replies in a CodeRabbit thread are skipped — v1 treats each top-level comment as one finding.
- General PR-level CR summaries (no `inline` field) appear with `isInline = false` — informational only, not auto-fixable.
- **Outside-diff-range CR findings** are packed into the PR-level summary comment — they are real but not inline; surface them in the Heavy Lift / informational section rather than dropping them.
- Never invent CodeRabbit feedback. If the body is empty or unparseable, surface it as-is and ask the user how to handle it.
```
