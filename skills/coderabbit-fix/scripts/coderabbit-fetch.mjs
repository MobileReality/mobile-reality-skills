// Fetch CodeRabbit comments from a Bitbucket Cloud PR and classify them.
//
// Reads BITBUCKET_EMAIL + BITBUCKET_API_TOKEN (Atlassian API token, NOT app
// password). Paginates /pullrequests/{id}/comments, filters to the CodeRabbit
// author, parses severity + effort from each comment body, emits JSON.
//
// Usage: node coderabbit-fetch.mjs [--pr <n>] [--out <file>] [--include-minor]
//   --pr <n>          PR number. If omitted, resolves from current git branch.
//   --out <file>      Path to write JSON. Default: stdout.
//   --include-minor   Include Minor + Nitpick. Default: only Critical + Major.
//
// No npm dependencies — native fetch (Node 18+) + child_process only.
// Pure node, no shebang, no bash-isms; runs on Windows/macOS/Ubuntu.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ---- Arg parsing ----
function parseArgs(argv) {
  const out = { pr: 0, out: null, includeMinor: false, workspace: null, repo: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pr') {
      out.pr = parseInt(argv[++i], 10) || 0;
    } else if (a === '--out') {
      out.out = argv[++i] ?? null;
    } else if (a === '--workspace') {
      out.workspace = argv[++i] ?? null;
    } else if (a === '--repo') {
      out.repo = argv[++i] ?? null;
    } else if (a === '--include-minor') {
      out.includeMinor = true;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    } else {
      die(`Unknown argument: ${a}`);
    }
  }
  return out;
}

