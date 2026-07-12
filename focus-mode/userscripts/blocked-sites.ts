// Focus Mode — fully-blocked sites
// These sites have no "feed" worth keeping — the whole site is the distraction.
// So instead of hiding parts, we replace the entire page with a focus overlay at
// document_start (before the page paints). One script serves every blocked site;
// the host decides which per-site toggle in focus_mode_sites gates it.
// @ts-ignore — airglow SDK injected at runtime
export {};

import { siteGate } from './gate';

;(function () {

// hostname suffix → { key in focus_mode_sites, display name }
const SITE_BY_HOST: { suffix: string; key: string; label: string }[] = [
  { suffix: 'hltv.org', key: 'hltv', label: 'HLTV' },
  { suffix: 'news.ycombinator.com', key: 'hacker-news', label: 'Hacker News' },
];

function matchSite() {
  const host = location.hostname;
  return SITE_BY_HOST.find((s) => host === s.suffix || host.endsWith('.' + s.suffix)) || null;
}

const site = matchSite();
if (!site) return;

const OVERLAY_ID = 'airglow-focus-mode-block';
const STYLE_ID = 'airglow-focus-mode-block-style';
let clockRaf = 0;

const CSS = `
html.airglow-fh-blocked, html.airglow-fh-blocked body { overflow: hidden !important; }
#${OVERLAY_ID} {
  position: fixed; inset: 0; z-index: 2147483645;
  display: flex; align-items: center; justify-content: center;
  background: #f4f2ee; color: #1d2226;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  opacity: 0; transition: opacity 0.3s ease-out;
}
#${OVERLAY_ID}.visible { opacity: 1; }
#${OVERLAY_ID} .afb-card {
  position: relative;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: #ffffff;
  border: 2px solid #F99E3D;
  border-radius: 16px;
  padding: 48px 56px 52px;
  box-shadow: 0 4px 20px rgba(249, 158, 61, 0.1);
  max-width: 520px;
}
#${OVERLAY_ID} .afb-clock { margin-bottom: 28px; }
#${OVERLAY_ID} .afb-title {
  font-size: 32px; font-weight: 700; letter-spacing: -0.02em;
  margin: 0 0 12px; color: #1d2226; text-align: center;
}
#${OVERLAY_ID} .afb-sub {
  font-size: 18px; line-height: 1.5; color: #56687a; margin: 0;
  max-width: 480px; text-align: center; padding: 0 24px;
}
#${OVERLAY_ID} .afb-badge {
  position: absolute; top: 16px; right: 18px;
  display: flex; align-items: center; gap: 7px;
  font-size: 16px; color: #56687a;
}
#${OVERLAY_ID} .afb-badge svg { display: block; }
#${OVERLAY_ID} .afb-badge strong { color: #1d2226; font-weight: 700; }
`;

const CLOCK_SVG = `<svg width="160" height="160" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="95" fill="#fdf1e3" stroke="#f6d9b5" stroke-width="2"/>
  <circle cx="100" cy="100" r="88" fill="none" stroke="#f8e3c8" stroke-width="0.5"/>
  ${Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 - 90) * Math.PI / 180;
    return `<line x1="${100 + 80 * Math.cos(a)}" y1="${100 + 80 * Math.sin(a)}" x2="${100 + 88 * Math.cos(a)}" y2="${100 + 88 * Math.sin(a)}" stroke="#F99E3D" stroke-width="2" stroke-linecap="round"/>`;
  }).join('')}
  ${Array.from({ length: 60 }, (_, i) => {
    if (i % 5 === 0) return '';
    const a = (i * 6 - 90) * Math.PI / 180;
    return `<line x1="${100 + 84 * Math.cos(a)}" y1="${100 + 84 * Math.sin(a)}" x2="${100 + 88 * Math.cos(a)}" y2="${100 + 88 * Math.sin(a)}" stroke="#f6d9b5" stroke-width="1" stroke-linecap="round"/>`;
  }).join('')}
  <line id="afb-hour" x1="100" y1="100" x2="100" y2="50" stroke="#1d2226" stroke-width="3.5" stroke-linecap="round"/>
  <line id="afb-min" x1="100" y1="100" x2="100" y2="35" stroke="#1d2226" stroke-width="2" stroke-linecap="round"/>
  <line id="afb-sec" x1="100" y1="100" x2="100" y2="30" stroke="#F99E3D" stroke-width="1" stroke-linecap="round"/>
  <circle cx="100" cy="100" r="4" fill="#F99E3D"/>
  <circle cx="100" cy="100" r="4" fill="#F99E3D">
    <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite"/>
  </circle>
</svg>`;

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
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) { clockRaf = 0; return; }
  const now = new Date();
  const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds(), ms = now.getMilliseconds();
  const hands: [string, number, number][] = [
    ['#afb-hour', (h * 30 + m * 0.5) - 90, 45],
    ['#afb-min', (m * 6 + s * 0.1) - 90, 60],
    ['#afb-sec', ((s + ms / 1000) * 6) - 90, 60],
  ];
  for (const [sel, deg, len] of hands) {
    const el = overlay.querySelector(sel) as SVGLineElement | null;
    if (!el) continue;
    const rad = deg * Math.PI / 180;
    el.setAttribute('x2', String(100 + len * Math.cos(rad)));
    el.setAttribute('y2', String(100 + len * Math.sin(rad)));
  }
  clockRaf = requestAnimationFrame(tickClock);
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);
}

function showBlock() {
  ensureStyle();
  document.documentElement.classList.add('airglow-fh-blocked');
  if (document.getElementById(OVERLAY_ID)) return;
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="afb-card">
      ${AIRGLOW_BADGE_HTML}
      <div class="afb-clock">${CLOCK_SVG}</div>
      <h1 class="afb-title">Time to do great things</h1>
    </div>
  `;
  (document.body || document.documentElement).appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
    if (!clockRaf) clockRaf = requestAnimationFrame(tickClock);
  });
  // The overlay may be appended before <body> exists; re-parent once it does.
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

async function init() {
  // default: blocked when the app is on
  if ((await siteGate(site!.key)) === 'on') showBlock();
}

init();

})();
