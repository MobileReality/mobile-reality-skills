# CLAUDE.md — agent-skills

Repo dystrybucyjny skilli dla zespołu (Claude Code + Codex; Windows/macOS/Ubuntu).
Instalacja przez `npx skills` (vercel-labs/skills), discovery filesystemowe po `skills/<name>/SKILL.md`.

## Zanim zaczniesz
- Przeczytaj [START-HERE.md](START-HERE.md) (stan + następne kroki).
- Pełny plan wykonania: [.claude/plans/coderabbit-skill-team-distribution.md](.claude/plans/coderabbit-skill-team-distribution.md) — wykonuj fazy po kolei, każda ma kryteria akceptacji.
- Źródła prawdy do portu: [_source/](_source/) (oryginalny `.ps1` + `SKILL.md` z `mobile-reality-site-v2`).

## Twarde reguły (z planu)
- Skrypt: **Node.js ESM (`.mjs`)**, bez zależności npm (natywny `fetch`, `child_process`). Ścieżki przez `import.meta.url`, nie `process.cwd()`.
- SKILL.md: frontmatter minimalny (`name`/`description`/`metadata.version`), **UTF-8 BEZ BOM** (inaczej Codex nie widzi skilla).
- Logikę parsowania z `.ps1` odtwórz **1:1** — była żmudnie dopracowana (severity/effort bez `\b` przez emoji, autor "Code Rabbit" ze spacją, `autoFixable` wymaga `isInline`).
- Sekrety per-osoba (`BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN`, Atlassian API token NIE app password). Nigdy nie commituj `.env`.
- Repo wieloskillowe od początku: nowy skill = nowy `skills/<name>/`, zero refaktoru.

## Destrukcyjne / outward-facing — potwierdź z właścicielem
- Utworzenie repo GitHub `mobilereality/agent-skills` (public vs private), wybór LICENSE.
- `git push` do zdalnego.
- Usunięcie `mobile-reality-site-v2/scripts/coderabbit-fetch.ps1` (Faza 6) — dopiero po zielonej Fazie 5.
