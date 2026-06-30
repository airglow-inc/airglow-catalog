// Customizable X (Twitter) — reorder X's UI like iPhone apps.
//
// Two reorderable lists: the left nav's menu items (Home, Explore, …) and the
// right sidebar's sections (Search, Subscribe, What's happening, Who to follow).
// Enter "Arrange" mode, drag an item within its list to a new position; the
// others slide to make room (live), and the order persists in airglow.storage.
//
// Mechanism: both lists are `display:flex; flex-direction:column`, so we reorder
// purely with the CSS `order` property — no DOM surgery (React-safe), correct
// reflow even though sidebar sections have very different heights. The item you
// drag follows the finger via `transform`; everything else is `order`.
//
// Design (per AGENTS.md "Design: decide, don't default"). Surface = controls
// injected into X's own chrome, so the decision is HARMONIZE with X:
//   • reuse X's shapes — rounded-full button at X's 44px control height; edit
//     outlines are rounded to echo its nav pills / sidebar cards;
//   • one accent (indigo #6366f1), deliberately a notch off X's blue so the
//     Arrange button reads as an *added tool*, not a native X control;
//   • minimal footprint — a single button + a per-item drag affordance, no panels;
//   • motion is user-driven (the drag) or gated behind prefers-reduced-motion.

declare const airglow: any;

const BTN_ID = 'airglow-customizex-btn';
const STYLE_ID = 'airglow-customizex-style';
const ITEM_CLASS = 'airglow-customizex-item';
const EDIT_ROOT_CLASS = 'airglow-customizex-edit';
const ORDER_KEY = 'customizex-order';

// ---------------------------------------------------------------------------
// Reorderable lists. Each is a flex column; `items()` returns the movable
// children with a stable key + their home position (DOM index). Adding another
// reorderable region later = add a ListDef.
// ---------------------------------------------------------------------------
type Item = { key: string; el: HTMLElement; homeSlot: number };
// `frameOf` returns the element the dotted outline traces (so it hugs X's actual
// capsule/card, not the padded section wrapper); `frameRadius` forces a corner
// radius for flat items (nav links) or `null` to use the element's own radius
// (sidebar pills/cards). Drag + reorder always act on the item element itself.
type ListDef = {
  id: string;
  container: () => HTMLElement | null;
  items: () => Item[];
  frameOf: (el: HTMLElement) => HTMLElement;
  frameRadius: string | null;
};

// -- Left nav: every direct child of nav[role=navigation] (Home … More).
const navContainer = (): HTMLElement | null =>
  document.querySelector('header[role="banner"] nav[role="navigation"]');

function navItems(): Item[] {
  const cont = navContainer();
  if (!cont) return [];
  return (Array.from(cont.children) as HTMLElement[]).map((el, i) => {
    const a = (el.matches('a,button') ? el : el.querySelector('a,button')) as HTMLElement | null;
    const key =
      el.getAttribute('data-testid') || a?.getAttribute('data-testid') ||
      el.getAttribute('href') || a?.getAttribute('href') ||
      (el.textContent || '').trim() || `nav-${i}`;
    return { key, el, homeSlot: i };
  });
}

// -- Right sidebar: the four content sections, identified by a non-localized
// inner signal (testids/hrefs, not visible text). Other children (search-row
// spacer, divider, footer) are left fixed in place.
const SIDEBAR_SIGS: { key: string; sel: string }[] = [
  { key: 'search', sel: '[data-testid="SearchBox_Search_Input"]' },
  { key: 'premium', sel: 'a[href="/i/premium_sign_up"]' },
  { key: 'trends', sel: '[data-testid="trend"]' },
  { key: 'whotofollow', sel: '[data-testid="UserCell"]' },
];

function sidebarContainer(): HTMLElement | null {
  const side = document.querySelector('[data-testid="sidebarColumn"]');
  if (!side) return null;
  const search = side.querySelector('[data-testid="SearchBox_Search_Input"]') as HTMLElement | null;
  const trend = side.querySelector('[data-testid="trend"]') as HTMLElement | null;
  if (!search || !trend) return null;
  // The sections container is the lowest common ancestor of the search box and a
  // trend — they live in different sibling sections directly under it. (Anchoring
  // on a single trend and climbing by child-count stops too early, inside the
  // trends list which itself has many children.)
  const searchAnc = new Set<HTMLElement>();
  for (let n: HTMLElement | null = search; n && n !== side; n = n.parentElement) searchAnc.add(n);
  let lca: HTMLElement | null = trend;
  while (lca && lca !== side && !searchAnc.has(lca)) lca = lca.parentElement;
  if (lca && lca !== side && lca.children.length >= 4) return lca;
  return null;
}

