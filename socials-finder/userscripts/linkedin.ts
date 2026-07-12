// Socials Finder — LinkedIn profile pages (/in/<slug>).
//
// Injects an amber Airglow "Socials" section into the profile's main column,
// directly below the top card block (above Sales Navigator / About), shaped
// like LinkedIn's own section cards: a "Find socials" button that resolves the
// person's GitHub and X accounts via findSocials (LLM + web-search server tool, bundled
// into this userscript) and caches the result per profile in airglow.storage.
// On a profile with a cached result the links render immediately, no button.
//
// Pure DOM + injected CSS (no React), namespaced `agsf-*`. Survives LinkedIn's
// SPA navigation via a URL/DOM poll, same pattern as linkedin-researcher.

import {
  findSocials, __enrich,
  type Progress, type FoundAccount, type FoundWebsite,
  type GithubProfile, type XProfile, type TraceStep,
} from './find-socials';

interface SocialsEntry {
  slug: string;
  name: string;
  headline?: string;
  profileUrl: string;
  github: FoundAccount | null;
  x: FoundAccount | null;
  website?: FoundWebsite | null;
  githubProfile?: GithubProfile | null;
  xProfile?: XProfile | null;
  sources?: string[];
  trace?: TraceStep[];
  model?: string | null;
  searches?: number | null;
  fetchedAt: number;
}

const NS = 'agsf';
const CARD_ID = `${NS}-card`;
const STYLE_ID = `${NS}-style`;
const HOVER_ID = `${NS}-hover`;

const GH_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
      '<rect width="16" height="16" fill="#ffffff"/>' +
      '<g transform="translate(1.6,1.6) scale(0.8)"><path fill="#1b1f24" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></g>' +
    '</svg>',
  );
const X_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<rect width="24" height="24" fill="#000000"/>' +
      '<g transform="translate(3.6,3.6) scale(0.7)"><path fill="#ffffff" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></g>' +
    '</svg>',
  );

// Fallback globe for a personal site whose favicon won't load.
const GLOBE_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#5b6b7b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect width="24" height="24" rx="5" fill="#eef1f4" stroke="none"/>' +
      '<circle cx="12" cy="12" r="6.5"/><path d="M5.5 12h13"/>' +
      '<path d="M12 5.5c1.8 2 2.7 4.2 2.7 6.5S13.8 16.5 12 18.5c-1.8-2-2.7-4.2-2.7-6.5S10.2 7.5 12 5.5z"/>' +
    '</svg>',
  );

// The Airglow mark, verbatim from the shared brand asset.
const AIRGLOW_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="245 250 520 520" aria-hidden="true">' +
  '<g transform="translate(52, 18) scale(0.98)">' +
  '<path fill="#1c1917" d="M416.6 246.2 L200.8 753.5 L707.6 753.5 L490.8 246.2 Z"/>' +
  '<path fill="#F8BB5B" fill-rule="evenodd" d="M416.6 246.2 L210.4 731 L313 649.9 L326.7 649.9 L446.9 551.2 L539.7 639.1 L560.2 640.1 L698 731 L490.8 246.2 Z M392.1 543.3 L510.4 543.3 L450.8 382.1 Z"/>' +
  '<path fill="#F99E3D" d="M200.8 753.5 L318.8 753.5 L355 678.2 L393.1 697.8 L448.8 634.2 L473.3 659.6 L468.4 634.2 L475.2 627.4 L446.9 570.7 L334.5 667.5 Z"/>' +
  '<path fill="#F99E3D" d="M595.4 753.5 L707.6 753.5 L556.3 669.4 Z"/></g></svg>';

