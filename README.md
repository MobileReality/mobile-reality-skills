# mobile-reality-skills

Distributable [agent skills](https://github.com/vercel-labs/skills) for the team — usable from **Claude Code** and **Codex**, on **Windows / macOS / Ubuntu**. Installed via `npx skills`; discovery is filesystem-based (every `skills/<name>/SKILL.md` is a skill).

## Available skills

| Skill | Description | Agents |
|---|---|---|
| [`coderabbit-fix`](skills/coderabbit-fix/) | Fetch & fix CodeRabbit comments on a Bitbucket Cloud PR — classify by severity/effort, auto-fix Quick Wins, flag Heavy Lift for decision. | Claude Code, Codex |

## Install

Installs both agents in one command:

```bash
# macOS / Linux
npx skills add MobileReality/mobile-reality-skills -a claude-code -a codex

# Windows (symlinks can be blocked without Developer Mode/admin → use --copy)
npx skills add MobileReality/mobile-reality-skills -a claude-code -a codex --copy
```

- One specific skill: append `-s coderabbit-fix`.
- Install globally (all repos) instead of repo-local: append `-g`.

## First-time setup

Each team member uses their **own** Bitbucket credentials — there is no shared secret.

### 1. Generate an Atlassian API token

<https://id.atlassian.com/manage-profile/security/api-tokens> → **Create API token with scopes** → app = **Bitbucket** → scopes: `read:pullrequest`, `write:pullrequest`, `read:repository`.

> Use an **API token**, NOT an App Password (Atlassian is disabling App Passwords).

### 2. Set the env vars

```bash
# bash / zsh
export BITBUCKET_EMAIL="you@example.com"
export BITBUCKET_API_TOKEN="ATATT3xFfGF0..."
```

```powershell
# PowerShell
$env:BITBUCKET_EMAIL    = "you@example.com"
$env:BITBUCKET_API_TOKEN = "ATATT3xFfGF0..."
```

Persist them in your shell profile (`~/.bashrc`, `~/.zshrc`, or PowerShell `$PROFILE`) so they survive new sessions.

**Fallback (any agent/OS):** put both vars in a `.env` file at your repo root — the fetch script reads it when env vars are absent. Never commit `.env`.

### 3. Point it at your Bitbucket repo

The `coderabbit-fix` skill has **no hardcoded workspace/repo** — it works for any team. It resolves the target in this order:

1. `--workspace <ws> --repo <repo>` flags, then
2. `BITBUCKET_WORKSPACE` / `BITBUCKET_REPO` env vars, then
3. the `origin` git remote, when it points at `bitbucket.org/<ws>/<repo>`.

If you run the skill from inside your Bitbucket clone, **(3) means zero config** — it just works. Otherwise set the env vars (or pass the flags).

### 4. Codex extra setup

Codex's sandbox blocks network and strips `*TOKEN*` env vars by default. Add to `~/.codex/config.toml`:

```toml
[sandbox_workspace_write]
network_access = true            # Linux/Windows; IGNORED on macOS

[shell_environment_policy]
ignore_default_excludes = true
include_only = ["PATH", "HOME", "BITBUCKET_EMAIL", "BITBUCKET_API_TOKEN"]
```

On **macOS**, `network_access` is silently ignored — run `codex --sandbox danger-full-access`, or prefer Claude Code. Full detail in each skill's `SKILL.md` ("Codex setup").

## Update

```bash
npx skills update coderabbit-fix   # one skill
npx skills update                  # all installed skills
```

There is no lockfile / version pin — `update` pulls the latest from the default branch.

## Platform / agent matrix

| | Windows | macOS | Ubuntu |
|---|---|---|---|
| **Claude Code** | ✓ | ✓ | ✓ |
| **Codex** | ✓ (config.toml) | ⚠️ needs `--sandbox danger-full-access`; prefer Claude Code | ✓ (config.toml) |

## Adding a new skill

The repo is multi-skill by design — no refactor needed to add one:

1. Create `skills/<name>/SKILL.md` (plus an optional `scripts/` folder).
2. Keep the frontmatter minimal and portable: `name`, `description`, `metadata.version` only — no `allowed-tools` / `Hooks` / `context:` (Claude-Code-only; Codex ignores or chokes on them).
3. Save `SKILL.md` as **UTF-8 without BOM** — Codex won't detect the frontmatter otherwise.
4. Commit and push. Team members pick it up with `npx skills update`.

## License

[MIT](LICENSE).
