# Plan: dystrybucja skilla `coderabbit-fix` do zespołu (cross-platform, Claude Code + Codex)

> **Dla agenta wykonującego:** Ten plan jest samowystarczalny. Wykonaj fazy po kolei.
> Każda faza ma kryteria akceptacji — nie przechodź dalej, dopóki nie są spełnione.
> Pochodzenie: obecny skill działa tylko na Windows (PowerShell, w gitignorowanym
> `.claude/`). Cel: zespół (Windows + macOS + Ubuntu) instaluje go przez `npx skills`
> i używa w Claude Code ORAZ Codex. Repo źródłowe: Bitbucket Cloud (NIE GitHub) —
> to jedyny powód istnienia tego skilla (oficjalne tooling CodeRabbit jest GitHub-only).

---

## Decyzje już podjęte (NIE zmieniaj)

1. **Host repo skilli:** GitHub, repo `mobilereality/agent-skills` (publiczne lub team-private).
   `npx skills` natywnie obsługuje GitHub jako registry.
2. **Sekrety per-osoba:** każdy członek zespołu ma własny `BITBUCKET_EMAIL` +
   `BITBUCKET_API_TOKEN` (Atlassian API token, NIE app password). Nie ma współdzielonego sekretu.
3. **Runtime:** skrypt przepisany z PowerShell na **Node.js** (`.mjs`, ESM). Node jest już
   wymogiem repo `mobile-reality-site-v2` (engines 18.x) — zespół go ma. Brak `pwsh` na mac/Ubuntu.
4. **Repo wieloskillowe od początku** — struktura `skills/<name>/` tak, by dodanie kolejnego
   skilla w przyszłości = nowy podfolder, zero refaktoru.
5. **macOS + Codex:** akceptowalne, że wymaga `--sandbox danger-full-access` (patrz Faza 6,
   ograniczenie sandboxa Codexa na macOS). Rekomendacja w docs: na macOS preferuj Claude Code.

---

## Tło techniczne (must-read przed Fazą 2)

### Konwencja `npx skills` (vercel-labs/skills)
- Registry = sam GitHub. `npx skills add <org/repo>` skanuje folder `skills/` w repo i znajduje
  każdy `SKILL.md`. Brak manifestu/`skills.json` — discovery jest filesystemowe.
- Instaluje **cały folder skilla** (SKILL.md + skrypty) do katalogu agenta.
- Cel instalacji uniwersalny dla obu agentów: **`.agents/skills/<name>/`** (repo-local) lub
  `~/.agents/skills/<name>/` (global). Działa i dla Claude Code, i dla Codex.
- Update: `npx skills update [name]`. Brak lockfile / version-pin — ciągnie z domyślnego brancha.

### Codex — natywnie czyta SKILL.md (od grudnia 2025), ALE sandbox ma 3 pułapki:
1. **Sieć zablokowana domyślnie** (`workspace-write`). Skrypt woła `api.bitbucket.org` → padnie.
   Fix usera w `~/.codex/config.toml`: `[sandbox_workspace_write] network_access = true`.
   **macOS:** ten config jest cicho IGNOROWANY (bug Seatbelt) → mac user musi użyć
   `codex --sandbox danger-full-access`. Linux/Windows: config działa.
2. **Token env strippowany:** Codex usuwa zmienne z `TOKEN`/`KEY`/`SECRET` w nazwie przed
   odpaleniem subprocesu. `BITBUCKET_API_TOKEN` pasuje do `*TOKEN*` → wycięty. `BITBUCKET_EMAIL`
   przechodzi. Fix usera w `~/.codex/config.toml`:
   ```toml
   [shell_environment_policy]
   ignore_default_excludes = true
   include_only = ["PATH", "HOME", "BITBUCKET_EMAIL", "BITBUCKET_API_TOKEN"]
   ```
3. **BOM bug:** Codex nie wykrywa frontmattera w SKILL.md zapisanym jako UTF-8 **z BOM**.
   → SKILL.md MUSI być zapisany UTF-8 **bez BOM**.