const CSS = `
/* Own section card in the profile's main column, shaped like LinkedIn's
   About/Featured cards (full width, rounded, 8px gap above). */
#${CARD_ID} {
  position: relative; display: flex; flex-direction: column; gap: 10px;
  margin-top: 8px; padding: 16px 24px; width: 100%; box-sizing: border-box;
  background: linear-gradient(180deg, #FFFCF4, #FFFDFA);
  border: 1.5px solid #F5A623; border-radius: 10px;
  box-shadow: 0 2px 10px rgba(245,166,35,0.14), 0 0 0 1px rgba(245,166,35,0.08);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
#${CARD_ID} .${NS}-head {
  display: flex; align-items: center; gap: 8px;
  font-size: 16px; font-weight: 600; color: rgba(0,0,0,0.9); line-height: 1.3;
}
#${CARD_ID} .${NS}-btn {
  display: inline-flex; align-items: center; gap: 8px; align-self: flex-start;
  border: 1.5px solid #F5A623; border-radius: 9999px; background: #fff;
  padding: 5px 16px; margin: 0; cursor: pointer;
  font: 600 14px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: rgba(0,0,0,0.8);
}
#${CARD_ID} .${NS}-btn:hover { background: rgba(245,166,35,0.1); }
#${CARD_ID} .${NS}-mark { width: 22px; height: 22px; border-radius: 5px; overflow: hidden; display: inline-flex; flex-shrink: 0; }
#${CARD_ID} .${NS}-mark svg { width: 22px; height: 22px; }
#${CARD_ID} .${NS}-rows { display: flex; flex-wrap: wrap; gap: 10px 36px; }
#${CARD_ID} .${NS}-status {
  display: inline-flex; align-items: center; gap: 8px;
  font: 400 13px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: rgba(0,0,0,0.6); padding: 2px;
}
#${CARD_ID} .${NS}-spin {
  width: 14px; height: 14px; flex-shrink: 0; border-radius: 50%;
  border: 2px solid rgba(245,166,35,0.35); border-top-color: #F5A623;
  animation: ${NS}-rot 0.8s linear infinite;
}
@keyframes ${NS}-rot { to { transform: rotate(360deg); } }
#${CARD_ID} .${NS}-elapsed { color: rgba(0,0,0,0.4); white-space: pre; flex-shrink: 0; }
#${CARD_ID} .${NS}-phase { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${CARD_ID} .${NS}-meta {
  font: 400 11.5px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: rgba(0,0,0,0.4); padding-left: 22px; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
#${CARD_ID} a.${NS}-acct { display: flex; align-items: center; gap: 8px; text-decoration: none; }
#${CARD_ID} .${NS}-acct img { width: 32px; height: 32px; border-radius: 4px; display: block; object-fit: cover; }
#${CARD_ID} .${NS}-acct img.${NS}-avatar-x { border-radius: 50%; }
#${CARD_ID} .${NS}-acct-name { font-size: 14px; font-weight: 600; color: rgba(0,0,0,0.9); line-height: 1.25; }
#${CARD_ID} .${NS}-acct-handle { font-size: 12.5px; font-weight: 400; color: rgba(0,0,0,0.6); line-height: 1.25; margin-top: 1px; }
#${CARD_ID} a.${NS}-acct:hover .${NS}-acct-name { text-decoration: underline; }
#${CARD_ID} .${NS}-retry {
  border: none; background: none; padding: 0; cursor: pointer;
  font: 600 12.5px/1.3 system-ui, sans-serif; color: #0a66c2;
}
#${CARD_ID} .${NS}-retry:hover { text-decoration: underline; }
#${CARD_ID} .${NS}-refresh {
  border: none; background: none; padding: 0 2px; margin: 0; cursor: pointer;
  font-size: 20px; line-height: 1; color: rgba(0,0,0,0.35);
}
#${CARD_ID} .${NS}-refresh:hover { color: rgba(0,0,0,0.7); }
/* Hover mini-card: fixed + appended to <body> so the top card's
   overflow:hidden can't clip it. */
#${HOVER_ID} {
  position: fixed; z-index: 2147483647; width: 280px; box-sizing: border-box;
  background: linear-gradient(180deg, #FFFCF4, #FFFDFA);
  border: 1.5px solid #F5A623; border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.16), 0 0 0 1px rgba(245,166,35,0.08);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
/* The whole mini-card is one link to the account page. */
#${HOVER_ID} a.${NS}-hv-link {
  display: flex; flex-direction: column; gap: 8px; padding: 12px 14px;
  text-decoration: none; color: inherit; cursor: pointer;
}
#${HOVER_ID} .${NS}-hv-head {
  display: flex; align-items: center; gap: 7px;
  font-size: 12px; font-weight: 600; color: rgba(0,0,0,0.55);
  text-transform: uppercase; letter-spacing: 0.4px;
}
#${HOVER_ID} .${NS}-hv-head img { width: 16px; height: 16px; border-radius: 4px; display: block; }
#${HOVER_ID} .${NS}-hv-main { display: flex; align-items: center; gap: 10px; }
#${HOVER_ID} .${NS}-hv-main img { width: 44px; height: 44px; border-radius: 6px; display: block; object-fit: cover; flex-shrink: 0; }
#${HOVER_ID} .${NS}-hv-main img.${NS}-avatar-x { border-radius: 50%; }
#${HOVER_ID} .${NS}-hv-name { font-size: 14px; font-weight: 600; color: rgba(0,0,0,0.9); line-height: 1.25; }
#${HOVER_ID} .${NS}-hv-handle { font-size: 12.5px; color: rgba(0,0,0,0.6); line-height: 1.25; margin-top: 1px; }
#${HOVER_ID} .${NS}-hv-info { font-size: 12.5px; color: rgba(0,0,0,0.65); line-height: 1.45; }
#${HOVER_ID} .${NS}-hv-bio { font-size: 12.5px; color: rgba(0,0,0,0.75); line-height: 1.45; }
`;

