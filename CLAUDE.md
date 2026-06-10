# CLAUDE.md — mobile-reality-skills

Repo dystrybucyjny skilli dla zespołu (Claude Code + Codex; Windows/macOS/Ubuntu).
Instalacja przez `npx skills` (vercel-labs/skills), discovery filesystemowe po `skills/<name>/SKILL.md`.

## Stan
- `coderabbit-fix` gotowy: [skrypt `.mjs`](skills/coderabbit-fix/scripts/coderabbit-fetch.mjs) + [SKILL.md](skills/coderabbit-fix/SKILL.md), parytet z oryginałem `.ps1` potwierdzony na realnym PR.
- Pozostało: utworzenie zdalnego repo GitHub + push (Faza 1), walidacja matrycy OS×agent (Faza 5), sprzątanie repo źródłowego (Faza 6).
- Historia/plan: [.claude/plans/coderabbit-skill-team-distribution.md](.claude/plans/coderabbit-skill-team-distribution.md). Źródła do portu: [_source/](_source/) (gitignored, lokalne).

## Twarde reguły (obowiązują dla edycji skryptu i nowych skilli)
- Skrypt: **Node.js ESM (`.mjs`)**, bez zależności npm (natywny `fetch`, `child_process`). Ścieżki przez `import.meta.url`, nie `process.cwd()`.
- SKILL.md: frontmatter minimalny (`name`/`description`/`metadata.version`), **UTF-8 BEZ BOM** (inaczej Codex nie widzi skilla). Bez pól Claude-only (`allowed-tools`/`Hooks`/`context:`).
- Logika parsowania CodeRabbit była żmudnie dopracowana — przy zmianach pilnuj: severity/effort bez `\b` (emoji astralne psują word-boundary, używaj separatorów `[_|\s]`), autor "Code Rabbit" ze spacją (normalizuj whitespace), `autoFixable` wymaga `isInline`.
- Sekrety per-osoba (`BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN`, Atlassian API token NIE app password). Nigdy nie commituj `.env`.
- Repo wieloskillowe: nowy skill = nowy `skills/<name>/`, zero refaktoru.

## Destrukcyjne / outward-facing — potwierdź z właścicielem
- Zdalne repo GitHub: `MobileReality/mobile-reality-skills` (public + MIT). Uwaga: org GitHub to `MobileReality`, a workspace Bitbucket w skrypcie to `mobilereality` — to dwie różne rzeczy.
- Usunięcie `mobile-reality-site-v2/scripts/coderabbit-fetch.ps1` (Faza 6) — dopiero po zielonej Fazie 5.