### Frontmatter — przenośność
- `name` + `description` = przenośne (Claude Code + Codex). Codex ignoruje nieznane pola po cichu.
- NIE dodawaj `allowed-tools`, `context: fork`, `Hooks` — Claude-Code-only, Codex je ignoruje
  (`allowed-tools`) lub nie wspiera. Trzymaj frontmatter minimalny + `metadata.version`.

---

## FAZA 1 — Utworzenie repo dystrybucyjnego

**Cel:** repo `mobilereality/agent-skills` na GitHub ze strukturą wieloskillową.

1. Utwórz repo GitHub `mobilereality/agent-skills` (potwierdź z właścicielem czy public czy
   team-private; `npx skills` obsługuje oba, private wymaga `gh auth` u userów).
2. Struktura:
   ```
   agent-skills/
     skills/
       coderabbit-fix/
         SKILL.md                    # Faza 3
         scripts/
           coderabbit-fetch.mjs      # Faza 2
     README.md                       # Faza 5
     LICENSE                         # MIT lub firmowa — potwierdź
   ```
3. NIE kopiuj jeszcze plików — kolejne fazy je tworzą. Ta faza to tylko repo + szkielet katalogów.

**Akceptacja:** repo istnieje, pusta struktura `skills/coderabbit-fix/scripts/` wypchnięta.

---

## FAZA 2 — Port skryptu PowerShell → Node.js (`coderabbit-fetch.mjs`)

**Cel:** wierny port `scripts/coderabbit-fetch.ps1` (z repo `mobile-reality-site-v2`) na Node ESM.
To najważniejsza i najtrudniejsza faza. Logika parsowania była żmudnie dopracowana — **odtwórz ją 1:1**.

**Źródło prawdy:** `mobile-reality-site-v2/scripts/coderabbit-fetch.ps1` (przeczytaj cały).

### Wymogi funkcjonalne (parytet z .ps1)

Skrypt: `node scripts/coderabbit-fetch.mjs [--pr <n>] [--out <file>] [--include-minor]`

1. **Auth:** czytaj `process.env.BITBUCKET_EMAIL` + `process.env.BITBUCKET_API_TOKEN`.
   - Fallback: jeśli brak w env, spróbuj `.env` w bieżącym repo root (parsuj `KEY=VALUE`).
     Powód: Codex strippuje `*TOKEN*` z env → `.env` to obejście, gdy user nie skonfiguruje
     `shell_environment_policy`. NIE czytaj Windows User-scope (to było PS-only).
   - Basic auth: `Buffer.from(`${email}:${token}`).toString('base64')`.
   - **Samodiagnozujący błąd:** gdy brak tokena lub email → wypisz na stderr czytelny komunikat:
     ```
     Missing BITBUCKET_EMAIL or BITBUCKET_API_TOKEN.
     - If running under Codex: the sandbox strips *TOKEN* env vars by default.
       See "Codex setup" in SKILL.md (shell_environment_policy allowlist), or put
       them in a .env file at repo root.
     - Generate token: https://id.atlassian.com/manage-profile/security/api-tokens
       (Bitbucket app, scopes: read:pullrequest, write:pullrequest, read:repository)
     ```
     i `process.exit(1)`.

2. **Stałe:** `Workspace = 'mobilereality'`, `Repo = 'mobile-reality-site-v2'`,
   `ApiBase = https://api.bitbucket.org/2.0/repositories/${Workspace}/${Repo}`.
   (Rozważ uczynienie ich `--workspace`/`--repo` flagami lub env — ale domyślne muszą zostać te.)

3. **Resolve PR z brancha** (gdy brak `--pr`): `git rev-parse --abbrev-ref HEAD` (przez
   `child_process.execFileSync`), potem GET
   `${ApiBase}/pullrequests?q=<escaped>&fields=values.id,...` z filtrem
   `source.branch.name="<branch>" AND state="OPEN"`. URL-encode query. Gdy 0 wyników → błąd
   "No open PR for branch, pass --pr". Gdy >1 → warning, weź pierwszy.