function die(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

// ---- Resolve target Bitbucket workspace + repo ----
// Precedence: --workspace/--repo flags > BITBUCKET_WORKSPACE/BITBUCKET_REPO env
// > parsed from the `origin` git remote (zero-config when the repo lives on
// Bitbucket). No hardcoded default — this skill is shared across teams, so a
// wrong default would silently query the wrong repo. If none resolve, error.
function parseBitbucketRemote() {
  let url;
  try {
    // stdio: silence git's stderr — "not a git repository" is an expected,
    // recoverable miss here (we fall through to the error message), not noise
    // the user should see.
    url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
  // Forms: git@bitbucket.org:ws/repo.git
  //        https://user@bitbucket.org/ws/repo.git
  //        ssh://git@bitbucket.org/ws/repo.git
  const m = url.match(/bitbucket\.org[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  return { workspace: m[1], repo: m[2] };
}

function resolveTarget(args) {
  let workspace = args.workspace || process.env.BITBUCKET_WORKSPACE || null;
  let repo = args.repo || process.env.BITBUCKET_REPO || null;

  if (!workspace || !repo) {
    const fromRemote = parseBitbucketRemote();
    if (fromRemote) {
      if (!workspace) workspace = fromRemote.workspace;
      if (!repo) repo = fromRemote.repo;
    }
  }

  if (!workspace || !repo) {
    die(
      [
        'Could not determine Bitbucket workspace/repo.',
        'Provide them one of these ways (highest precedence first):',
        '  - flags:  --workspace <ws> --repo <repo>',
        '  - env:    BITBUCKET_WORKSPACE=<ws>  BITBUCKET_REPO=<repo>',
        "  - or run from a clone whose 'origin' remote points at bitbucket.org/<ws>/<repo>",
      ].join('\n')
    );
  }
  const apiBase = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}`;
  return { workspace, repo, apiBase };
}

// ---- .env fallback ----
// Codex strips *TOKEN* env vars before running subprocesses, so a .env file at
// the repo root is the escape hatch when a user hasn't configured
// shell_environment_policy. Path is anchored to the script location via
// import.meta.url (cwd is not guaranteed after a skill install), walking up to
// find a .env. We do NOT read Windows User-scope env — that was PS-only.
function loadDotEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [];
  let dir = here;
  for (let i = 0; i < 8; i++) {
    candidates.push(join(dir, '.env'));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Also try cwd as a last resort (user may run from their repo root).
  candidates.push(join(process.cwd(), '.env'));

  const env = {};
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      // Strip surrounding quotes.
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in env)) env[key] = val;
    }
    break; // first .env found wins
  }
  return env;
}

// ---- Auth ----
function resolveAuth() {
  let email = process.env.BITBUCKET_EMAIL;
  let token = process.env.BITBUCKET_API_TOKEN;

  if (!email || !token) {
    const dotenv = loadDotEnv();
    if (!email && dotenv.BITBUCKET_EMAIL) email = dotenv.BITBUCKET_EMAIL;
    if (!token && dotenv.BITBUCKET_API_TOKEN) token = dotenv.BITBUCKET_API_TOKEN;
  }

  if (!email || !token) {
    die(
      [
        'Missing BITBUCKET_EMAIL or BITBUCKET_API_TOKEN.',
        '- If running under Codex: the sandbox strips *TOKEN* env vars by default.',
        '  See "Codex setup" in SKILL.md (shell_environment_policy allowlist), or put',
        '  them in a .env file at repo root.',
        '- Generate token: https://id.atlassian.com/manage-profile/security/api-tokens',
        '  (Bitbucket app, scopes: read:pullrequest, write:pullrequest, read:repository)',
      ].join('\n')
    );
  }

  const basic = Buffer.from(`${email}:${token}`).toString('base64');
  return {
    Authorization: `Basic ${basic}`,
    Accept: 'application/json',
  };
}

// ---- HTTP ----
async function apiGet(url, headers, context) {
  let resp;
  try {
    resp = await fetch(url, { method: 'GET', headers });
  } catch (e) {
    die(`Bitbucket API error ${context}: ${e.message}`);
  }
  if (!resp.ok) {
    let detail = '';
    try {
      detail = (await resp.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    die(`Bitbucket API error ${context}: HTTP ${resp.status} ${resp.statusText}\n${detail}`);
  }
  try {
    return await resp.json();
  } catch (e) {
    die(`Bitbucket API error ${context}: invalid JSON response: ${e.message}`);
  }
}

// ---- Resolve PR from branch ----
async function resolvePrFromBranch(headers, apiBase) {
  let branch;
  try {
    branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'], // silence git's stderr; we give our own message
    }).trim();
  } catch {
    die('Not in a git repo or git unavailable. Pass --pr explicitly.');
  }
  if (!branch || branch === 'HEAD') {
    die('Not on a branch (detached HEAD). Pass --pr explicitly.');
  }
  const escaped = encodeURIComponent(`source.branch.name="${branch}" AND state="OPEN"`);
  const url = `${apiBase}/pullrequests?q=${escaped}&fields=values.id,values.title,values.source.branch.name`;
  const resp = await apiGet(url, headers, `resolving PR for branch '${branch}'`);
  if (!resp.values || resp.values.length === 0) {
    die(`No open PR found for branch '${branch}'. Pass --pr.`);
  }
  if (resp.values.length > 1) {
    process.stderr.write(
      `Warning: multiple open PRs for branch '${branch}'; using first: #${resp.values[0].id}\n`
    );
  }
  return parseInt(resp.values[0].id, 10);
}

// ---- Paginate comments ----
async function fetchAllComments(prId, headers, apiBase) {
  const all = [];
  let url = `${apiBase}/pullrequests/${prId}/comments?pagelen=100`;
  while (url) {
    const page = await apiGet(url, headers, 'fetching comments');
    if (page.values) all.push(...page.values);
    url = page.next || null;
  }
  return all;
}

// ---- CodeRabbit filter ----
// The bot's display_name / nickname is "Code Rabbit" (WITH a space), so a plain
// 'coderabbit' match misses it. Normalize by stripping whitespace before
// testing. CodeRabbit on Bitbucket runs as a self-managed service account whose
// account_id is installation-specific and does NOT contain "coderabbit"; supply
// it via CODERABBIT_ACCOUNT_ID to match a service account renamed away from
// "Code Rabbit". Unset → name match only.
function isCodeRabbit(user, crAccountId) {
  if (!user) return false;
  if (crAccountId && user.account_id) {
    if (String(user.account_id).trim().toLowerCase() === crAccountId.trim().toLowerCase()) {
      return true;
    }
  }
  const name = `${user.display_name ?? ''}${user.nickname ?? ''}`.replace(/\s/g, '');
  return /coderabbit/i.test(name);
}

// ---- Parse one finding ----
function parseFinding(comment, prId, workspace, repo) {
  const body = comment.content?.raw;
  if (!body) return null;

  // CodeRabbit's actual header line looks like:
  //   _⚠️ Potential issue_ | _🟠 Major_ | _⚡ Quick win_
  // Severity sits inside markdown italics, AFTER an emoji. We must NOT use \b —
  // the surrounding emoji (astral chars) make \b-anchored matches fail. Instead
  // require the severity word flanked by a separator (_ | space) or boundary.
  // Highest severity wins.
  let severity = 'Minor';
  for (const cand of ['Critical', 'Major', 'Nitpick', 'Minor']) {
    if (new RegExp(`(?:^|[_|\\s])${cand}(?:[_|\\s]|$)`, 'i').test(body)) {
      severity = cand;
      break;
    }
  }

  // Effort lives in the italic header, e.g. "_⚡ Quick win_" (lower-case w).
  // CodeRabbit prints no literal "Effort:" label. "Quick win/fix" → Quick Win;
  // everything else stays Heavy Lift so it routes to the decision report.
  // No \b — same astral-char boundary problem as severity.
  let effort = 'Heavy Lift';
  if (/quick\s+(?:win|fix)/i.test(body)) {
    effort = 'Quick Win';
  } else {
    // Legacy/explicit label form, kept as a fallback.
    const em = body.match(/Effort(?:\s+to\s+fix)?\**\s*[:：]\s*\**(Quick Win|Heavy Lift)/im);
    if (em) effort = em[1];
  }

  // Concrete patch: prefer a ```suggestion block (literal replacement) over a
  // ```diff block (illustrative).
  let suggestion = null;
  const sm = body.match(/```suggestion\s*\r?\n([\s\S]*?)\r?\n```/);
  if (sm) {
    suggestion = sm[1];
  } else {
    const dm = body.match(/```diff\s*\r?\n([\s\S]*?)\r?\n```/);
    if (dm) suggestion = dm[1];
  }

  // Title: the real headline is on the first **bold** line (the first physical
  // line is the severity/effort header). Prefer that; otherwise fall back to the
  // first meaningful non-header line.
  let title = null;
  const bm = body.match(/^\s*\*\*(.+?)\*\*\s*$/m);
  if (bm) {
    title = bm[1].trim();
  } else {
    const lines = body.split('\n');
    for (const ln of lines) {
      const t = ln.trim();
      if (!t) continue;
      if (/^[\s>#]*$/.test(ln)) continue;
      if (/^_?(prompt for|in reply to)/i.test(ln)) continue;
      if (/^_[^_]*\b(?:Potential issue|Refactor suggestion|Minor|Major|Critical|Nitpick)\b/.test(ln)) continue;
      if (/quick\s+(win|fix)/i.test(ln)) continue;
      title = t;
      break;
    }
  }
  if (!title) title = '(no title parsed)';
  if (title.length > 140) title = title.slice(0, 137) + '...';

  const isInline = Boolean(comment.inline);

  // Only INLINE comments are auto-fixable — they carry a concrete path+line.
  // PR-level summaries quote other comments' severity/effort badges, which would
  // otherwise fake a Quick Win with no location to apply it to.
  const autoFixable =
    isInline && (severity === 'Critical' || severity === 'Major') && effort === 'Quick Win';

  return {
    id: comment.id,
    severity,
    effort,
    autoFixable,
    path: comment.inline?.path ?? null,
    line: comment.inline?.to ?? comment.inline?.from ?? null,
    side: comment.inline?.to ? 'new' : 'old',
    title,
    body,
    suggestion,
    url: `https://bitbucket.org/${workspace}/${repo}/pull-requests/${prId}#comment-${comment.id}`,
    isInline,
  };
}

// ---- Main ----
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Usage: node coderabbit-fetch.mjs [--pr <n>] [--out <file>] [--include-minor]\n' +
        '                                 [--workspace <ws>] [--repo <repo>]\n'
    );
    return;
  }

  const { workspace, repo, apiBase } = resolveTarget(args);
  const headers = resolveAuth();
  const crAccountId = process.env.CODERABBIT_ACCOUNT_ID;

  let prId = args.pr;
  if (prId === 0) prId = await resolvePrFromBranch(headers, apiBase);

  process.stderr.write(`Fetching CodeRabbit comments on PR #${prId} (${workspace}/${repo})...\n`);

  const all = await fetchAllComments(prId, headers, apiBase);

  // Filter: CodeRabbit author, not deleted, not a reply.
  const crComments = all.filter(
    (c) => isCodeRabbit(c.user, crAccountId) && !c.deleted && !c.parent
  );

  let findings = [];
  for (const c of crComments) {
    const f = parseFinding(c, prId, workspace, repo);
    if (f) findings.push(f);
  }

  if (!args.includeMinor) {
    findings = findings.filter((f) => f.severity === 'Critical' || f.severity === 'Major');
  }

  // Stable order: Critical > Major > Minor > Nitpick, then Quick Win first,
  // then by path, line.
  const sevRank = { Critical: 0, Major: 1, Minor: 2, Nitpick: 3 };
  findings.sort((a, b) => {
    const s = sevRank[a.severity] - sevRank[b.severity];
    if (s !== 0) return s;
    const e = (a.effort === 'Quick Win' ? 0 : 1) - (b.effort === 'Quick Win' ? 0 : 1);
    if (e !== 0) return e;
    const p = String(a.path ?? '').localeCompare(String(b.path ?? ''));
    if (p !== 0) return p;
    const ln = (a.line ?? 0) - (b.line ?? 0);
    if (ln !== 0) return ln;
    // Final deterministic tie-break by id: keeps output stable for
    // indistinguishable records (e.g. PR-level summaries with path=null),
    // independent of API order or the sort engine's stability.
    return (a.id ?? 0) - (b.id ?? 0);
  });

  const count = (pred) => findings.filter(pred).length;
  const out = {
    prId,
    fetchedAt: new Date().toISOString(),
    counts: {
      total: findings.length,
      critical: count((f) => f.severity === 'Critical'),
      major: count((f) => f.severity === 'Major'),
      minor: count((f) => f.severity === 'Minor'),
      nitpick: count((f) => f.severity === 'Nitpick'),
      autoFixable: count((f) => f.autoFixable),
      heavyLift: count(
        (f) => (f.severity === 'Critical' || f.severity === 'Major') && f.effort === 'Heavy Lift'
      ),
    },
    findings,
  };

  const json = JSON.stringify(out, null, 2);
  if (args.out) {
    writeFileSync(args.out, json, 'utf8'); // utf8 = no BOM
    process.stderr.write(`Wrote ${findings.length} findings to ${args.out}\n`);
  } else {
    process.stdout.write(json + '\n');
  }
}

main().catch((e) => {
  die(`Unexpected error: ${e?.stack || e?.message || e}`);
});
