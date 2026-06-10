# START HERE — agent-skills

Repo dystrybucyjny skilli dla zespołu (Claude Code + Codex, cross-platform).

## Dla agenta wykonującego (nowa sesja Claude Code / Codex)

Pełny, samowystarczalny plan: [.claude/plans/coderabbit-skill-team-distribution.md](.claude/plans/coderabbit-skill-team-distribution.md).
Wykonuj fazy po kolei. Każda faza ma kryteria akceptacji — nie idź dalej, póki niespełnione.

### Stan na teraz (co już zrobione)
- **Faza 1 (częściowo)**: struktura katalogów `skills/coderabbit-fix/scripts/` utworzona lokalnie.
  Repo GitHub `mobilereality/agent-skills` jeszcze NIE utworzone (wymaga decyzji właściciela:
  public vs team-private) — to pierwszy krok Fazy 1 do dokończenia.
- Pliki źródłowe (source of truth) skopiowane do [_source/](_source/), żeby nie zależeć
  cross-repo od `mobile-reality-site-v2`:
  - [_source/coderabbit-fetch.ps1](_source/coderabbit-fetch.ps1) — oryginał PowerShell do portu (Faza 2).
  - [_source/SKILL.original.md](_source/SKILL.original.md) — oryginalny SKILL.md do adaptacji (Faza 3).

### Następne kroki (TODO dla wykonawcy)
1. **Faza 1** — utwórz repo GitHub `mobilereality/agent-skills` (potwierdź public/private + LICENSE z właścicielem), `git init` tutaj, wypchnij szkielet.
2. **Faza 2** — port `_source/coderabbit-fetch.ps1` → `skills/coderabbit-fix/scripts/coderabbit-fetch.mjs` (Node ESM). Najtrudniejsza faza — odtwórz logikę parsowania 1:1. Test parytetu na realnym PR.
3. **Faza 3** — adaptuj `_source/SKILL.original.md` → `skills/coderabbit-fix/SKILL.md` (przenośny frontmatter, komendy `node scripts/...`, sekcja Codex setup, UTF-8 BEZ BOM).
4. **Faza 4** — `README.md` repo (wieloskillowy, instrukcja zespołu).
5. **Faza 5** — walidacja cross-platform × cross-agent.
6. **Faza 6** — sprzątanie repo źródłowego `mobile-reality-site-v2`.

### Pułapki — patrz checklista na końcu planu (każda już raz ugryzła).

## Docelowa struktura
```
agent-skills/
  skills/
    coderabbit-fix/
      SKILL.md                 # Faza 3
      scripts/
        coderabbit-fetch.mjs   # Faza 2
  README.md                    # Faza 4
  LICENSE                      # Faza 1 (potwierdź typ)
```