// ── Page helpers ──────────────────────────────────────────────────────────────

function currentSlug(): string {
  return (window.location.pathname.match(/^\/in\/([^/]+)/)?.[1] ?? '').toLowerCase();
}

function cacheKey(slug: string): string {
  return `socials:${slug}`;
}

// The top-card <section> whose <h2> is the profile name (== document.title head).
function findTopCardSection(): { section: HTMLElement; nameH2: HTMLElement } | null {
  const titleName = document.title.replace(/\s*\|.*$/, '').trim();
  if (!titleName) return null;
  for (const h2 of Array.from(document.querySelectorAll('section h2'))) {
    if (h2.textContent?.trim() !== titleName) continue;
    const section = h2.closest('section');
    if (section) return { section: section as HTMLElement, nameH2: h2 as HTMLElement };
  }
  return null;
}

function scrapeProfile(): { name: string; headline: string; location: string } {
  const ns = findTopCardSection();
  const name = ns?.nameH2.textContent?.trim() || document.title.replace(/\s*\|.*$/, '').trim() || '';
  const lines = (ns?.section.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
  let headline = '';
  let location = '';
  const degreeIdx = lines.findIndex((l) => /^·\s*\d+(st|nd|rd|th)$/.test(l));
  if (degreeIdx >= 0 && degreeIdx + 1 < lines.length) {
    headline = lines[degreeIdx + 1];
    const candidate = lines[degreeIdx + 2];
    if (candidate && (candidate.includes(',') || /\b(States|Kingdom|Canada|India|Germany|France|Israel|Australia)\b/.test(candidate))) {
      location = candidate;
    }
  }
  return { name, headline, location };
}

// ── Card rendering ────────────────────────────────────────────────────────────

// Section heading, present in every card state (like LinkedIn's "About").
const HEAD =
  `<span class="${NS}-head"><span class="${NS}-mark">${AIRGLOW_ICON}</span>Socials</span>`;

let running = false;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

function fmtCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}

// Row: platform brand icon, platform label, then handle · stat. The person's
// details (avatar, name, bio) live in the hover mini-card, not the row.
function accountRow(kind: 'github' | 'x', acct: FoundAccount, entry: SocialsEntry): string {
  const label = kind === 'github' ? 'GitHub' : 'X';
  const logo = kind === 'github' ? GH_LOGO : X_LOGO;
  const stat = kind === 'github'
    ? (entry.githubProfile ? ` · ${fmtCount(entry.githubProfile.repos)} repos` : '')
    : (entry.xProfile ? ` · ${fmtCount(entry.xProfile.followers)} followers` : '');
  return (
    `<a class="${NS}-acct" href="${acct.url}" target="_blank" rel="noopener noreferrer" data-testid="${NS}-${kind}">` +
    `<img src="${logo}" alt="${label}">` +
    `<span><span class="${NS}-acct-name">${label}</span><br>` +
    `<span class="${NS}-acct-handle">${esc(acct.handle)}${stat}</span></span></a>`
  );
}

