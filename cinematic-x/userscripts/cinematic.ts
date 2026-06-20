// Cinematic View for X (Twitter)
// Adds a floating toggle. When active it paints the page black and fades out the
// left nav + right sidebar, centers the timeline column, and collapses the
// For you / Following tab bar + the "What's happening" composer.

const STORAGE_KEY = 'cinematic-enabled';
const ROOT_CLASS = 'airglow-cine';
const COLLAPSE_CLASS = 'airglow-cine-collapse';
const HIDE_CLASS = 'airglow-cine-hide';
// Matches the "Show N posts" / "Show 1 post" new-posts pill that appears atop
// the timeline. X has no stable testid for it, so we match by exact text.
const NEW_POSTS_RE = /^Show\s+\d[\d,]*\s+posts?$/i;

const css = `
/* Cinematic mode: paint the whole page black and fade the side columns away,
   so their space turns black, leaving only the centered timeline. We fade the
   real columns rather than overlaying a backdrop — X traps deep elements in
   low stacking contexts, so an overlay would cover the timeline too. */
header[role="banner"],
[data-testid="sidebarColumn"],
[data-testid="GrokDrawer"],
[data-testid="chat-drawer-root"] {
  transition: opacity .585s ease;
}
html.${ROOT_CLASS},
html.${ROOT_CLASS} body {
  background-color: #000 !important;
}
html.${ROOT_CLASS} header[role="banner"],
html.${ROOT_CLASS} [data-testid="sidebarColumn"],
html.${ROOT_CLASS} [data-testid="GrokDrawer"],
html.${ROOT_CLASS} [data-testid="chat-drawer-root"] {
  opacity: 0;
  pointer-events: none;
}

[data-testid="primaryColumn"] {
  transition: transform .715s cubic-bezier(.22,.61,.36,1);
  will-change: transform;
}
html.${ROOT_CLASS} [data-testid="primaryColumn"] {
  transform: translateX(var(--airglow-cine-shift, 0px));
}

/* Tab bar + composer: tagged persistently, collapsed only while active so the
   transition plays both opening and closing. */
.${COLLAPSE_CLASS} {
  /* max-height is set to the element's real measured height (--airglow-cine-h)
     so the collapse maps 1:1 to its actual size and shrinks evenly across the
     whole animation — in sync with the side panels — instead of staying full
     height until the very end (which a fixed over-estimate like 600px causes). */
  max-height: var(--airglow-cine-h, 600px);
  overflow: hidden;
  transition: opacity .585s ease, max-height .585s ease, margin .585s ease;
}
html.${ROOT_CLASS} .${COLLAPSE_CLASS} {
  opacity: 0;
  max-height: 0;
  margin: 0;
  pointer-events: none;
}

/* The "Show N posts" new-posts pill, hidden only while cinematic is active. */
html.${ROOT_CLASS} .${HIDE_CLASS} {
  display: none !important;
}

#airglow-cine-btn {
  position: fixed;
  right: 22px;
  /* Aligned to the same height as X's search box, sitting just to its right.
     The search box is shrunk (below) to free up the room. */
  top: 9px;
  z-index: 10000;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 44px;
  min-width: 96px;
  padding: 0 18px;
  border: none;
  border-radius: 9999px;
  font: 600 14px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #fff;
  background: #4a90e2;
  box-shadow: 0 4px 18px rgba(74,144,226,.45);
  cursor: pointer;
  transition: background .25s ease, transform .15s ease, box-shadow .25s ease;
}
#airglow-cine-btn:hover { background: #3a80d2; transform: translateY(-1px); }
#airglow-cine-btn:active { transform: translateY(0); }
html.${ROOT_CLASS} #airglow-cine-btn {
  background: #4a90e2;
  border: 1px solid rgba(255,255,255,.28);
}
html.${ROOT_CLASS} #airglow-cine-btn:hover { background: #3a80d2; }
`;

let active = false;
let lastLabel = '';
// Set while we mutate the DOM ourselves, so the observer ignores our own writes
// (otherwise rewriting the button would retrigger the observer in a tight loop).
let mutating = false;

function injectStyle() {
  if (document.getElementById('airglow-cine-style')) return;
  const style = document.createElement('style');
  style.id = 'airglow-cine-style';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}

const FILM_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5"/></svg>`;

function ensureButton() {
  let btn = document.getElementById('airglow-cine-btn') as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'airglow-cine-btn';
    btn.type = 'button';
    btn.addEventListener('click', () => setActive(!active));
    document.body.appendChild(btn);
  }
  // Only touch the DOM when the label actually changes — rewriting innerHTML on
  // every observer tick would feed the MutationObserver and freeze the page.
  const label = active ? 'Exit' : 'Cinema';
  if (label !== lastLabel) {
    lastLabel = label;
    btn.innerHTML = `<span>${label}</span>`;
  }
}

function getPrimary(): HTMLElement | null {
  return document.querySelector('[data-testid="primaryColumn"]');
}