function sidebarItems(): Item[] {
  const cont = sidebarContainer();
  if (!cont) return [];
  const children = Array.from(cont.children) as HTMLElement[];
  const out: Item[] = [];
  for (const sig of SIDEBAR_SIGS) {
    const idx = children.findIndex((ch) => ch.querySelector(sig.sel));
    if (idx >= 0) out.push({ key: sig.key, el: children[idx], homeSlot: idx });
  }
  return out;
}

// The visible capsule inside a sidebar section: the section itself (cards) or a
// descendant (the search pill, the Subscribe card) — whichever first has a real
// border-radius and box. The outline then traces that shape automatically.
function sidebarFrameOf(el: HTMLElement): HTMLElement {
  const fits = (e: HTMLElement) => {
    const r = e.getBoundingClientRect();
    return (parseFloat(getComputedStyle(e).borderRadius) || 0) >= 12 && r.width > 100 && r.height > 20;
  };
  if (fits(el)) return el; // cards: the section itself is the rounded card
  // Otherwise the capsule (search pill, Subscribe card) is a descendant — return
  // the first (outermost, document order) element that has a real rounded box.
  for (const c of Array.from(el.querySelectorAll('*')) as HTMLElement[]) {
    if (fits(c)) return c;
  }
  return el;
}

const LISTS: ListDef[] = [
  // Nav rows are flat and full-width — outline the row with a fixed radius.
  { id: 'nav', container: navContainer, items: navItems, frameOf: (el) => el, frameRadius: '14px' },
  // Sidebar capsules carry their own radius (pill / card) — trace it.
  { id: 'sidebar', container: sidebarContainer, items: sidebarItems, frameOf: sidebarFrameOf, frameRadius: null },
];
const listById = (id: string) => LISTS.find((l) => l.id === id);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let order: Record<string, string[]> = { nav: [], sidebar: [] };
let arranging = false;
let mutating = false; // set while we write to the DOM so the observer ignores us
// Active drag. `ty` is the last transform we applied; `grabOffset` is where in
// the item the finger landed.
let drag: { listId: string; key: string; pointerY: number; grabOffset: number; ty: number } | null = null;

function normalizeOrder(saved: string[] | undefined, keys: string[]): string[] {
  const set = new Set(keys);
  const out = Array.isArray(saved) ? saved.filter((k) => set.has(k)) : [];
  for (const k of keys) if (!out.includes(k)) out.push(k); // append items X added since
  return out;
}
function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
function sanitize(raw: any): Record<string, string[]> {
  const o: Record<string, string[]> = { nav: [], sidebar: [] };
  for (const l of LISTS) {
    const v = raw && raw[l.id];
    o[l.id] = Array.isArray(v) ? v.filter((x: any) => typeof x === 'string') : [];
  }
  return o;
}
function saveOrder() {
  try { airglow.storage.set(ORDER_KEY, order); } catch {}
}