// ── Hover mini-card ───────────────────────────────────────────────────────────
// One shared fixed-position element on <body> (the top card is overflow:hidden
// and would clip anything hanging off the amber card). Shown while the pointer
// is over an account row or the mini-card itself.

function hoverCardHtml(kind: 'github' | 'x', acct: FoundAccount, entry: SocialsEntry): string {
  const label = kind === 'github' ? 'GitHub' : 'X';
  const logo = kind === 'github' ? GH_LOGO : X_LOGO;
  const profile = kind === 'github' ? entry.githubProfile : entry.xProfile;
  const avatar = profile?.avatar
    ? `<img src="${esc(profile.avatar)}" alt="" class="${kind === 'x' ? `${NS}-avatar-x` : ''}" data-${NS}-fallback="${logo}">`
    : `<img src="${logo}" alt="">`;
  const stats: string[] = [];
  if (kind === 'github' && entry.githubProfile) {
    const p = entry.githubProfile;
    stats.push(`${fmtCount(p.repos)} repos`);
    if (typeof p.followers === 'number') stats.push(`${fmtCount(p.followers)} followers`);
    if (p.company) stats.push(esc(p.company));
    if (p.location) stats.push(esc(p.location));
  } else if (kind === 'x' && entry.xProfile) {
    const p = entry.xProfile;
    stats.push(`${fmtCount(p.followers)} followers`);
    if (p.location) stats.push(esc(p.location));
  }
  const bio = profile?.bio ? `<span class="${NS}-hv-bio">${esc(profile.bio)}</span>` : '';
  return (
    `<a class="${NS}-hv-link" href="${acct.url}" target="_blank" rel="noopener noreferrer">` +
    `<span class="${NS}-hv-head"><img src="${logo}" alt="">${label}</span>` +
    `<span class="${NS}-hv-main">${avatar}` +
    `<span><span class="${NS}-hv-name">${esc(profile?.name || entry.name)}</span><br>` +
    `<span class="${NS}-hv-handle">${esc(acct.handle)}</span></span></span>` +
    (stats.length ? `<span class="${NS}-hv-info">${stats.join(' · ')}</span>` : '') +
    bio +
    `</a>`
  );
}

let hoverHideTimer: number | undefined;

function hideHoverCard() {
  hoverHideTimer = window.setTimeout(() => document.getElementById(HOVER_ID)?.remove(), 120);
}

function showHoverCard(row: HTMLElement, html: string) {
  window.clearTimeout(hoverHideTimer);
  let hv = document.getElementById(HOVER_ID);
  if (!hv) {
    hv = document.createElement('div');
    hv.id = HOVER_ID;
    hv.addEventListener('mouseenter', () => window.clearTimeout(hoverHideTimer));
    hv.addEventListener('mouseleave', hideHoverCard);
    document.body.appendChild(hv);
  }
  hv.innerHTML = html;
  hv.querySelectorAll<HTMLImageElement>(`img[data-${NS}-fallback]`).forEach((img) => {
    img.addEventListener('error', () => { img.src = img.dataset[`${NS}Fallback`] ?? img.src; }, { once: true });
  });
  // Above the row, horizontally centered on it (below as fallback when the
  // row is near the viewport top), clamped to the viewport.
  const r = row.getBoundingClientRect();
  const { width: w, height: h } = hv.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
  let top = r.top - h - 10;
  if (top < 8) top = Math.min(r.bottom + 10, window.innerHeight - h - 8);
  hv.style.left = `${Math.round(left)}px`;
  hv.style.top = `${Math.round(top)}px`;
}

function attachHoverCard(card: HTMLElement, kind: 'github' | 'x', entry: SocialsEntry) {
  const acct = kind === 'github' ? entry.github : entry.x;
  const row = card.querySelector<HTMLElement>(`[data-testid="${NS}-${kind}"]`);
  if (!acct || !row) return;
  row.addEventListener('mouseenter', () => showHoverCard(row, hoverCardHtml(kind, acct, entry)));
  row.addEventListener('mouseleave', hideHoverCard);
}

