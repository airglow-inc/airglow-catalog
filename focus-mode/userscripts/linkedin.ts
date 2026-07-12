// Focus Mode — LinkedIn
// Full-block mode (default): replaces the entire site with a focus screen.
// Feed-only mode: hides posts, composer, right rail, distracting sidebars.
// @ts-ignore — airglow SDK injected at runtime

import { observeCoalesced, keepPageTall } from './observe';
import { siteGate } from './gate';

;(function () {

const FULL_BLOCK_KEY = 'focus_mode_linkedin_full_block';
const FULL_OVERLAY_ID = 'airglow-focus-mode-li-full';

const FULL_BLOCK_CSS = `
html.airglow-li-blocked, html.airglow-li-blocked body {
  overflow: hidden !important;
}
#${FULL_OVERLAY_ID} {
  position: fixed; inset: 0; z-index: 2147483645;
  display: flex; align-items: center; justify-content: center;
  background: #f4f2ee; color: #1d2226;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  opacity: 0; transition: opacity 0.3s ease-out;
}
#${FULL_OVERLAY_ID}.visible { opacity: 1; }
#${FULL_OVERLAY_ID} .afb-card {
  position: relative;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: #ffffff;
  border: 2px solid #F99E3D;
  border-radius: 16px;
  padding: 48px 56px 52px;
  box-shadow: 0 4px 20px rgba(249, 158, 61, 0.1);
  max-width: 520px;
}
#${FULL_OVERLAY_ID} .afb-clock { margin-bottom: 28px; }
#${FULL_OVERLAY_ID} .afb-title {
  font-size: 32px; font-weight: 700; letter-spacing: -0.02em;
  margin: 0 0 12px; color: #1d2226;
}
#${FULL_OVERLAY_ID} .afb-sub {
  font-size: 18px; line-height: 1.5; color: #56687a; margin: 0;
  max-width: 480px; text-align: center; padding: 0 24px;
}
.afb-badge {
  position: absolute; top: 16px; right: 18px;
  display: flex; align-items: center; gap: 7px;
  font-size: 16px; color: #56687a;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.afb-badge svg { display: block; }
.afb-badge strong { color: #1d2226; font-weight: 700; }
`;

function buildFullOverlay(): HTMLElement {
  const el = document.createElement('div');
  el.id = FULL_OVERLAY_ID;
  el.innerHTML = `
    <div class="afb-card">
      ${AIRGLOW_BADGE_HTML}
      <div class="afb-clock">${CLOCK_SVG}</div>
      <h1 class="afb-title">Time to do great things</h1>
    </div>
  `;
  return el;
}

function ensureFullBlockStyle() {
  const ID = 'airglow-focus-mode-li-full-style';
  if (document.getElementById(ID)) return;
  const style = document.createElement('style');
  style.id = ID;
  style.textContent = FULL_BLOCK_CSS;
  (document.head || document.documentElement).appendChild(style);
}

function showFullBlock() {
  ensureFullBlockStyle();
  document.documentElement.classList.add('airglow-li-blocked');
  if (document.getElementById(FULL_OVERLAY_ID)) return;
  const overlay = buildFullOverlay();
  (document.body || document.documentElement).appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
    if (!clockRaf) clockRaf = requestAnimationFrame(tickClock);
  });
  // The overlay may be appended before <body> exists; re-parent to body once it does.
  if (!document.body) {
    const reparent = new MutationObserver(() => {
      if (document.body && overlay.parentElement !== document.body) {
        document.body.appendChild(overlay);
        reparent.disconnect();
      }
    });
    reparent.observe(document.documentElement, { childList: true, subtree: true });
  }
}

const STYLE_ID = 'airglow-focus-mode-li';

/* LinkedIn ships randomized hashed class names that rotate every build, so all
   selectors below key off stable data-view-name attributes instead of classes. */
