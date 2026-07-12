// Focus Mode — X (Twitter)
// On x.com/home: keeps the post composer (input window) visible and hides the
// entire timeline plus the right sidebar (trends, who to follow, news). The
// emptied timeline renders a calm focus card, and a floating card in the
// top-right counts how many times you've opened x.com today.
// Other routes (notifications, profile, search) are untouched.
// @ts-ignore — airglow SDK injected at runtime
export {};

import { observeCoalesced, keepPageTall } from './observe';
import { siteGate } from './gate';

;(function () {

const STYLE_ID = 'airglow-focus-mode-x';
let active = false;
let disabledByUser = false;
// When the X toggle is turned off in the Focus Mode app, this also suppresses
// the floating "times opened" count card (not just the feed-hiding).
let cardDisabled = false;

const css = `
/* Hide the entire right sidebar */
[data-testid="sidebarColumn"] {
  display: none !important;
}

/* Hide post confirmation toast */
[data-testid="toast"] {
  display: none !important;
}

/* Collapse the virtualized timeline's reserved height so there's no big gap */
[aria-label^="Timeline:" i] > div {
  min-height: 0 !important;
}

/* Hide every timeline post. */
[aria-label^="Timeline:" i] [data-testid="cellInnerDiv"] {
  display: none !important;
}

/* The emptied timeline IS the focus card — chrome lives on the timeline
   container itself (NOT a real DOM node): an analog clock (recolored to X blue)
   on top via background-image, a bold title (::before) and a muted description
   (::after) below it. X's timeline is a React-managed virtualized list; a
   pseudo-element is invisible to React, so it can never trip the recycle error
   ("Something went wrong. Try reloading."). */
[aria-label^="Timeline:" i] {
  display: block !important;
  width: fit-content !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  margin: 16px auto 10px !important;
  padding: 218px 64px 36px !important;
  border-radius: 18px !important;
  background-color: transparent !important;
  background-image: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 200 200"%3E%3Ccircle cx="100" cy="100" r="95" fill="%23e8f3fc" stroke="%23cfd9de" stroke-width="2"/%3E%3Ccircle cx="100" cy="100" r="86" fill="none" stroke="%23eff3f4" stroke-width="1"/%3E%3Cline x1="100" y1="20" x2="100" y2="10" stroke="%231d9bf0" stroke-width="2.5" stroke-linecap="round"/%3E%3Cline x1="140" y1="30.7" x2="145" y2="22.1" stroke="%231d9bf0" stroke-width="2.5" stroke-linecap="round"/%3E%3Cline x1="169.3" y1="60" x2="177.9" y2="55" stroke="%231d9bf0" stroke-width="2.5" stroke-linecap="round"/%3E%3Cline x1="180" y1="100" x2="190" y2="100" stroke="%231d9bf0" stroke-width="2.5" stroke-linecap="round"/%3E%3Cline x1="169.3" y1="140" x2="177.9" y2="145" stroke="%231d9bf0" stroke-width="2.5" stroke-linecap="round"/%3E%3Cline x1="140" y1="169.3" x2="145" y2="177.9" stroke="%231d9bf0" stroke-width="2.5" stroke-linecap="round"/%3E%3Cline x1="100" y1="180" x2="100" y2="190" stroke="%231d9bf0" stroke-width="2.5" stroke-linecap="round"/%3E%3Cline x1="60" y1="169.3" x2="55" y2="177.9" stroke="%231d9bf0" stroke-width="2.5" stroke-linecap="round"/%3E%3Cline x1="30.7" y1="140" x2="22.1" y2="145" stroke="%231d9bf0" stroke-width="2.5" stroke-linecap="round"/%3E%3Cline x1="20" y1="100" x2="10" y2="100" stroke="%231d9bf0" stroke-width="2.5" stroke-linecap="round"/%3E%3Cline x1="30.7" y1="60" x2="22.1" y2="55" stroke="%231d9bf0" stroke-width="2.5" stroke-linecap="round"/%3E%3Cline x1="60" y1="30.7" x2="55" y2="22.1" stroke="%231d9bf0" stroke-width="2.5" stroke-linecap="round"/%3E%3Cg%3E%3Cline x1="100" y1="100" x2="100" y2="58" stroke="%230f1419" stroke-width="4.5" stroke-linecap="round"/%3E%3CanimateTransform attributeName="transform" type="rotate" from="0 100 100" to="360 100 100" dur="43200s" repeatCount="indefinite"/%3E%3C/g%3E%3Cg%3E%3Cline x1="100" y1="100" x2="100" y2="42" stroke="%230f1419" stroke-width="3" stroke-linecap="round"/%3E%3CanimateTransform attributeName="transform" type="rotate" from="0 100 100" to="360 100 100" dur="3600s" repeatCount="indefinite"/%3E%3C/g%3E%3Cg%3E%3Cline x1="100" y1="100" x2="100" y2="34" stroke="%231d9bf0" stroke-width="1.5" stroke-linecap="round"/%3E%3CanimateTransform attributeName="transform" type="rotate" from="0 100 100" to="360 100 100" dur="60s" repeatCount="indefinite"/%3E%3C/g%3E%3Ccircle cx="100" cy="100" r="4.5" fill="%231d9bf0"/%3E%3Ccircle cx="100" cy="100" r="4.5" fill="%231d9bf0"%3E%3Canimate attributeName="r" values="4.5;11;4.5" dur="2.6s" repeatCount="indefinite"/%3E%3Canimate attributeName="opacity" values="0.5;0;0.5" dur="2.6s" repeatCount="indefinite"/%3E%3C/circle%3E%3C/svg%3E');
  background-repeat: no-repeat !important;
  background-position: center top 26px !important;
  background-size: 184px 184px !important;
  border: 2px solid rgba(29, 155, 240, 0.5) !important;
  font-family: -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, Helvetica, sans-serif !important;
  text-align: center !important;
}

/* Title */
[aria-label^="Timeline:" i]::before {
  content: "Time to do great things";
  display: block;
  color: #0f1419;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.5px;
  line-height: 1.2;
}
`;

function isHome() {
  return location.pathname === '/home' || location.pathname === '/home/';
}

const X_LOGO_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>';

// The Airglow mark — shared/assets/icon.svg, verbatim.
const AIRGLOW_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="245 250 520 520" aria-hidden="true">' +
  '<g transform="translate(52, 18) scale(0.98)">' +
  '<path fill="#1c1917" d="M416.6 246.2 L200.8 753.5 L707.6 753.5 L490.8 246.2 Z"/>' +
  '<path fill="#F8BB5B" fill-rule="evenodd" d="M416.6 246.2 L210.4 731 L313 649.9 L326.7 649.9 L446.9 551.2 L539.7 639.1 L560.2 640.1 L698 731 L490.8 246.2 Z M392.1 543.3 L510.4 543.3 L450.8 382.1 Z"/>' +
  '<path fill="#F99E3D" d="M200.8 753.5 L318.8 753.5 L355 678.2 L393.1 697.8 L448.8 634.2 L473.3 659.6 L468.4 634.2 L475.2 627.4 L446.9 570.7 L334.5 667.5 Z"/>' +
  '<path fill="#F99E3D" d="M595.4 753.5 L707.6 753.5 L556.3 669.4 Z"/></g></svg>';

// Hiding is mostly CSS; JS marks the hourly allowed posts and toggles the
// stylesheet by route/app setting.
// Stopper for keepPageTall, held while the feed is hidden so X's infinite
// scroll doesn't fetch endlessly into the collapsed (hidden) timeline.
let stopKeepTall: (() => void) | null = null;

function enable() {
  if (active || disabledByUser) return;
  active = true;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.documentElement.appendChild(style);
  }
  if (!stopKeepTall) stopKeepTall = keepPageTall();
}

function disable() {
  if (!active) return;
  active = false;
  document.getElementById(STYLE_ID)?.remove();
  stopKeepTall?.();
  stopKeepTall = null;
}

function sync() {
  if (disabledByUser) { disable(); return; }
  if (isHome()) enable(); else disable();
}

// SPA navigation detection: userscripts run in an isolated world, so patching
// history.pushState here does NOT intercept the page's calls. Poll pathname instead.
let lastPath = location.pathname;
setInterval(() => {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    sync();
  }
}, 200);
window.addEventListener('popstate', sync);