// Personal-site row: the site's favicon (Google's service; falls back to a
// globe if it won't load) + the bare domain.
function websiteRow(site: FoundWebsite): string {
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(site.domain)}&sz=64`;
  return (
    `<a class="${NS}-acct" href="${esc(site.url)}" target="_blank" rel="noopener noreferrer" data-testid="${NS}-website">` +
    `<img src="${esc(favicon)}" alt="Website" data-${NS}-fallback="${GLOBE_LOGO}">` +
    `<span><span class="${NS}-acct-name">Website</span><br>` +
    `<span class="${NS}-acct-handle">${esc(site.domain)}</span></span></a>`
  );
}

function renderButton(card: HTMLElement) {
  card.innerHTML =
    HEAD +
    `<button class="${NS}-btn" data-testid="${NS}-find">Find socials</button>`;
  card.querySelector(`.${NS}-btn`)?.addEventListener('click', () => void runLookup(card));
}

// Live pill. Top line: the coarse phase, or the latest page the model just read
// ("🔗 github.com") once citations start streaming. Second line: running
// metadata — "N searches · M sources · Ts". The counts come from findSocials's
// streamed progress (url_citations → sources, usage → searches); elapsed ticks
// locally. Returns the updaters.
function renderLoading(card: HTMLElement): { update: (u: Progress) => void; setElapsed: (s: number) => void } {
  card.innerHTML =
    HEAD +
    `<span class="${NS}-status" data-testid="${NS}-loading"><span class="${NS}-spin"></span>` +
    `<span class="${NS}-phase">Contacting model…</span></span>` +
    `<span class="${NS}-meta" data-testid="${NS}-meta"></span>`;
  const phaseEl = card.querySelector<HTMLElement>(`.${NS}-phase`);
  const metaEl = card.querySelector<HTMLElement>(`.${NS}-meta`);
  let phase = 'Contacting model…';
  let latest = '';
  let searches = 0;
  let sources = 0;
  let secs = 0;
  const render = () => {
    if (phaseEl) phaseEl.textContent = latest ? `🔗 ${latest}` : phase;
    const parts: string[] = [];
    if (searches > 0) parts.push(`${searches} ${searches === 1 ? 'search' : 'searches'}`);
    if (sources > 0) parts.push(`${sources} ${sources === 1 ? 'source' : 'sources'}`);
    parts.push(`${secs}s`);
    if (metaEl) metaEl.textContent = parts.join(' · ');
  };
  render();
  return {
    update: (u) => {
      // A new coarse phase (verifying, fetching…) supersedes the source line.
      if (u.phase !== undefined) { phase = u.phase; latest = ''; }
      if (u.latestSource) latest = u.latestSource;
      if (typeof u.sources === 'number') sources = u.sources;
      if (typeof u.searches === 'number') searches = u.searches;
      render();
    },
    setElapsed: (s) => { secs = s; render(); },
  };
}

function renderError(card: HTMLElement, msg: string) {
  card.innerHTML =
    HEAD +
    `<span class="${NS}-status" data-testid="${NS}-error">⚠︎ ${msg}</span>` +
    `<button class="${NS}-retry">Retry</button>`;
  card.querySelector(`.${NS}-retry`)?.addEventListener('click', () => void runLookup(card));
}

function renderResult(card: HTMLElement, entry: SocialsEntry) {
  const rows: string[] = [];
  if (entry.github) rows.push(accountRow('github', entry.github, entry));
  if (entry.x) rows.push(accountRow('x', entry.x, entry));
  if (entry.website) rows.push(websiteRow(entry.website));
  const body = rows.length
    ? `<span class="${NS}-rows">${rows.join('')}</span>`
    : `<span class="${NS}-status" data-testid="${NS}-none">No public GitHub or X found</span>`;
  // The header with the refresh control inline after the "Socials" title.
  card.innerHTML =
    `<span class="${NS}-head"><span class="${NS}-mark">${AIRGLOW_ICON}</span>Socials` +
    `<button class="${NS}-refresh" title="Re-run lookup" data-testid="${NS}-refresh">↻</button></span>` +
    body;
  // Website favicon that won't load → globe. Inline onerror would run in the
  // page world and trip LinkedIn's CSP; listeners don't.
  card.querySelectorAll<HTMLImageElement>(`img[data-${NS}-fallback]`).forEach((img) => {
    img.addEventListener('error', () => { img.src = img.dataset[`${NS}Fallback`] ?? img.src; }, { once: true });
  });
  attachHoverCard(card, 'github', entry);
  attachHoverCard(card, 'x', entry);
  card.querySelector(`.${NS}-refresh`)?.addEventListener('click', async () => {
    await airglow.storage.delete(cacheKey(entry.slug));
    void runLookup(card);
  });
}

async function runLookup(card: HTMLElement) {
  if (running) return;
  running = true;
  const slug = currentSlug();
  const profileUrl = `https://www.linkedin.com/in/${slug}/`;
  const pill = renderLoading(card);
  const started = Date.now();
  const ticker = setInterval(() => pill.setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
  try {
    const scraped = scrapeProfile();
    if (!scraped.name) throw new Error('could not read the profile name');
    const resp = await findSocials(
      { name: scraped.name, headline: scraped.headline, location: scraped.location, profileUrl },
      pill.update,
    );
    if (!resp?.ok) throw new Error(resp?.error || 'lookup failed');
    const entry: SocialsEntry = {
      slug,
      name: scraped.name,
      headline: scraped.headline,
      profileUrl,
      github: resp.github ?? null,
      x: resp.x ?? null,
      website: resp.website ?? null,
      githubProfile: resp.githubProfile ?? null,
      xProfile: resp.xProfile ?? null,
      sources: resp.sources,
      trace: resp.trace,
      model: resp.model,
      searches: resp.searches ?? null,
      fetchedAt: Date.now(),
    };
    await airglow.storage.set(cacheKey(slug), entry);
    airglow.log.info('socials found', { slug, github: entry.github?.handle ?? null, x: entry.x?.handle ?? null });
    if (currentSlug() === slug && card.isConnected) renderResult(card, entry);
  } catch (e: any) {
    airglow.log.error('socials lookup failed', { slug, error: e?.message });
    if (currentSlug() === slug && card.isConnected) renderError(card, e?.message || 'Lookup failed');
  } finally {
    clearInterval(ticker);
    running = false;
  }
}