4. **Fetch komentarzy:** paginuj `${ApiBase}/pullrequests/${pr}/comments?pagelen=100`,
   podążaj za `page.next` aż null. Użyj natywnego `fetch()` (Node 18+).

5. **Filtr CodeRabbit** (KRYTYCZNE — tu był główny bug):
   - Autor bota to **"Code Rabbit" ZE SPACJĄ** (display_name i nickname). Normalizuj:
     usuń whitespace z `display_name + nickname`, potem test `/coderabbit/i`.
   - Odrzuć `deleted === true` i odpowiedzi (`parent` istnieje).

6. **Parsowanie findingu** (odtwórz dokładnie z .ps1, linie ~132-222):

   - **Severity:** nagłówek CR to `_⚠️ Potential issue_ | _🟠 Major_ | _⚡ Quick win_`.
     Severity w markdown italic, PO emoji. **NIE używaj `\b`** — emoji (znaki astralne) psują
     word-boundary w regex (to był realny bug, potwierdzony testem). Zamiast tego wymagaj
     separatora wokół słowa: dla każdego z `['Critical','Major','Nitpick','Minor']` (w tej
     kolejności, najwyższy wygrywa, break na pierwszym trafieniu):
     `new RegExp(`(?:^|[_|\\s])${cand}(?:[_|\\s]|$)`, 'i').test(body)`. Domyślnie `'Minor'`.

   - **Effort:** w nagłówku `_⚡ Quick win_` (małe "w"). Brak literalnego "Effort:".
     Jeśli `body` matchuje `/quick\s+(?:win|fix)/i` → `'Quick Win'`, w przeciwnym razie
     `'Heavy Lift'`. (Fallback na stary `Effort:\s*(Quick Win|Heavy Lift)` opcjonalny.)
     **Bez `\b`** (ten sam problem astralny).

   - **Suggestion/diff:** preferuj ```` ```suggestion\n(...)\n``` ````; jak brak, spróbuj
     ```` ```diff\n(...)\n``` ````. Regex z flagą `s` (dotall): `/```suggestion\s*\r?\n([\s\S]*?)\r?\n```/`.

   - **Title:** prawdziwy tytuł jest w pierwszej linii `**bold**` (pierwsza fizyczna linia to
     nagłówek severity/effort). Regex `/^\s*\*\*(.+?)\*\*\s*$/m` → grupa 1. Fallback: pierwsza
     znacząca linia, pomijając nagłówek (linie z `Potential issue|Refactor suggestion|Minor|
     Major|Critical|Nitpick`, `quick win/fix`, `prompt for`, `in reply to`, puste/`>`/`#`).
     Gdy brak → `'(no title parsed)'`. Przytnij do 140 znaków (137 + '...').

   - **isInline:** `Boolean(comment.inline)`.

   - **autoFixable** (KRYTYCZNE — był fałszywy pozytyw): `isInline && severity ∈ {Critical,Major}
     && effort === 'Quick Win'`. **Musi wymagać `isInline`** — PR-level summary cytuje cudze
     badge'e severity i bez tego guardu fałszywie udaje Quick Win bez lokalizacji.

   - Pola wynikowe findingu: `{ id, severity, effort, autoFixable, path: comment.inline?.path ?? null,
     line: comment.inline?.to ?? comment.inline?.from ?? null, side: comment.inline?.to ? 'new':'old',
     title, body, suggestion, url, isInline }`.
     `url = https://bitbucket.org/${Workspace}/${Repo}/pull-requests/${pr}#comment-${id}`.

7. **Filtr severity:** bez `--include-minor` → tylko `Critical` + `Major`.

8. **Sortowanie:** severity (Critical>Major>Minor>Nitpick), potem Quick Win przed Heavy Lift,
   potem path, line.