const FEED_CSS = `
/* Hide feed posts (including promoted), composer, sort toggle, new-posts pill */
[data-view-name="feed-full-update"],
[data-view-name="share-sharebox-focus"],
[data-view-name="feed-nav-feed-sort-toggle"],
[data-view-name="feed-new-update-pill"] {
  display: none !important;
}

/* Motivational banner */
#airglow-focus-banner {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 72px 32px;
  margin-top: 16px;
  border-radius: 12px;
  background: #ffffff;
  border: 2px solid #F99E3D;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  animation: airglow-fade-in 0.6s ease-out;
}
#airglow-focus-banner .afb-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.5px;
  margin: 0 0 12px;
  line-height: 1.2;
  color: #1d2226;
}
#airglow-focus-banner .afb-sub {
  font-size: 18px;
  font-weight: 400;
  margin: 0;
  color: #56687a;
}
#airglow-focus-banner .afb-badge {
  position: absolute; top: 14px; right: 16px;
  display: flex; align-items: center; gap: 7px;
  font-size: 16px; color: #56687a;
}
#airglow-focus-banner .afb-badge svg { display: block; }
#airglow-focus-banner .afb-badge strong { color: #1d2226; font-weight: 700; }
@keyframes airglow-fade-in {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

/* Styles applied on ALL LinkedIn pages (not just feed) */
const GLOBAL_CSS = `
/* Hide the feed's right rail (news, promoted, puzzles). Profile-page sidebars
   are handled separately by hideDistractingSections() via heading text. */
aside:has([data-view-name="news-module"]) {
  display: none !important;
}

/* Hide ONLY the persistent bottom-right messaging widget (the always-on
   conversation-list bubble). Do NOT hide the overlay container or individual
   conversation/compose windows — those open when the user deliberately clicks
   "Message" on a profile, and must keep working. */
.msg-overlay-list-bubble {
  display: none !important;
}

/* Hide notification count badges in nav (red circles with numbers).
   LinkedIn has two nav variants: old (class-based) and new (obfuscated). */
.notification-badge--show,
.notification-badge__count,
[aria-label*="new notification"] span[data-color-scheme],
[aria-label*="new update"] span[data-color-scheme],
[aria-label*="new message"] span[data-color-scheme],
[aria-label*="new invite"] span[data-color-scheme] {
  display: none !important;
}
`;

const GLOBAL_STYLE_ID = 'airglow-focus-mode-li-global';

const BANNER_ID = 'airglow-focus-banner';
let clockRaf = 0;
// Stopper for keepPageTall, held while the feed is hidden (feed-only mode).
// LinkedIn display:none's feed posts, collapsing the center column and tripping
// its infinite scroll, so we keep the page taller than the viewport to stop it.
let stopKeepTall: (() => void) | null = null;

const CLOCK_SVG = `<svg width="160" height="160" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="95" fill="#eaf1fb" stroke="#d0e1f5" stroke-width="2"/>
  <circle cx="100" cy="100" r="88" fill="none" stroke="#d8e6f6" stroke-width="0.5"/>
  ${Array.from({length: 12}, (_, i) => {
    const a = (i * 30 - 90) * Math.PI / 180;
    return `<line x1="${100 + 80 * Math.cos(a)}" y1="${100 + 80 * Math.sin(a)}" x2="${100 + 88 * Math.cos(a)}" y2="${100 + 88 * Math.sin(a)}" stroke="#0a66c2" stroke-width="2" stroke-linecap="round"/>`;
  }).join('')}
  ${Array.from({length: 60}, (_, i) => {
    if (i % 5 === 0) return '';
    const a = (i * 6 - 90) * Math.PI / 180;
    return `<line x1="${100 + 84 * Math.cos(a)}" y1="${100 + 84 * Math.sin(a)}" x2="${100 + 88 * Math.cos(a)}" y2="${100 + 88 * Math.sin(a)}" stroke="#b3cde8" stroke-width="1" stroke-linecap="round"/>`;
  }).join('')}
  <line id="afb-hour" x1="100" y1="100" x2="100" y2="50" stroke="#1d2226" stroke-width="3.5" stroke-linecap="round"/>
  <line id="afb-min" x1="100" y1="100" x2="100" y2="35" stroke="#1d2226" stroke-width="2" stroke-linecap="round"/>
  <line id="afb-sec" x1="100" y1="100" x2="100" y2="30" stroke="#0a66c2" stroke-width="1" stroke-linecap="round"/>
  <circle cx="100" cy="100" r="4" fill="#0a66c2"/>
  <circle cx="100" cy="100" r="4" fill="#0a66c2">
    <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite"/>
  </circle>