// ── Injection / SPA lifecycle ─────────────────────────────────────────────────

let settingUp = false;

async function setupCard() {
  if (settingUp) return;
  const slug = currentSlug();
  if (!slug || document.getElementById(CARD_ID)) return;
  const ns = findTopCardSection();
  if (!ns) return; // top card not hydrated yet — poll retries

  settingUp = true;
  try {
    ensureStyle();
    const card = document.createElement('div');
    card.id = CARD_ID;
    // Own section in the main column, right below the top card (so above
    // Sales Navigator / Featured / About). The card stack is the first
    // ancestor level where the top card has ANY element sibling — every level
    // below is a sole-child wrapper. Don't look for <section> siblings: on the
    // obfuscated-class layout the stacked cards are plain <div> wrappers, and
    // matching structure (sibling <section>) overshoots to the page-columns
    // level, dropping the card between main column and right rail.
    let anchor: HTMLElement = ns.section;
    while (
      anchor.parentElement &&
      anchor.parentElement !== document.body &&
      anchor.parentElement.tagName !== 'MAIN' &&
      !anchor.nextElementSibling
    ) {
      anchor = anchor.parentElement;
    }
    anchor.insertAdjacentElement('afterend', card);

    const cached = (await airglow.storage.get(cacheKey(slug))) as SocialsEntry | undefined;
    if (currentSlug() !== slug || !card.isConnected) return;
    if (cached) {
      renderResult(card, cached);
    } else {
      renderButton(card);
      const auto = (await airglow.storage.get('auto_find')) as boolean | undefined;
      if (auto && currentSlug() === slug && card.isConnected) void runLookup(card);
    }
  } finally {
    settingUp = false;
  }
}

function init() {
  void setupCard();
  // LinkedIn is a SPA: one poll re-scopes on URL change and re-inserts the card
  // whenever a profile page lacks it (initial hydration or a re-render wiped it).
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      document.getElementById(CARD_ID)?.remove();
    }
    if (/^\/in\/[^/]+/.test(window.location.pathname) && !document.getElementById(CARD_ID)) {
      void setupCard();
    }
  }, 800);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Test hook (userscript world is isolated from the page): lets
// `airglow browser eval --app socials-finder` drive a lookup directly.
(globalThis as any).__agsfTest = { findSocials, ...__enrich };
