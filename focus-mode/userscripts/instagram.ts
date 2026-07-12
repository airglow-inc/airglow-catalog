// Focus Mode — Instagram
// Blocks the entire Instagram site behind a full-screen focus banner.
// @ts-ignore — airglow SDK injected at runtime
export {};

import { observeCoalesced } from './observe';
import { siteGate } from './gate';

;(function () {

const STYLE_ID = 'airglow-focus-mode-ig';
const BANNER_ID = 'airglow-focus-banner-ig';
let clockRaf = 0;
let enabled = true;

const css = `
/* Hide the entire site behind a full-screen overlay. [popover] exempts the
   Airglow edge button / popup, which live as popover body children in the
   browser top layer — visibility:hidden would bury them despite the top layer. */
html[data-airglow-ig-hide] body > *:not(#${BANNER_ID}):not([popover]) {
  visibility: hidden !important;
}
html[data-airglow-ig-hide] {
  overflow: hidden !important;
}

/* Full-screen motivational banner */
#${BANNER_ID} {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483645 !important; /* below the Airglow edge button (2147483647) */
  display: flex !important;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: #11131f;
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  animation: airglow-fade-in 0.6s ease-out;
}
#${BANNER_ID} .afb-title {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.5px;
  margin: 28px 0 12px;
  line-height: 1.2;
  color: #e2e4eb;
}
#${BANNER_ID} .afb-sub {
  font-size: 18px;
  font-weight: 400;
  margin: 0;
  color: #9ca3af;
  max-width: 460px;
}
@keyframes airglow-fade-in {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

const CLOCK_SVG = `<svg width="160" height="160" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="95" fill="#252545" stroke="#2a2a4a" stroke-width="2"/>
  <circle cx="100" cy="100" r="88" fill="none" stroke="#2a2a4a" stroke-width="0.5"/>
  ${Array.from({length: 12}, (_, i) => {
    const a = (i * 30 - 90) * Math.PI / 180;
    return `<line x1="${100 + 80 * Math.cos(a)}" y1="${100 + 80 * Math.sin(a)}" x2="${100 + 88 * Math.cos(a)}" y2="${100 + 88 * Math.sin(a)}" stroke="#6366f1" stroke-width="2" stroke-linecap="round"/>`;
  }).join('')}
  ${Array.from({length: 60}, (_, i) => {
    if (i % 5 === 0) return '';
    const a = (i * 6 - 90) * Math.PI / 180;
    return `<line x1="${100 + 84 * Math.cos(a)}" y1="${100 + 84 * Math.sin(a)}" x2="${100 + 88 * Math.cos(a)}" y2="${100 + 88 * Math.sin(a)}" stroke="#3a3a5a" stroke-width="1" stroke-linecap="round"/>`;
  }).join('')}
  <line id="afb-hour" x1="100" y1="100" x2="100" y2="50" stroke="#e0e0e0" stroke-width="3.5" stroke-linecap="round"/>
  <line id="afb-min" x1="100" y1="100" x2="100" y2="35" stroke="#e0e0e0" stroke-width="2" stroke-linecap="round"/>
  <line id="afb-sec" x1="100" y1="100" x2="100" y2="30" stroke="#6366f1" stroke-width="1" stroke-linecap="round"/>
  <circle cx="100" cy="100" r="4" fill="#6366f1"/>
  <circle cx="100" cy="100" r="4" fill="#6366f1">
    <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite"/>
  </circle>
</svg>`;

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

function injectBanner() {
  if (!enabled || document.getElementById(BANNER_ID)) return;
  const parent = document.body || document.documentElement;
  if (!parent) return;
  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.innerHTML = `
    <div>${CLOCK_SVG}</div>
    <p class="afb-title">Time to do great things</p>
  `;
  parent.appendChild(banner);
  if (!clockRaf) clockRaf = requestAnimationFrame(tickClock);
}

function removeBanner() {
  document.getElementById(BANNER_ID)?.remove();
  if (clockRaf) { cancelAnimationFrame(clockRaf); clockRaf = 0; }
}

function disable() {
  enabled = false;
  document.documentElement.removeAttribute('data-airglow-ig-hide');
  const el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (el) el.disabled = true;
  removeBanner();
}

// Inject the blocking style immediately — before any content renders.
document.documentElement.setAttribute('data-airglow-ig-hide', '');
const style = document.createElement('style');
style.id = STYLE_ID;
style.textContent = css;
document.documentElement.appendChild(style);

// Banner needs body; inject as soon as it's available.
function ensureBanner() {
  if (!enabled) return;
  if (document.body) {
    injectBanner();
  } else {
    requestAnimationFrame(ensureBanner);
  }
}
ensureBanner();

// Keep the banner present across SPA navigation / re-renders. Coalesced so a
// busy SPA can't turn per-mutation re-checks into a pegged core. No keepPageTall
// here: Instagram blocks the whole site with visibility:hidden + overflow:hidden,
// which preserves layout height and disables scroll — there's no collapsed-page
// infinite-scroll to guard against.
if (document.documentElement) {
  observeCoalesced(document.documentElement, () => { if (enabled) injectBanner(); });
}

// Respect the per-site toggle / pause stored by the app UI.
siteGate('instagram').then((state) => {
  if (state === 'on') return;
  document.getElementById(STYLE_ID)?.remove();
  disable();
});

})();
