// find-socials — locate a person's GitHub and X (Twitter) accounts from their
// LinkedIn identity, via airglow.llm.chat with OpenRouter web-search/fetch server tools (no API
// key). Runs in the userscript bundle (no server function); the extension's
// injected `airglow` global forwards the llm payload verbatim.
//
// The call streams ({ onEvent }): server-tool searches run inside the request
// answers and emits no per-search events, so the pill holds a static
// "searching" phase until the first content chunk, then flips to "writing".
// The promise resolves with the complete chat.completion.

interface Body {
  name: string;
  headline?: string;
  location?: string;
  profileUrl?: string;
}

export interface FoundAccount {
  handle: string;
  url: string;
}

// A personal website/blog/portfolio — not a social profile. Rendered as a link
// row with the site's favicon and its bare domain as the label.
export interface FoundWebsite {
  url: string;
  domain: string;
}

// Enrichment fetched from public endpoints after verification (all optional —
// a missing block degrades to the plain logo row in the card).
export interface GithubProfile {
  name: string | null;
  avatar: string;
  repos: number;
  followers?: number | null;
  bio?: string | null;
  company?: string | null;
  location?: string | null;
}

export interface XProfile {
  name: string | null;
  avatar: string;
  followers: number;
  bio?: string | null;
  location?: string | null;
}

// One step of the model's run, kept small enough to cache per person:
// the search queries it self-reports, its text output, and any url_citation
// annotations (rare — citations anchor to prose, and the reply is JSON).
export interface TraceStep {
  type: 'search' | 'results' | 'text';
  query?: string;
  results?: { title: string; url: string }[];
  text?: string;
}

export interface FindSocialsResult {
  ok: boolean;
  error?: string;
  github?: FoundAccount | null;
  x?: FoundAccount | null;
  website?: FoundWebsite | null;
  githubProfile?: GithubProfile | null;
  xProfile?: XProfile | null;
  sources?: string[];
  trace?: TraceStep[];
  model?: string | null;
  searches?: number | null;
}

const SYSTEM = `You find the personal GitHub account and the personal X (Twitter) account of one specific person, identified by their LinkedIn profile.

- Use web search. Try queries like "<name> <company> github", "<name> github", "<name> <company> twitter", site:github.com / site:x.com queries, and the person's personal site (bios often link GitHub/X/LinkedIn together).
- You can also fetch a URL from the search results — a personal site or GitHub profile usually links the person's other accounts.
- Cross-check every candidate: the account's display name, bio, company, location, or linked URLs must tie it to THIS person. Personal accounts only, not company/org accounts. If you cannot verify a candidate, return null for that field.
- "website": the person's PERSONAL homepage, blog, or portfolio — a site about them as an individual, usually a personal domain (often their name, e.g. "janedoe.com" or "jane.dev") and often linked from their GitHub/X bio. It must be null unless you find such a personal site. Do NOT return: a company, product, startup, lab, or organization site — EVEN one the person founded, runs, or works at (a founder's startup page is not their personal website); a social profile (github/x/twitter/linkedin); or a generic employer page. Litmus test: if the homepage is primarily about a company/product/team rather than the individual, return null.
- "sources" lists up to 4 bare domains the verification drew on.

Work fast: at most 6 web searches and 2 page fetches total, then answer with your best verified result — the caller re-verifies and retries, so a quick null beats a slow rabbit hole.
Answer once both accounts are resolved: found, or confidently absent (null).
Immediately before EACH web search, output one line of the form ">> <the exact query>" with nothing else on it — these lines stream live progress to the user, so emit the line first and search right after.
After the last search, reply with a JSON object, no prose other than the ">>" lines:
{"queries": ["each web search query you ran, in order", ...], "github": {"handle": "...", "url": "..."} | null, "x": {"handle": "...", "url": "..."} | null, "website": "https://..." | null, "sources": ["domain", ...]}`;

// Output format is prompted, not schema-forced: response_format json_schema
// suppresses the url_citation annotations the trace is built from (verified
// against the gateway 2026-07-11 — same call returns citations without it,
// zero with it). extractJsonObject + sanitizeAccount absorb the looser reply.