9. **Output:** obiekt `{ prId, fetchedAt: new Date().toISOString(), counts: {total, critical,
   major, minor, nitpick, autoFixable, heavyLift}, findings: [...] }`.
   `heavyLift` count = severity ∈ {Critical,Major} && effort === 'Heavy Lift'.
   Zapis: `--out <file>` → `fs.writeFileSync(file, json, 'utf8')` (BEZ BOM); inaczej stdout.
   `JSON.stringify(out, null, 2)`.

### Wymogi cross-platform
- **Ścieżki przez `import.meta.url`**, nie `process.cwd()` — cwd nie jest gwarantowany po
  instalacji skilla (gotcha Codex i Claude Code). Jeśli skrypt musi znaleźć pliki obok siebie,
  użyj `fileURLToPath(import.meta.url)`.
- Brak shebangów `.sh`, brak bash-izmów. Czysty `node`.
- `git` wywołuj przez `execFileSync('git', [...])` z obsługą braku gita/brancha.

### Test parytetu (kryterium akceptacji Fazy 2)
- Odpal port na realnym PR: `node scripts/coderabbit-fetch.mjs --pr 2334 --include-minor --out /tmp/node.json`.
- Odpal oryginał: `.\scripts\coderabbit-fetch.ps1 -PrId 2334 -IncludeMinor -OutFile $tmp` (Windows).
- **Porównaj JSON:** muszą się zgadzać te same findingi, severity, effort, autoFixable, counts.
  Oczekiwany stan PR #2334 (na moment pisania): `total=4, major=2, minor=2, autoFix=1`, w tym
  `content-sanitizer.js:53` = Major/Quick Win/autoFix=true/inline=true,
  `docs/CM_MODULE_AI_EDITOR.md:420` = Minor/Quick Win/inline=true,
  "Actionable comments posted: 2" = inline=false/autoFix=false,
  "Content Sanitization..." walkthrough = Minor/Heavy Lift/inline=false.
  (Stan PR mógł się zmienić — kluczowe jest że port daje TEN SAM wynik co .ps1 na tym samym PR.)

**Akceptacja:** `coderabbit-fetch.mjs` daje identyczny wynik jak `.ps1` na PR #2334.
Działa na `node` bez dodatkowych zależności npm.

---

## FAZA 3 — SKILL.md (przenośny, Claude Code + Codex)

**Cel:** zaadaptuj istniejący `mobile-reality-site-v2/.claude/skills/coderabbit-fix/SKILL.md`
do nowej lokalizacji skryptu i obu agentów.

**Źródło:** przeczytaj obecny `SKILL.md` (kroki 1-6 + Notes). Zachowaj logikę kroków
(Preconditions, fetch, summary table, Quick Win fix loop, Heavy Lift report, verify, stop).

### Zmiany do naniesienia
1. **Frontmatter** — minimalny + wersja, bez pól Claude-only:
   ```yaml
   ---
   name: coderabbit-fix
   description: <zachowaj istniejący opis + triggery>
   metadata:
     version: "1.0.0"
   ---
   ```
2. **Wszystkie wywołania skryptu:** `.\scripts\coderabbit-fetch.ps1 ...` →
   `node scripts/coderabbit-fetch.mjs --pr <n> --out <file>` (shell-neutral, działa wszędzie).
   Ścieżka relatywna do folderu skilla.
3. **Sekcja Preconditions** — dodaj env + Node:
   - Node.js 20+ (rozsądny floor; natywny fetch jest od 18, ale 20 to LTS).
   - `BITBUCKET_EMAIL` + `BITBUCKET_API_TOKEN` (Atlassian API token, nie app password).
     Przykłady ustawienia shell-neutralnie (bash export + PowerShell `$env:`).