// ---------------------------------------------------------------------------
// Styles — harmonized with X (see header). Only motion is the optional, gated
// outline fade; the drag itself is direct manipulation.
// ---------------------------------------------------------------------------
const css = `
#${BTN_ID} {
  position: fixed; right: 18px; top: 9px; z-index: 2147483646;
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  height: 44px; padding: 0 16px;
  border: none; border-radius: 9999px;
  font: 600 13.5px/1 -apple-system, system-ui, "Segoe UI", sans-serif;
  color: #fff; background: #6366f1; box-shadow: 0 3px 12px rgba(99,102,241,.4);
  cursor: pointer;
}
#${BTN_ID}:hover { background: #5457e5; }
#${BTN_ID}:active { transform: translateY(1px); }
#${BTN_ID} svg { width: 15px; height: 15px; display: block; }
html.${EDIT_ROOT_CLASS} #${BTN_ID} { background: #4f46e5; }

/* Movable items in arrange mode: a dashed ring that traces the element's own
   shape (its border-radius is set per-item in JS — pill, card, or rounded row). */
html.${EDIT_ROOT_CLASS} .${ITEM_CLASS} {
  cursor: grab; outline: 1.5px dashed rgba(120,120,140,.55); outline-offset: -2px;
}
.${ITEM_CLASS}.dragging {
  cursor: grabbing; outline: 1.5px solid rgba(99,102,241,.95); outline-offset: -2px;
  box-shadow: 0 10px 30px rgba(0,0,0,.28);
}
@media (prefers-reduced-motion: no-preference) {
  html.${EDIT_ROOT_CLASS} .${ITEM_CLASS} { transition: outline-color .15s ease; }
}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  (document.head || document.documentElement).appendChild(el);
}

function setStyle(el: HTMLElement, prop: string, value: string) {
  if ((el.style as any)[prop] !== value) (el.style as any)[prop] = value;
}
function setClass(el: HTMLElement, name: string, on: boolean) {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}

// ---------------------------------------------------------------------------
// Arrange button (entrypoint)
// ---------------------------------------------------------------------------
const GRIP = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`;
let lastLabel = '';
function ensureButton() {
  let btn = document.getElementById(BTN_ID) as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.addEventListener('click', () => setArranging(!arranging));
    document.body.appendChild(btn);
  }
  const label = arranging ? 'Done' : 'Arrange';
  if (label !== lastLabel) {
    lastLabel = label;
    btn.innerHTML = `${GRIP}<span>${label}</span>`;
  }
}

// ---------------------------------------------------------------------------
// Engine: apply each list's order via CSS `order`; follow the finger on the
// dragged item. Custom order applies whether or not we're arranging; arrange
// mode only adds the edit affordances + enables dragging.
// ---------------------------------------------------------------------------
function isIdentity(list: ListDef, items: Item[]): boolean {
  const homeKeys = items.slice().sort((a, b) => a.homeSlot - b.homeSlot).map((i) => i.key);
  return arraysEqual(normalizeOrder(order[list.id], items.map((i) => i.key)), homeKeys);
}

function positionDragged(el: HTMLElement) {
  if (!drag) return;
  const rect = el.getBoundingClientRect();
  const base = rect.top - drag.ty;            // the item's flex slot top (transform removed)
  drag.ty = drag.pointerY - drag.grabOffset - base; // keep the grabbed point under the finger
  setStyle(el, 'transform', `translateY(${drag.ty}px)`);
  setStyle(el, 'transition', 'none');
  setStyle(el, 'zIndex', '2147483640');
}

// The dotted outline / lift go on the item's "frame" (its visible capsule), so
// they trace X's actual shape; movement (order/transform) stays on the item.
function decorate(list: ListDef, el: HTMLElement, edit: boolean, dragging: boolean) {
  const frame = list.frameOf(el);
  setClass(frame, ITEM_CLASS, edit);
  setClass(frame, 'dragging', dragging);
  setStyle(frame, 'borderRadius', edit && list.frameRadius ? list.frameRadius : '');
}

function applyLayout() {
  for (const list of LISTS) {
    const container = list.container();
    if (!container) continue;
    const items = list.items();
    if (!items.length) continue;

    const keys = items.map((i) => i.key);
    const ord = normalizeOrder(order[list.id], keys);
    const relocated = arranging || !isIdentity(list, items);
    const children = Array.from(container.children) as HTMLElement[];
    const itemByEl = new Map(items.map((i) => [i.el, i]));

    if (!relocated) {
      for (const child of children) {
        setStyle(child, 'order', '');
        if (itemByEl.has(child)) {
          setStyle(child, 'transform', ''); setStyle(child, 'transition', ''); setStyle(child, 'zIndex', '');
          decorate(list, child, false, false);
        }
      }
      continue;
    }

    const slots = items.map((i) => i.homeSlot).sort((a, b) => a - b);
    children.forEach((child, ci) => {
      const it = itemByEl.get(child);
      if (it) {
        const p = ord.indexOf(it.key);
        setStyle(child, 'order', String(p >= 0 ? slots[p] : it.homeSlot));
        const isDragged = !!drag && drag.listId === list.id && drag.key === it.key;
        decorate(list, child, arranging, isDragged);
        if (!isDragged) {
          setStyle(child, 'transform', ''); setStyle(child, 'transition', ''); setStyle(child, 'zIndex', '');
        }
      } else {
        setStyle(child, 'order', String(ci));
      }
    });

    if (drag && drag.listId === list.id) {
      const el = items.find((i) => i.key === drag!.key)?.el;
      if (el) positionDragged(el);
    }
  }
}