function buildUserMessage(body: Body): string {
  return [
    'Find the GitHub and X accounts of this person:',
    '',
    `Name: ${body.name}`,
    body.headline ? `Headline: ${body.headline}` : '',
    body.location ? `Location: ${body.location}` : '',
    body.profileUrl ? `LinkedIn: ${body.profileUrl}` : '',
  ].filter(Boolean).join('\n');
}

// Pull the JSON object out of the model's text reply, tolerating fences/prose.
function extractJsonObject(text: string): Record<string, any> | null {
  if (!text) return null;
  let t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) t = fenced[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Accept only a well-formed account on the expected host; rebuild the URL from
// the handle so the browser side never renders a model-invented link target.
function sanitizeAccount(raw: any, kind: 'github' | 'x'): FoundAccount | null {
  if (!raw || typeof raw !== 'object') return null;
  let handle = typeof raw.handle === 'string' ? raw.handle.trim().replace(/^@/, '') : '';
  if (!handle && typeof raw.url === 'string') {
    const m = raw.url.match(/(?:github\.com|x\.com|twitter\.com)\/(@?[A-Za-z0-9_.-]+)/);
    if (m) handle = m[1].replace(/^@/, '');
  }
  const valid = kind === 'github' ? /^[A-Za-z0-9-]{1,39}$/ : /^[A-Za-z0-9_]{1,15}$/;
  if (!valid.test(handle)) return null;
  return {
    handle: kind === 'x' ? `@${handle}` : handle,
    url: kind === 'github' ? `https://github.com/${handle}` : `https://x.com/${handle}`,
  };
}

// Accept a personal-site URL: valid http(s), and not a social/known-platform
// host (those are captured by the dedicated github/x fields, and linkedin is
// where we started). Returns the normalized URL + bare domain, or null.
const NON_PERSONAL_HOSTS = /(?:^|\.)(?:github\.com|githubusercontent\.com|x\.com|twitter\.com|t\.co|linkedin\.com|lnkd\.in|facebook\.com|instagram\.com|youtube\.com|medium\.com|substack\.com|threads\.net|bsky\.app|mastodon\.\w+)$/i;
function sanitizeWebsite(raw: any): FoundWebsite | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^www\./, '');
  if (!host.includes('.') || NON_PERSONAL_HOSTS.test(host)) return null;
  return { url: url.href, domain: host };
}

// ── Verification gate ─────────────────────────────────────────────────────────
// The model's answer is schema-valid but not necessarily true (a run returned a
// renamed X handle that no longer exists). Verify deterministically before
// returning: existence via public endpoints, identity where the data allows.
// Only a definitive negative nulls the account — network failures pass through
// with a note, so an outage doesn't erase correct results.
//
// Checks go through airglow.fetch (extension background), not page fetch: this
// code runs on linkedin.com, where a direct cross-origin fetch is subject to
// CORS (publish.twitter.com/oembed especially).

const VERIFY_TIMEOUT_MS = 8000;

// An AbortSignal can't cross the extension message channel, so the per-check
// timeout is a race: the rejection lands in the caller's catch path ("check
// failed — kept"), same as any network failure.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('verify timeout')), ms);
    }),
  ]).finally(() => clearTimeout(timer!)) as Promise<T>;
}

function nameTokens(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
}

// A GitHub account with no uploaded photo shows a generated identicon: a
// symmetric grid of white + one color. The REST API doesn't flag this, but the
// image gives it away — an identicon quantizes to a handful of distinct colors,
// a real photo to dozens. Load a small copy (GitHub avatars send
// Access-Control-Allow-Origin, so canvas pixels are readable) and count. A
// default returns true so the card shows the GitHub logo instead of the
// meaningless identicon. On any failure return false — keep whatever loads.
async function githubAvatarIsDefault(avatarUrl: string): Promise<boolean> {
  try {
    const url = avatarUrl.includes('?') ? `${avatarUrl}&s=80` : `${avatarUrl}?s=80`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await withTimeout(img.decode(), VERIFY_TIMEOUT_MS);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      // Quantize to 4 bits/channel so JPEG noise doesn't inflate the count.
      colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      if (colors.size > 6) return false; // clearly a real photo
    }
    return colors.size <= 6;
  } catch {
    return false;
  }
}