4. **NOWA sekcja "Codex setup"** (po Preconditions) — dokładne instrukcje dla userów Codex:
   ```
   Codex runs scripts in a sandbox that by default (a) blocks network and
   (b) strips *TOKEN* env vars. Before first use under Codex, add to ~/.codex/config.toml:

     [sandbox_workspace_write]
     network_access = true            # Linux/Windows; IGNORED on macOS (see below)

     [shell_environment_policy]
     ignore_default_excludes = true
     include_only = ["PATH", "HOME", "BITBUCKET_EMAIL", "BITBUCKET_API_TOKEN"]

   macOS: network_access is silently ignored by the Seatbelt sandbox. Run with
     codex --sandbox danger-full-access
   (full host access for that session — acceptable for this read-only script, but
   on macOS prefer Claude Code for this skill, which has no such limitation).

   Alternatively (any agent): put BITBUCKET_EMAIL/BITBUCKET_API_TOKEN in a .env
   file at repo root — the script reads it as a fallback.
   ```
5. **Notes** — zaktualizuj: zostaw "Bitbucket Cloud only", "API token not app password",
   "Minor+Nitpick filtered by default (--include-minor)", "PR-level summaries isInline=false
   informational". Dodaj: "Outside-diff-range CR findings are packed into the PR-level summary
   comment — they are real but not inline; surface them in the Heavy Lift / informational section."
6. **Zapis pliku: UTF-8 BEZ BOM** (Codex BOM bug). Zweryfikuj po zapisie (patrz Faza 5).

**Akceptacja:** SKILL.md w `skills/coderabbit-fix/`, frontmatter przenośny, wszystkie komendy
to `node scripts/...`, sekcja Codex setup obecna, plik bez BOM.

---

## FAZA 4 — README repo (wieloskillowe, instrukcja dla zespołu)

**Cel:** `agent-skills/README.md` — punkt wejścia dla zespołu, gotowy na kolejne skille.

Zawartość:
1. **Available skills** — tabela (rozszerzalna): `| Skill | Description | Agents |`
   wiersz: `coderabbit-fix | Fetch & fix CodeRabbit Bitbucket PR comments | Claude Code, Codex`.
2. **Install** (oba agenty jednym poleceniem):
   ```bash
   # macOS / Linux
   npx skills add mobilereality/agent-skills -a claude-code -a codex
   # Windows (symlink bywa problematyczny → --copy)
   npx skills add mobilereality/agent-skills -a claude-code -a codex --copy
   ```
   Wybiórczo jeden skill: `-s coderabbit-fix`. Global: `-g`.
3. **First-time setup** — env vars per-osoba:
   - jak wygenerować Atlassian API token (link, scopes),
   - ustawienie `BITBUCKET_EMAIL`/`BITBUCKET_API_TOKEN` (bash + PowerShell),
   - **Codex extra setup** (link do sekcji w SKILL.md / skrót config.toml).
4. **Update:** `npx skills update coderabbit-fix` (lub bez nazwy = wszystkie).
5. **Platform/agent matrix** (tabela poniżej z planu — Faza 6).
6. **Adding a new skill** (dla przyszłości): "utwórz `skills/<name>/SKILL.md` (+ opcjonalnie
   `scripts/`), commit, push. Userzy: `npx skills update`." 

**Akceptacja:** README kompletny, instrukcja instalacji testowalna, sekcja "adding a new skill" obecna.

---

## FAZA 5 — Walidacja cross-platform × cross-agent

**Cel:** potwierdzić działanie na realnej matrycy. To NIE formalność — tu wychodzą różnice.

Minimalna matryca (znajdź po jednym wykonawcy na OS, jeśli nie masz dostępu do wszystkich):

| | Claude Code | Codex |
|---|---|---|
| **Windows** | T1 | T2 |
| **macOS** | T3 | T4 (danger-full-access) |
| **Ubuntu** | T5 | T6 |

Dla każdej komórki:
1. `npx skills add mobilereality/agent-skills -a <agent> [--copy na Win]` — instalacja przechodzi.
2. Skill widoczny dla agenta (Claude Code: `/coderabbit-fix`; Codex: `/skills` lub `$coderabbit-fix`).
   **Jeśli Codex nie widzi skilla → sprawdź BOM w SKILL.md (najczęstsza przyczyna).**