sync();

siteGate('x').then((state) => {
  if (state === 'on') return;
  disabledByUser = true;
  disable();
  cardDisabled = true;
  removeCard();
});

// ── Count card theming ──────────────────────────────────────────────────────
// The card is always light, matching the focus banner (which is hardcoded light
// regardless of X's theme). Sniffing X's body background to pick a theme was
// racy: at document_start X hasn't painted its theme background yet, so an early
// read returned transparent and misdetected dark mode → a black card.
const XC_STYLE_ID = 'airglow-fh-x-counter-style';

function injectXcStyles() {
  if (document.getElementById(XC_STYLE_ID)) return;
  if (!document.body) return;
  const cardBg = '#ffffff';
  // Blue accent border so the card reads as an Airglow element, not native X UI.
  const cardBorder = 'rgba(29,155,240,0.45)';
  const fgPrimary = '#0f1419';
  const fgMuted = '#536471';
  const accent = '#1d9bf0';
  const accentSoft = 'rgba(29,155,240,0.10)';
  const shadow = '0 0 0 1px rgba(0,0,0,0.02), 0 8px 28px rgba(15,20,25,0.12)';

  const css = `
#${CARD_ID} {
  position: fixed;
  top: 72px;
  right: 28px;
  width: 312px;
  max-width: calc(100vw - 40px);
  z-index: 2147483000;
  box-sizing: border-box;
  padding: 20px 22px;
  border-radius: 20px;
  background: ${cardBg};
  border: 1.5px solid ${cardBorder};
  box-shadow: ${shadow};
  font-family: "TwitterChirp", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: ${fgPrimary};
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity .35s ease, transform .35s ease;
}
#${CARD_ID}.airglow-in { opacity: 1; transform: translateY(0); }
#${CARD_ID} .xc-head {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 700; letter-spacing: .01em;
  color: ${fgMuted}; text-transform: uppercase;
}
#${CARD_ID} .xc-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 8px;
  background: ${accentSoft};
}
#${CARD_ID} .xc-badge svg { width: 16px; height: 16px; fill: ${accent}; }
#${CARD_ID} .xc-count {
  display: flex; align-items: center; gap: 16px; margin: 14px 0 2px;
}
#${CARD_ID} .xc-num {
  font-size: 52px; line-height: 1; font-weight: 800; letter-spacing: -0.03em;
  color: ${fgPrimary}; font-variant-numeric: tabular-nums;
}
#${CARD_ID} .xc-unit { font-size: 17px; font-weight: 600; color: ${fgMuted}; }
#${CARD_ID} .xc-made {
  display: flex; align-items: center; justify-content: flex-end; gap: 6px;
  margin-top: 16px; font-size: 15px; font-weight: 400; color: ${fgMuted};
}
#${CARD_ID} .xc-made b { font-weight: 700; color: ${fgPrimary}; }
#${CARD_ID} .xc-made svg { width: 18px; height: 18px; display: block; }
`;
  const style = document.createElement('style');
  style.id = XC_STYLE_ID;
  style.textContent = css;
  document.documentElement.appendChild(style);
}