// GitHub: profile must exist; if it declares a display name, it must share a
// token with the person's name (profiles with no name pass on existence).
// The same response carries the card's enrichment (avatar, repo count), so a
// successful check returns it — no second request.
async function verifyGithub(acct: FoundAccount, personName: string): Promise<{ ok: boolean; note: string; profile?: GithubProfile }> {
  try {
    const r = await withTimeout(airglow.fetch(`https://api.github.com/users/${acct.handle}`, {
      headers: { Accept: 'application/vnd.github+json' },
    }), VERIFY_TIMEOUT_MS);
    if (r.status === 404) return { ok: false, note: `✗ github.com/${acct.handle} does not exist — dropped` };
    if (!r.ok) return { ok: true, note: `~ GitHub check inconclusive (HTTP ${r.status}) — kept` };
    const u: any = await r.json();
    const profileName = typeof u?.name === 'string' ? u.name : '';
    let profile: GithubProfile | undefined;
    if (typeof u?.avatar_url === 'string') {
      // Drop a default identicon so the row shows the GitHub logo, not a
      // meaningless generated pattern.
      const avatar = (await githubAvatarIsDefault(u.avatar_url)) ? '' : u.avatar_url;
      const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
      profile = {
        name: profileName || null,
        avatar,
        repos: typeof u.public_repos === 'number' ? u.public_repos : 0,
        followers: typeof u.followers === 'number' ? u.followers : null,
        bio: str(u.bio),
        company: str(u.company),
        location: str(u.location),
      };
    }
    if (profileName) {
      const person = nameTokens(personName);
      const profileToks = nameTokens(profileName);
      if (person.length && profileToks.length && !profileToks.some((t) => person.includes(t))) {
        return { ok: false, note: `✗ github.com/${acct.handle} belongs to “${profileName}”, not ${personName} — dropped` };
      }
      return { ok: true, note: `✓ github.com/${acct.handle} exists, name “${profileName}” matches`, profile };
    }
    return { ok: true, note: `✓ github.com/${acct.handle} exists (no display name to compare)`, profile };
  } catch {
    return { ok: true, note: '~ GitHub check failed (network) — kept' };
  }
}

// X: existence via the unauthenticated oembed endpoint (server-rendered; the
// x.com page itself is an indistinguishable JS shell). 200 = live, 404 = dead
// or suspended. Must use the twitter.com URL form; fetch follows the redirect.
async function verifyX(acct: FoundAccount): Promise<{ ok: boolean; note: string }> {
  const handle = acct.handle.replace(/^@/, '');
  try {
    const r = await withTimeout(airglow.fetch(
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://twitter.com/${handle}`)}`,
    ), VERIFY_TIMEOUT_MS);
    if (r.status === 404) return { ok: false, note: `✗ x.com/${handle} does not exist — dropped` };
    if (!r.ok) return { ok: true, note: `~ X check inconclusive (HTTP ${r.status}) — kept` };
    return { ok: true, note: `✓ x.com/${handle} exists` };
  } catch {
    return { ok: true, note: '~ X check failed (network) — kept' };
  }
}

// Website: confirm it loads. A definitive 404/410 drops it; other statuses and
// network failures pass through (the site may block bots or the check may be
// offline — same lenient policy as the account checks).
async function verifyWebsite(site: FoundWebsite): Promise<{ ok: boolean; note: string }> {
  try {
    const r = await withTimeout(airglow.fetch(site.url), VERIFY_TIMEOUT_MS);
    if (r.status === 404 || r.status === 410) return { ok: false, note: `✗ ${site.domain} not reachable (HTTP ${r.status}) — dropped` };
    return { ok: true, note: `✓ ${site.domain} reachable` };
  } catch {
    return { ok: true, note: `~ ${site.domain} check failed (network) — kept` };
  }
}

// ── Enrichment (best-effort, never blocks the result) ─────────────────────────