// ---------------------------------------------------------------------------
// rAF-coalesced re-assertion across X's SPA re-renders.
// ---------------------------------------------------------------------------
let scheduled = false;
function schedule() {
  if (mutating || scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    mutating = true;
    try { ensureButton(); applyLayout(); } finally { mutating = false; }
  });
}
const observer = new MutationObserver(schedule);

// ---------------------------------------------------------------------------
// Arrange mode
// ---------------------------------------------------------------------------
function setArranging(on: boolean) {
  arranging = on;
  document.documentElement.classList.toggle(EDIT_ROOT_CLASS, on);
  if (!on) drag = null;
  mutating = true;
  try { ensureButton(); applyLayout(); } finally { mutating = false; }
}

// ---------------------------------------------------------------------------
// Pointer drag (capture phase, hit-tested against item rects).
// ---------------------------------------------------------------------------
function itemAtPoint(x: number, y: number): { listId: string; key: string; rect: DOMRect } | null {
  for (const list of LISTS) {
    for (const it of list.items()) {
      const r = it.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { listId: list.id, key: it.key, rect: r };
    }
  }
  return null;
}

function draggedEl(): HTMLElement | null {
  if (!drag) return null;
  return listById(drag.listId)?.items().find((i) => i.key === drag!.key)?.el ?? null;
}

function onPointerDown(e: PointerEvent) {
  if (!arranging || e.button !== 0) return;
  const hit = itemAtPoint(e.clientX, e.clientY);
  if (!hit) return;
  e.preventDefault();
  e.stopPropagation();
  drag = { listId: hit.listId, key: hit.key, pointerY: e.clientY, grabOffset: e.clientY - hit.rect.top, ty: 0 };
  try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch {}
  mutating = true;
  try { applyLayout(); } finally { mutating = false; }
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return;
  e.preventDefault();
  drag.pointerY = e.clientY;
  const list = listById(drag.listId);
  if (list) {
    const items = list.items();
    const ord = normalizeOrder(order[drag.listId], items.map((i) => i.key));
    const others = ord.filter((k) => k !== drag!.key);
    // Insert the dragged key where the finger sits relative to the other items.
    let idx = 0;
    for (const k of others) {
      const el = items.find((i) => i.key === k)?.el;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (e.clientY > r.top + r.height / 2) idx++;
      else break;
    }
    const preview = [...others.slice(0, idx), drag.key, ...others.slice(idx)];
    if (!arraysEqual(preview, ord)) order[drag.listId] = preview;
  }
  mutating = true;
  try { applyLayout(); } finally { mutating = false; }
}

function onPointerUp(e: PointerEvent) {
  if (!drag) return;
  e.preventDefault();
  e.stopPropagation();
  drag = null;
  saveOrder();
  mutating = true;
  try { applyLayout(); } finally { mutating = false; }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function attach() {
  injectStyle();
  ensureButton();
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerUp, true);

  // Suppress the click that follows a drag inside a movable item while editing.
  document.addEventListener(
    'click',
    (e) => {
      if (arranging && itemAtPoint(e.clientX, e.clientY)) { e.preventDefault(); e.stopPropagation(); }
    },
    true,
  );

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && arranging) setArranging(false);
  });
  window.addEventListener('resize', schedule);

  // X is an SPA; userscripts can't see history.pushState — poll the path.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) { lastPath = location.pathname; schedule(); }
  }, 250);

  mutating = true;
  try { applyLayout(); } finally { mutating = false; }
}

async function init() {
  try { order = sanitize(await airglow.storage.get(ORDER_KEY)); } catch {}
  if (document.body) attach();
  else window.addEventListener('DOMContentLoaded', attach, { once: true });
}

init();