// ── Daily "times opened" count card ─────────────────────────────────────────
// A floating card (top-right, all x.com routes) showing how many times x.com was
// opened today. The count lives only in this app's local storage.
const CARD_ID = 'airglow-fh-x-counter-card';
const COUNT_KEY = 'x_open_count'; // { date: 'YYYY-MM-DD', count: number }
let currentCount = 1;
let counted = false;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function bumpCount(): Promise<number> {
  const today = todayStr();
  let stored: any;
  try { stored = await airglow.storage.get(COUNT_KEY); } catch { stored = null; }
  let count = 1;
  if (stored && stored.date === today && typeof stored.count === 'number') {
    count = stored.count + 1;
  }
  try { await airglow.storage.set(COUNT_KEY, { date: today, count }); } catch {}
  return count;
}

// Horizontally center the card in the empty space to the right of the
// (hidden-sidebar) post column — between the primary column's right edge and the
// viewport edge. Measured in JS because that gap's position depends on X's
// centered layout, which CSS can't see. Vertical position stays pinned to top.
function positionCard() {
  const card = document.getElementById(CARD_ID) as HTMLElement | null;
  if (!card) return;
  const vw = window.innerWidth;
  const col = document.querySelector('[data-testid="primaryColumn"]') as HTMLElement | null;
  const colRight = col ? col.getBoundingClientRect().right : vw * 0.62;
  const cardW = card.offsetWidth || 312;
  let left = (colRight + vw) / 2 - cardW / 2;
  left = Math.max(colRight + 16, Math.min(left, vw - cardW - 16));
  card.style.left = `${Math.round(left)}px`;
  card.style.right = 'auto';
  card.style.top = '72px';
}

function removeCard() {
  document.getElementById(CARD_ID)?.remove();
}

function renderCard() {
  if (cardDisabled) return;
  if (!document.body) return;
  const existing = document.getElementById(CARD_ID);
  if (existing) {
    const n = existing.querySelector('.xc-num');
    if (n) n.textContent = String(currentCount);
    positionCard();
    return;
  }
  injectXcStyles();
  const card = document.createElement('div');
  card.id = CARD_ID;
  card.innerHTML =
    `<div class="xc-head"><span class="xc-badge">${X_LOGO_SVG}</span><span>Today on X</span></div>` +
    `<div class="xc-count"><span class="xc-num">${currentCount}</span><span class="xc-unit">times opened</span></div>` +
    `<div class="xc-made">${AIRGLOW_ICON_SVG}<span>Made by <b>Airglow</b></span></div>`;
  document.body.appendChild(card);
  positionCard();
  requestAnimationFrame(() => { positionCard(); card.classList.add('airglow-in'); });
}