// X profile via FixTweet's public API — followers, avatar, display name.
// Anonymous, no auth.
async function fetchXProfile(handle: string): Promise<XProfile | null> {
  try {
    const r = await withTimeout(airglow.fetch(`https://api.fxtwitter.com/${handle}`), VERIFY_TIMEOUT_MS);
    if (!r.ok) return null;
    const u: any = (await r.json())?.user;
    if (!u || typeof u.avatar_url !== 'string') return null;
    return {
      name: typeof u.name === 'string' ? u.name : null,
      avatar: u.avatar_url.replace('_normal.', '_bigger.'),
      followers: typeof u.followers === 'number' ? u.followers : 0,
      bio: typeof u.description === 'string' && u.description.trim() ? u.description.trim() : null,
      location: typeof u.location === 'string' && u.location.trim() ? u.location.trim() : null,
    };
  } catch {
    return null;
  }
}

export const __enrich = {
  fetchXProfile: (h: string) => fetchXProfile(h),
  githubAvatarIsDefault: (u: string) => githubAvatarIsDefault(u),
};

// ── How to fetch a user's latest X post (removed — kept for reference) ────────
// We shipped this then dropped it from the card. The technique still works and
// is worth keeping: X killed every anonymous timeline route (the syndication
// endpoint hard-429s per IP; guest tokens can't read user timelines), so the
// only reliable source is X's own GraphQL UserTweets called with the user's
// logged-in x.com session. Steps:
//
//  1. userId: from FixTweet (api.fxtwitter.com/<handle> → user.id, anonymous)
//     or X's UserByScreenName GraphQL.
//  2. csrf: read the ct0 cookie via `airglow.getCookie('https://x.com','ct0')`.
//     A userscript on linkedin.com can't see x.com's cookie any other way; X
//     requires the x-csrf-token header to EQUAL ct0 (double-submit; else 403
//     code 353).
//  3. request: airglow.fetch with { includeCookies: true } so x.com cookies
//     attach — this runs the request from a tab at the URL's ORIGIN ROOT, so use
//     the web host `https://x.com/i/api/graphql/<QID>/UserTweets` (api.x.com's
//     root errors). Headers: authorization: `Bearer <public web bearer>`,
//     x-csrf-token: <ct0>, x-twitter-auth-type: 'OAuth2Session',
//     x-twitter-active-user: 'yes'. Query string: variables={userId,count,
//     includePromotedContent:false,withVoice:true} and the full features flag
//     map (X 400s if any expected flag is missing). x-client-transaction-id is
//     NOT required for a logged-in session.
//     - public web bearer (a constant, same for everyone):
//       AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D...
//     - QID rotates every few weeks (stale → 404). Capture a fresh one from a
//       real UserTweets request in DevTools/network capture.
//  4. parse: data.user.result.timeline.timeline.instructions →
//     TimelineAddEntries → entries starting 'tweet-' →
//     content.itemContent.tweet_results.result(.tweet).legacy → pick the newest
//     by created_at, skipping retweets (retweeted_status_result) and replies
//     (in_reply_to_status_id_str). Clean full_text by expanding entities.urls
//     display_url and dropping the trailing t.co media link.
//
// Degrades to null when the user isn't signed into X or the QID/flags rotate.

// Progress messages surface in the pill while a lookup runs. Server-side
// Live progress. The web-search LLM call streams: the model's server-side
// searches emit no per-query events, but the url_citation annotations (the
// pages it reads) stream in as it goes, and usage carries the search count at
// the end. So the pill shows a live "N searches · M sources" with the latest
// source domain — real progress without the (unavailable) query text.
export interface Progress {
  phase?: string;        // coarse status line ("Searching the web…", "Verifying…")
  latestSource?: string; // most recent citation's bare domain
  sources?: number;      // distinct pages read so far
  searches?: number;     // server-side web searches run (known at end of a call)
}
export type ProgressFn = (u: Progress) => void;

