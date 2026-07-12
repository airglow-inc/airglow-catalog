// Socials Finder — LinkedIn profile pages (/in/<slug>).
//
// Injects an amber Airglow card below the top card's affiliation block (the
// company/education shortcut list): a "Find socials" button that resolves the
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

const ANCHOR_ATTR = 'data-agsf-anchor';

const CSS = `
/* The affiliation shortcut list is the card's positioning anchor: the card
   hangs absolutely below it (top: 100%), adding NO height to the top card's
   grid (in-flow it would stack into the same grid cell and overlap). */
[${ANCHOR_ATTR}] { position: relative; }
#${CARD_ID} {
  position: absolute; top: 100%; left: 0; z-index: 10;
  display: inline-flex; flex-direction: column; gap: 10px;
  margin-top: 12px; padding: 10px 14px; max-width: 300px; width: max-content; box-sizing: border-box;
  background: linear-gradient(180deg, #FFFCF4, #FFFDFA);
  border: 1.5px solid #F5A623; border-radius: 10px;
  box-shadow: 0 2px 10px rgba(245,166,35,0.14), 0 0 0 1px rgba(245,166,35,0.08);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
/* Fallback when no affiliation block is found: normal flow at the end of the top card. */
#${CARD_ID}.${NS}-inflow { position: relative; top: auto; left: auto; }
#${CARD_ID} .${NS}-btn {
  display: inline-flex; align-items: center; gap: 8px;
  border: none; background: none; padding: 2px 2px; margin: 0; cursor: pointer;
  font: 600 14px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: rgba(0,0,0,0.9);
}
#${CARD_ID} .${NS}-btn:hover { text-decoration: underline; }
#${CARD_ID} .${NS}-mark { width: 22px; height: 22px; border-radius: 5px; overflow: hidden; display: inline-flex; flex-shrink: 0; }
#${CARD_ID} .${NS}-mark svg { width: 22px; height: 22px; }
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
  position: absolute; top: 6px; right: 8px; border: none; background: none;
  padding: 0 2px; cursor: pointer; font-size: 16px; line-height: 1;
  color: rgba(0,0,0,0.35);
}
#${CARD_ID} .${NS}-refresh:hover { color: rgba(0,0,0,0.7); }
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

// The affiliation block: the top card's company/education shortcut list (the
// "Perplexity / Harvard University" block). Match the innermost small controls
// holding exactly one logo <img> and a short label; the block is their common
// container. Live-DOM-verified pattern from the demo-video branch (July 2026).
const RAIL_CONTROL = 'li, button, a, [role="button"]';
function findAffiliationBlock(section: HTMLElement, titleName: string): HTMLElement | null {
  const entries = Array.from(section.querySelectorAll<HTMLElement>(RAIL_CONTROL)).filter((el) => {
    const t = (el.textContent ?? '').trim();
    if (!t || t.length >= 60 || t === titleName) return false;
    if (el.querySelectorAll('img').length !== 1) return false;
    return !Array.from(el.querySelectorAll(RAIL_CONTROL)).some((inner) => inner.querySelector('img'));
  });
  if (!entries.length) return null;
  const last = entries[entries.length - 1];
  return (last.parentElement as HTMLElement) ?? last;
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

// Row: profile photo (brand logo when enrichment is missing — e.g. entries
// cached before it existed), platform label, then handle · stat.
function accountRow(kind: 'github' | 'x', acct: FoundAccount, entry: SocialsEntry): string {
  const label = kind === 'github' ? 'GitHub' : 'X';
  const logo = kind === 'github' ? GH_LOGO : X_LOGO;
  const profile = kind === 'github' ? entry.githubProfile : entry.xProfile;
  const avatar = profile?.avatar
    ? `<img src="${esc(profile.avatar)}" alt="${label}" class="${kind === 'x' ? `${NS}-avatar-x` : ''}" data-${NS}-fallback="${logo}">`
    : `<img src="${logo}" alt="${label}">`;
  const stat = kind === 'github'
    ? (entry.githubProfile ? ` · ${fmtCount(entry.githubProfile.repos)} repos` : '')
    : (entry.xProfile ? ` · ${fmtCount(entry.xProfile.followers)} followers` : '');
  return (
    `<a class="${NS}-acct" href="${acct.url}" target="_blank" rel="noopener noreferrer" data-testid="${NS}-${kind}">` +
    avatar +
    `<span><span class="${NS}-acct-name">${label}</span><br>` +
    `<span class="${NS}-acct-handle">${esc(acct.handle)}${stat}</span></span></a>`
  );
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
    `<button class="${NS}-btn" data-testid="${NS}-find">` +
    `<span class="${NS}-mark">${AIRGLOW_ICON}</span>Find socials</button>`;
  card.querySelector(`.${NS}-btn`)?.addEventListener('click', () => void runLookup(card));
}

// Live pill. Top line: the coarse phase, or the latest page the model just read
// ("🔗 github.com") once citations start streaming. Second line: running
// metadata — "N searches · M sources · Ts". The counts come from findSocials's
// streamed progress (url_citations → sources, usage → searches); elapsed ticks
// locally. Returns the updaters.
function renderLoading(card: HTMLElement): { update: (u: Progress) => void; setElapsed: (s: number) => void } {
  card.innerHTML =
    `<span class="${NS}-status" data-testid="${NS}-loading"><span class="${NS}-spin"></span>` +
    `<span class="${NS}-phase">Searching the web…</span></span>` +
    `<span class="${NS}-meta" data-testid="${NS}-meta"></span>`;
  const phaseEl = card.querySelector<HTMLElement>(`.${NS}-phase`);
  const metaEl = card.querySelector<HTMLElement>(`.${NS}-meta`);
  let phase = 'Searching the web…';
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
    ? rows.join('')
    : `<span class="${NS}-status" data-testid="${NS}-none">No public GitHub or X found</span>`;
  card.innerHTML =
    body +
    `<button class="${NS}-refresh" title="Re-run lookup" data-testid="${NS}-refresh">↻</button>`;
  // Remote avatar gone (renamed/deleted account) → brand logo. Inline onerror
  // would run in the page world and trip LinkedIn's CSP; listeners don't.
  card.querySelectorAll<HTMLImageElement>(`img[data-${NS}-fallback]`).forEach((img) => {
    img.addEventListener('error', () => { img.src = img.dataset[`${NS}Fallback`] ?? img.src; }, { once: true });
  });
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
    const titleName = document.title.replace(/\s*\|.*$/, '').trim();
    const block = findAffiliationBlock(ns.section, titleName);
    // Below the affiliation block when present; end of the top card otherwise.
    if (block) {
      block.setAttribute(ANCHOR_ATTR, '');
      block.appendChild(card);
      // The card hangs outside the anchor's box and the top card is
      // overflow:hidden, so it clips the card on two sides: cap the width to
      // the room left of the section's right padding edge, and grow the
      // section's bottom padding by however far the card overhangs its bottom
      // (the card's height changes as it swaps button → pill → result).
      const basePad = parseFloat(getComputedStyle(ns.section).paddingBottom) || 0;
      let addedPad = 0;
      const clamp = () => {
        const sRect = ns.section.getBoundingClientRect();
        const room = sRect.right - block.getBoundingClientRect().left - 24;
        card.style.maxWidth = `${Math.min(300, Math.max(160, Math.round(room)))}px`;
        const overhang = Math.max(0, Math.ceil(card.getBoundingClientRect().bottom - (sRect.bottom - addedPad)) + 12);
        if (overhang !== addedPad) {
          addedPad = overhang;
          ns.section.style.paddingBottom = overhang ? `${basePad + overhang}px` : '';
        }
      };
      clamp();
      const ro = new ResizeObserver(() => {
        if (!card.isConnected) {
          ro.disconnect();
          ns.section.style.paddingBottom = '';
          return;
        }
        clamp();
      });
      ro.observe(ns.section);
      ro.observe(card);
    } else {
      card.classList.add(`${NS}-inflow`);
      ns.section.appendChild(card);
    }

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