(async function countCard() {
  if (!counted) {
    counted = true;
    currentCount = await bumpCount();
  }
  const tryRender = () => { if (!cardDisabled && document.body) renderCard(); };
  if (document.body) tryRender();
  else document.addEventListener('DOMContentLoaded', tryRender, { once: true });

  // Keep it centered in the right gap as the layout settles / the window resizes.
  window.addEventListener('resize', positionCard);
  [150, 500, 1200].forEach((t) => setTimeout(positionCard, t));

  // X re-renders aggressively; re-add the card if it's torn out.
  const startObs = () => observeCoalesced(document.documentElement, () => {
    if (cardDisabled) return;
    if (counted && document.body && !document.getElementById(CARD_ID)) renderCard();
  });
  if (document.documentElement) startObs();
  else document.addEventListener('DOMContentLoaded', startObs, { once: true });
})();

// ── Hide videos ─────────────────────────────────────────────────────────────
// Replaces every video player on X (not just /home) with a small "Video attached"
// pill so the video itself never renders or plays. Toggled from the Focus Mode
// app page; on by default.
(function hideVideos() {
  const PILL_CLASS = 'airglow-video-pill';
  const HIDDEN_ATTR = 'data-airglow-video-hidden';
  const VIDEO_STYLE_ID = 'airglow-focus-mode-x-video';
  let hideEnabled = false;

  const css = `
[${HIDDEN_ATTR}] { display: none !important; }
.${PILL_CLASS} {
  display: inline-flex;
  align-self: flex-start;
  width: fit-content;
  max-width: fit-content;
  align-items: center;
  gap: 6px;
  margin: 4px 0;
  padding: 6px 12px;
  border-radius: 9999px;
  border: 1px solid rgb(113, 118, 123);
  color: rgb(113, 118, 123);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  background: transparent;
  user-select: none;
  pointer-events: none;
  cursor: default;
}
.${PILL_CLASS} svg { width: 15px; height: 15px; fill: currentColor; flex: 0 0 auto; }
`;

  const PILL_HTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 6.5l-5 3.5V7c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-3l5 3.5v-11z"></path></svg>' +
    '<span>Video attached</span>';

  function makePill() {
    const pill = document.createElement('div');
    pill.className = PILL_CLASS;
    pill.setAttribute('aria-label', 'Video attached (hidden by Focus Mode)');
    pill.innerHTML = PILL_HTML;
    return pill;
  }

  function ensureStyle() {
    if (document.getElementById(VIDEO_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = VIDEO_STYLE_ID;
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  // The video sits inside one or more aspect-ratio wrappers (Twitter's
  // padding-bottom trick) that reserve the video's height even when the player
  // itself is display:none. Climb to the outermost of those wrappers so the
  // whole block collapses, then drop the pill in its place.
  function mediaContainer(player: HTMLElement): HTMLElement {
    // Walk up a few levels and stop at the FIRST aspect-ratio wrapper
    // (Twitter's padding-bottom box). Going higher risks grabbing the whole
    // post, so we cap the climb and never leave the video's own subtree.
    let el: HTMLElement | null = player.parentElement;
    for (let i = 0; i < 4 && el; i++) {
      if (el.querySelectorAll('[data-testid="videoPlayer"]').length !== 1) break;
      if (el.className && /\br-1adg3ll\b/.test(el.className)) return el;
      el = el.parentElement;
    }
    return player;
  }

  function apply() {
    if (!hideEnabled) return;
    document.querySelectorAll('[data-testid="videoPlayer"]').forEach((el) => {
      const player = el as HTMLElement;
      // Pause any video inside so nothing plays before/while it's hidden.
      player.querySelectorAll('video').forEach((v) => {
        try { (v as HTMLVideoElement).pause(); } catch {}
        try { (v as HTMLVideoElement).autoplay = false; } catch {}
      });
      const target = mediaContainer(player);
      if (target.hasAttribute(HIDDEN_ATTR)) return;
      target.setAttribute(HIDDEN_ATTR, '');
      const prev = target.previousElementSibling;
      if (!prev || !prev.classList.contains(PILL_CLASS)) {
        target.parentElement?.insertBefore(makePill(), target);
      }
    });
  }

  function unhideAll() {
    document.getElementById(VIDEO_STYLE_ID)?.remove();
    document.querySelectorAll('[' + HIDDEN_ATTR + ']').forEach((el) => el.removeAttribute(HIDDEN_ATTR));
    document.querySelectorAll('.' + PILL_CLASS).forEach((el) => el.remove());
  }

  if (document.documentElement) {
    observeCoalesced(document.documentElement, () => { if (hideEnabled) apply(); });
  }

  airglow.storage.get('focus_mode_x_stop_autoplay').then((val: any) => {
    // Off by default; only on when explicitly enabled in the app UI.
    hideEnabled = val === true || val === 'true';
    if (hideEnabled) { ensureStyle(); apply(); } else { unhideAll(); }
    airglow.log?.info?.('[fh-x] hideVideos setting loaded', { val, hideEnabled });
  });

})();

})();