3. Env vars ustawione; pod Codex dodatkowo config.toml (sieć + token allowlist).
4. Fetch na realnym otwartym PR (np. #2334) zwraca findingi (nie 0, nie auth error).
5. Pełny przepływ: summary → wybór Quick Win → fix → lint. Bez błędów ścieżek/runtime.

**Krytyczny przypadek: T4 (Codex/macOS).** Potwierdź że `danger-full-access` faktycznie
przepuszcza ruch do Bitbucket i że instrukcja w SKILL.md jest poprawna. Jeśli nie działa nawet
z danger mode — zgłoś to (może wymagać innego workaroundu) i odnotuj w README że na macOS
Codex jest niewspierany, użyj Claude Code.

**Akceptacja:** wszystkie dostępne komórki matrycy zielone; ograniczenia (macOS/Codex)
udokumentowane w README zgodnie z rzeczywistością.

---

## FAZA 6 — Sprzątanie repo źródłowego `mobile-reality-site-v2`

**Cel:** uniknąć dwóch rozjeżdżających się implementacji.

1. Po zielonej Fazie 5: usuń `mobile-reality-site-v2/scripts/coderabbit-fetch.ps1`
   (lub zostaw z nagłówkiem "DEPRECATED — see mobilereality/agent-skills" jeśli zespół
   jeszcze w trakcie migracji — decyzja właściciela).
2. Stary `.claude/skills/coderabbit-fix/SKILL.md` w tym repo jest gitignorowany i lokalny —
   może zostać dla ciebie lokalnie, ale źródłem prawdy jest teraz repo `agent-skills`.
3. Zaktualizuj wszelkie odwołania (jeśli istnieją) w dokumentacji repo do nowej lokalizacji.

**Akceptacja:** brak zduplikowanej, aktywnej implementacji skryptu; jedno źródło prawdy = `agent-skills`.

---

## Macierz docelowa (do README)

| | Windows | macOS | Ubuntu |
|---|---|---|---|
| **Claude Code** | ✓ | ✓ | ✓ |
| **Codex** | ✓ (config.toml) | ⚠️ wymaga `danger-full-access`; preferuj Claude Code | ✓ (config.toml) |

---

## Pułapki — checklista (z których każda już raz ugryzła)

- [ ] Autor CR to **"Code Rabbit" ze spacją** — filtr bez normalizacji whitespace = 0 findingów.
- [ ] Severity/effort w **markdown italic z emoji** — `\b` w regex zawodzi na znakach astralnych.
      Używaj separatorów `[_|\s]`, nie `\b`.
- [ ] `autoFixable` **musi wymagać `isInline`** — inaczej PR-level summary fałszywie udaje Quick Win.
- [ ] SKILL.md **UTF-8 bez BOM** — inaczej Codex nie widzi skilla wcale.
- [ ] Codex sandbox: **sieć off** + **token env stripped** domyślnie — bez config userzy dostaną
      auth/network error. Skrypt musi dać samodiagnozujący komunikat.
- [ ] Ścieżki w skrypcie przez `import.meta.url`, nie `process.cwd()`.
- [ ] Windows install: `--copy` (symlink bywa zablokowany bez Developer Mode/admin).
- [ ] Frontmatter: tylko `name`/`description`/`metadata.version`. Bez `allowed-tools`/`Hooks`/`context:fork`.

---

## Referencje
- skills CLI: https://github.com/vercel-labs/skills
- Reference repo (struktura): https://github.com/coderabbitai/skills
- Codex skills: https://developers.openai.com/codex/skills
- Codex sandbox: https://developers.openai.com/codex/concepts/sandboxing
- Codex config: https://developers.openai.com/codex/config-reference
- Bitbucket Cloud + CR: https://docs.coderabbit.ai/platforms/bitbucket-cloud
- Atlassian API tokens: https://id.atlassian.com/manage-profile/security/api-tokens
- Bugi Codexa: macOS network #10390/#13373, BOM frontmatter #13918