</svg>`;

// Small "Made by Airglow" badge shown in the top-right of the focus surfaces.
const AIRGLOW_ICON_SVG = `<svg width="21" height="21" viewBox="245 250 520 520" aria-hidden="true">
  <g transform="translate(52, 18) scale(0.98)">
    <path fill="#1c1917" d="M416.6 246.2 L200.8 753.5 L707.6 753.5 L490.8 246.2 Z"/>
    <path fill="#F8BB5B" fill-rule="evenodd" d="M416.6 246.2 L210.4 731 L313 649.9 L326.7 649.9 L446.9 551.2 L539.7 639.1 L560.2 640.1 L698 731 L490.8 246.2 Z M392.1 543.3 L510.4 543.3 L450.8 382.1 Z"/>
    <path fill="#F99E3D" d="M200.8 753.5 L318.8 753.5 L355 678.2 L393.1 697.8 L448.8 634.2 L473.3 659.6 L468.4 634.2 L475.2 627.4 L446.9 570.7 L334.5 667.5 Z"/>
    <path fill="#F99E3D" d="M595.4 753.5 L707.6 753.5 L556.3 669.4 Z"/>
  </g>
</svg>`;
const AIRGLOW_BADGE_HTML = `<div class="afb-badge">${AIRGLOW_ICON_SVG}<span>Made by <strong>Airglow</strong></span></div>`;

function tickClock() {
  const banner = document.getElementById(BANNER_ID);
  if (!banner) { clockRaf = 0; return; }
  const now = new Date();
  const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds(), ms = now.getMilliseconds();
  const hands: [string, number, number][] = [
    ['#afb-hour', (h * 30 + m * 0.5) - 90, 45],
    ['#afb-min',  (m * 6 + s * 0.1) - 90, 60],
    ['#afb-sec',  ((s + ms / 1000) * 6) - 90, 60],
  ];
  for (const [sel, deg, len] of hands) {
    const el = banner.querySelector(sel) as SVGLineElement | null;
    if (!el) continue;
    const rad = deg * Math.PI / 180;
    el.setAttribute('x2', String(100 + len * Math.cos(rad)));
    el.setAttribute('y2', String(100 + len * Math.sin(rad)));
  }
  clockRaf = requestAnimationFrame(tickClock);
}

// LinkedIn lays the feed out as the middle of a 3-column <section>
// [left profile rail | center feed | right news rail]. Class names are
// build-randomized, so locate the columns structurally: climb from the composer
// (its aria-label is stable; data-view-name is a fallback for an older build) to
// the column that is a direct child of the layout <section>.
function feedColumns(): { grid: HTMLElement; center: HTMLElement } | null {
  const composer = document.querySelector(
    '[aria-label="Start a post"], [data-view-name="share-sharebox-focus"]'
  );
  if (!composer) return null;
  let center = composer as HTMLElement;
  while (center.parentElement && center.tagName !== 'SECTION') {
    center = center.parentElement;
  }
  const grid = center.parentElement;
  if (center.tagName !== 'SECTION' || !grid) return null;
  return { grid, center };
}

// Hide the feed (center column content) and every rail to its right (news, ads,
// puzzles), then drop the banner into the center column. Keeps the left profile rail.
function injectBanner() {
  if (!isFeedPage()) return;
  const cols = feedColumns();
  if (!cols) return;
  for (const child of Array.from(cols.center.children) as HTMLElement[]) {
    if (child.id !== BANNER_ID) child.style.setProperty('display', 'none', 'important');
  }
  const sections = Array.from(cols.grid.children) as HTMLElement[];
  for (const s of sections.slice(sections.indexOf(cols.center) + 1)) {
    s.style.setProperty('display', 'none', 'important');
  }

  if (document.getElementById(BANNER_ID)) return;
  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.innerHTML = `
    ${AIRGLOW_BADGE_HTML}
    <div style="margin-bottom: 28px;">${CLOCK_SVG}</div>
    <p class="afb-title">Time to do great things</p>
  `;
  cols.center.prepend(banner);
  if (!clockRaf) clockRaf = requestAnimationFrame(tickClock);
}

function removeBanner() {
  document.getElementById(BANNER_ID)?.remove();
  if (clockRaf) { cancelAnimationFrame(clockRaf); clockRaf = 0; }
}

const HIDE_PATTERNS = [
  'More profiles for you',
  'you may know',
  'People also viewed',
  'your viewers also viewed',
  'People to follow',
  'More suggestions for you',
  'Suggestions for you',
  'Based on your recent activity',
  'Explore Premium',
  'You might like',
  'People who are hiring',
  'providers you might be interested in',
];

function isFeedPage() {
  // Direct load: /feed/ or /. SPA nav: LinkedIn loads feed in /preload/ iframe.
  return /^\/(feed\/?)?$/.test(location.pathname) || location.pathname === '/preload/';
}

function isCompanyPage() {
  // Company pages (incl. /people/) are visited intentionally; their employee
  // list is headed "People you may know", which would otherwise be hidden as a
  // distraction. Skip section-hiding here so the people list stays visible.
  return /^\/company\//.test(location.pathname);
}

function updateFeedStyle() {
  const existing = document.getElementById(STYLE_ID);
  if (isFeedPage()) {
    if (!existing) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = FEED_CSS;
      (document.head || document.documentElement).appendChild(style);
    }
    if (!stopKeepTall) stopKeepTall = keepPageTall();
    injectBanner();
  } else {
    existing?.remove();
    stopKeepTall?.();
    stopKeepTall = null;
    removeBanner();
  }
}

function hideMessagingOverlay() {
  if (!document.body) return;
  // Hide only the persistent conversation-list widget. Conversation/compose
  // windows that open from a profile's "Message" button live in sibling
  // ".msg-overlay-conversation-bubble" nodes and are intentionally left alone.
  document.querySelectorAll('.msg-overlay-list-bubble').forEach((el) => {
    (el as HTMLElement).style.setProperty('display', 'none', 'important');
  });
}

function hideDistractingSections(root: ParentNode = document) {
  if (isCompanyPage()) return;
  const headings = root.querySelectorAll('h2, h3');
  for (const h of headings) {
    const text = h.textContent?.trim() || '';
    if (HIDE_PATTERNS.some((p) => text.includes(p))) {
      const section = h.closest('section') || h.parentElement?.parentElement?.parentElement;
      if (section instanceof HTMLElement && section.style.display !== 'none') {
        section.style.display = 'none';
      }
    }
  }
}

async function init() {
  const siteEnabled = (await siteGate('linkedin')) === 'on';
  let fullBlock = true; // default to full-site block

  try {
    const v = await airglow.storage.get(FULL_BLOCK_KEY);
    if (v === 'false' || v === false) fullBlock = false;
  } catch {}

  if (!siteEnabled) return;

  if (fullBlock) {
    showFullBlock();
    return;
  }

  // ── Feed-only mode (legacy behaviour) ──

  if (!document.getElementById(GLOBAL_STYLE_ID)) {
    const gs = document.createElement('style');
    gs.id = GLOBAL_STYLE_ID;
    gs.textContent = GLOBAL_CSS;
    (document.head || document.documentElement).appendChild(gs);
  }

  updateFeedStyle();
  hideDistractingSections();
  hideMessagingOverlay();

  const runHide = () => {
    hideDistractingSections();
    hideMessagingOverlay();
    injectBanner();
  };

  // Coalesced: LinkedIn's feed mutates constantly and hideDistractingSections()
  // scans every h2/h3 on the page, so running this per-mutation pegs the tab —
  // one pass per animation frame instead. documentElement exists at
  // document_start, but keep a fallback for the early case.
  if (document.documentElement) {
    observeCoalesced(document.documentElement, runHide);
  } else {
    document.addEventListener('DOMContentLoaded', () => observeCoalesced(document.documentElement, runHide), { once: true });
  }

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      updateFeedStyle();
      hideDistractingSections();
      hideMessagingOverlay();
    }
  }, 500);
}

init();

})();