export async function findSocials(body: Body, onProgress?: ProgressFn): Promise<FindSocialsResult> {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return { ok: false, error: 'name is required' };
  const progress: ProgressFn = (u) => { try { onProgress?.(u); } catch { /* UI gone */ } };

  const trace: TraceStep[] = [];
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: buildUserMessage(body) },
  ];
  let sources: string[] = [];
  let model: string | null = null;
  let searches = 0;
  // Live counters, shared across the initial call and any retry so the pill's
  // numbers only ever grow.
  let liveSourceCount = 0;
  const seenCiteUrls = new Set<string>();

  const domainOf = (url: string): string => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  };

  // One streaming call. The stream drives the live pill three ways: each new
  // url_citation → a source; each complete ">> query" narration line → a live
  // search (the server-side search tool itself streams no events, so the model
  // is prompted to announce every query on its own line right before running
  // it — the earliest real signal that searching started); usage → the
  // authoritative search count, correcting the narrated estimate at the end.
  // The resolved completion is still the authoritative result — the trace and
  // parse build from it exactly as before, so a truncated stream degrades to
  // the normal "unparsable reply" path, never a hang. No max_tokens: the
  // gateway defaults web-tooling calls to the ceiling.
  const callModel = async (): Promise<string> => {
    const base = searches;
    let narrated = 0;
    let usageCount: number | null = null;
    let buf = '';
    let scanned = 0;
    let firstChunk = false;
    const res = await airglow.llm.chat({
      model: 'anthropic/claude-sonnet-5',
      tools: [{ type: 'openrouter:web_search' }, { type: 'openrouter:web_fetch' }],
      messages,
    }, {
      onEvent: (chunk: any) => {
        if (!firstChunk) {
          firstChunk = true;
          progress({ phase: 'Searching the web…' });
        }
        const delta = chunk?.choices?.[0]?.delta;
        if (typeof delta?.content === 'string' && delta.content) {
          buf += delta.content;
          let nl;
          while ((nl = buf.indexOf('\n', scanned)) >= 0) {
            const line = buf.slice(scanned, nl).trim();
            scanned = nl + 1;
            const q = line.match(/^>>\s*(.+)$/)?.[1];
            if (q) {
              narrated++;
              progress({ searches: base + (usageCount ?? narrated), phase: `Searching: ${q.slice(0, 80)}` });
            }
          }
        }
        const anns = delta?.annotations;
        if (Array.isArray(anns)) {
          for (const a of anns) {
            const url = a?.type === 'url_citation' ? a.url_citation?.url : null;
            if (typeof url === 'string' && url && !seenCiteUrls.has(url)) {
              seenCiteUrls.add(url);
              liveSourceCount++;
              progress({ sources: liveSourceCount, latestSource: domainOf(url) });
            }
          }
        }
        // web_search_requests rides the final usage chunk; surface it live if it
        // ever appears mid-stream, else it lands right before completion.
        const sc = chunk?.usage?.server_tool_use_details?.web_search_requests;
        if (typeof sc === 'number' && sc > 0) {
          usageCount = sc;
          progress({ searches: base + sc });
        }
      },
    });
    const reported = res?.usage?.server_tool_use_details?.web_search_requests;
    searches = base + (typeof reported === 'number' ? reported : (usageCount ?? narrated));
    progress({ searches });
    const msg = res?.choices?.[0]?.message;
    const text = typeof msg?.content === 'string' ? msg.content : '';
    // Trace keeps the reply minus the narration lines (parsed.queries already
    // records the searches).
    const t = text.replace(/^>>.*$/gm, '').trim();
    if (t) trace.push({ type: 'text', text: t.slice(0, 2000) });
    const cites = (Array.isArray(msg?.annotations) ? msg.annotations : [])
      .filter((a: any) => a?.type === 'url_citation')
      .slice(0, 5)
      .map((a: any) => ({
        title: String(a.url_citation?.title ?? '').slice(0, 120),
        url: String(a.url_citation?.url ?? ''),
      }));
    if (cites.length) trace.push({ type: 'results', results: cites });
    model = res?.model ?? model;
    return text;
  };

  progress({ phase: 'Contacting model…' });
  let text: string;
  try {
    text = await callModel();
  } catch (e: any) {
    airglow.log.error('find-socials failed', { name, error: e?.message });
    return { ok: false, error: e?.message || 'LLM call failed' };
  }

  let parsed = extractJsonObject(text);
  if (!parsed) {
    airglow.log.error('find-socials: unparsable reply', { name, head: text.slice(0, 200) });
    return { ok: false, error: 'model returned an unparsable reply' };
  }
  const collectSources = (p: Record<string, any>) => {
    if (Array.isArray(p.sources)) {
      sources = [...new Set([...sources, ...p.sources.filter((s: any) => typeof s === 'string')])].slice(0, 6);
    }
    // Self-reported queries → the trace's "searched …" steps. The reply is
    // JSON, so url_citation annotations rarely materialize; this is the only
    // per-search record available (server-side search streams no events).
    if (Array.isArray(p.queries)) {
      for (const q of p.queries.slice(0, 10)) {
        if (typeof q === 'string' && q.trim()) trace.push({ type: 'search', query: q.trim().slice(0, 200) });
      }
    }
  };
  collectSources(parsed);

  let github: FoundAccount | null = null;
  let x: FoundAccount | null = null;
  let githubProfile: GithubProfile | null = null;
  let ghCand = sanitizeAccount(parsed.github, 'github');
  let xCand = sanitizeAccount(parsed.x, 'x');
  let websiteCand = sanitizeWebsite(parsed.website);

  // Verification gate — concurrent; only a definitive negative drops a result.
  // One retry: a failure (renamed handle, namesake) feeds back so the model can
  // correct just the failed platform(s), then the corrections re-verify.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (ghCand || xCand) {
      progress({ phase: `Verifying ${[ghCand && 'GitHub', xCand && 'X'].filter(Boolean).join(' & ')}…` });
    }
    const fails: string[] = [];
    const [ghCheck, xCheck] = await Promise.all([
      ghCand ? verifyGithub(ghCand, name) : Promise.resolve(null),
      xCand ? verifyX(xCand) : Promise.resolve(null),
    ]);
    if (ghCheck) {
      trace.push({ type: 'text', text: ghCheck.note });
      if (ghCheck.ok) { github = ghCand; githubProfile = ghCheck.profile ?? null; }
      else fails.push(ghCheck.note);
    }
    if (xCheck) {
      trace.push({ type: 'text', text: xCheck.note });
      if (xCheck.ok) x = xCand;
      else fails.push(xCheck.note);
    }
    if (fails.length === 0 || attempt === 1) break;

    messages.push(
      { role: 'assistant', content: text },
      { role: 'user', content: `Verification failed: ${fails.join('; ')}. That account may have been renamed or belong to a namesake — search again for the failed platform(s) only, then reply with the full JSON again: a corrected value (or null) for the failed field(s), the other fields exactly as before.` },
    );
    trace.push({ type: 'text', text: '↻ retrying with verification feedback' });
    progress({ phase: 'Searching more…' });
    try {
      text = await callModel();
    } catch (e: any) {
      airglow.log.error('find-socials retry failed', { name, error: e?.message });
      break; // keep what already verified
    }
    parsed = extractJsonObject(text);
    if (!parsed) break;
    collectSources(parsed);
    // Only the failed fields get a second chance; verified results stand.
    ghCand = github ? null : sanitizeAccount(parsed.github, 'github');
    xCand = x ? null : sanitizeAccount(parsed.x, 'x');
    // Keep a website the retry drops (it re-sends the unchanged fields, but a
    // truncated reply might omit it).
    websiteCand = sanitizeWebsite(parsed.website) ?? websiteCand;
  }

  // Website: a lightweight reachability gate (no identity check — the model
  // already tied it to the person; this only weeds out dead links).
  let website: FoundWebsite | null = null;
  if (websiteCand) {
    const wCheck = await verifyWebsite(websiteCand);
    trace.push({ type: 'text', text: wCheck.note });
    if (wCheck.ok) website = websiteCand;
  }

  // Enrichment: X profile stats (anon, best-effort — null just omits them).
  let xProfile: XProfile | null = null;
  if (x) {
    progress({ phase: 'Fetching profile details…' });
    xProfile = await fetchXProfile(x.handle.replace(/^@/, ''));
  }

  airglow.log.info('find-socials done', { name, github: github?.handle ?? null, x: x?.handle ?? null, website: website?.domain ?? null, searches });
  return { ok: true, github, x, website, githubProfile, xProfile, sources, trace, model, searches };
}