// The sticky top bar of the primary column (holds the For you / Following tabs,
// or a page heading on other pages).
function getTopBar(): HTMLElement | null {
  const primary = getPrimary();
  if (!primary) return null;
  let anchor: HTMLElement | null =
    primary.querySelector('[role="tablist"]') ||
    primary.querySelector('h2[role="heading"]');
  if (!anchor) return null;
  let n: HTMLElement | null = anchor;
  while (n && n !== primary) {
    if (getComputedStyle(n).position === 'sticky') return n;
    n = n.parentElement;
  }
  return null;
}

// The inline composer block ("What is happening?!") that sits below the tab bar.
function getComposer(): HTMLElement | null {
  const bar = getTopBar();
  const container = bar?.parentElement;
  if (!container) return null;
  for (const child of Array.from(container.children) as HTMLElement[]) {
    if (child !== bar && child.querySelector('[data-testid="tweetTextarea_0"]')) {
      return child;
    }
  }
  return null;
}

function tagCollapsibles() {
  for (const el of [getTopBar(), getComposer()]) {
    if (!el) continue;
    // Record the element's natural rendered box height so the collapse animates
    // its real visible size (offsetHeight, not scrollHeight — the sticky header
    // has overflowing content that would otherwise overshoot). Only measure when
    // the page isn't collapsed yet (ROOT_CLASS drives the collapse, and it's
    // added a frame after this), so we capture the true expanded height.
    const collapsed = document.documentElement.classList.contains(ROOT_CLASS);
    if (!collapsed && el.offsetHeight > 0) {
      el.style.setProperty('--airglow-cine-h', `${el.offsetHeight}px`);
    }
    el.classList.add(COLLAPSE_CLASS);
  }
}

// Hide the "Show N posts" pill. X recycles timeline rows, so we always clear the
// tag from anything that no longer reads "Show N posts" before re-tagging the
// current pill — otherwise a recycled row could stay hidden as a real post.
function tagNewPostsPill() {
  const primary = getPrimary();
  if (!primary) return;
  primary.querySelectorAll('.' + HIDE_CLASS).forEach((el) => {
    if (!NEW_POSTS_RE.test((el.textContent || '').trim())) {
      el.classList.remove(HIDE_CLASS);
    }
  });
  primary.querySelectorAll('[role="button"], button').forEach((btn) => {
    if (NEW_POSTS_RE.test((btn.textContent || '').trim())) {
      const cell =
        (btn as HTMLElement).closest('[data-testid="cellInnerDiv"]') ||
        (btn as HTMLElement);
      cell.classList.add(HIDE_CLASS);
    }
  });
}

function computeShift(): number {
  const p = getPrimary();
  if (!p) return 0;
  // Read the transform actually applied right now (which may be mid-animation)
  // rather than the target CSS variable. Subtracting it gives the column's true
  // un-shifted position, so the computed shift is stable on every tick and the
  // column doesn't overshoot and crawl back.
  let appliedX = 0;
  try {
    appliedX = new DOMMatrixReadOnly(getComputedStyle(p).transform).m41;
  } catch {}
  const r = p.getBoundingClientRect();
  const trueLeft = r.left - appliedX;
  const center = trueLeft + r.width / 2;
  return Math.round(window.innerWidth / 2 - center);
}

function updateShift() {
  const next = computeShift();
  const cur =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--airglow-cine-shift'),
    ) || 0;
  // Avoid rewriting the same value (which would needlessly poke layout).
  if (Math.abs(next - cur) < 1) return;
  document.documentElement.style.setProperty('--airglow-cine-shift', `${next}px`);
}

function setActive(on: boolean) {
  active = on;
  if (on) {
    tagCollapsibles();
    tagNewPostsPill();
    updateShift();
    // next frame so the transform transition plays from 0 -> shift
    requestAnimationFrame(() => document.documentElement.classList.add(ROOT_CLASS));
  } else {
    document.documentElement.classList.remove(ROOT_CLASS);
  }
  ensureButton();
  try {
    airglow.storage.set(STORAGE_KEY, on);
  } catch {}
}

// Re-tag collapsibles and keep our nodes alive across X's SPA re-renders.
let scheduled = false;
const observer = new MutationObserver(() => {
  if (mutating || scheduled) return;
  // Coalesce bursts of mutations into one rAF so we never react to our own
  // writes synchronously and never thrash layout.
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    mutating = true;
    try {
      ensureButton();
      if (active) {
        tagCollapsibles();
        tagNewPostsPill();
        updateShift();
      }
    } finally {
      mutating = false;
    }
  });
});

window.addEventListener('resize', () => {
  if (active) updateShift();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && active) setActive(false);
});

async function init() {
  injectStyle();
  ensureButton();
  observer.observe(document.body, { childList: true, subtree: true });
  try {
    const saved = await airglow.storage.get(STORAGE_KEY);
    if (saved) setActive(true);
  } catch {}
}

init();
