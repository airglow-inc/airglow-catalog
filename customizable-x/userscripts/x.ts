// Customizable X (Twitter) — rearrange the UI like iPhone apps.
//
// v1 makes two blocks movable: the left nav stripe and the right sidebar stripe.
// An injected "Arrange" button enters an edit mode (each movable block gets a
// dotted border); you drag a stripe onto the other slot to swap them. The chosen
// layout persists in airglow.storage.
//
// Mechanism: each rail is moved with `transform: translateX()` only. Transform
// keeps the element in normal flow, so its box still reserves its original space
// and the centered timeline NEVER shifts — no placeholders, no reflow. Slot
// positions are anchored to [data-testid="primaryColumn"], the element we never
// touch. The left nav's visible content is a `position: fixed` column inside
// <header>, so for it we transform the <header> itself: that keeps the fixed
// column full-height (the header is its containing block) and floats it above
// the timeline. Dotted borders are drawn as separate overlays at each block's
// content box, so X's own re-renders can't strip them. A declarative registry
// keeps the engine generic for future, smaller blocks.

declare const airglow: any;

const BTN_ID = 'airglow-customizex-btn';
const STYLE_ID = 'airglow-customizex-style';
const BORDER_CLASS = 'airglow-customizex-border';
const EDIT_ROOT_CLASS = 'airglow-customizex-edit';
const LAYOUT_KEY = 'customizex-layout';

type Rect = { left: number; width: number; top: number; height: number };

// ---------------------------------------------------------------------------
// Declarative registry.
//   move        — the element we translate (+raise).
//   contentRect — the tight, visible box of the rail (for the dotted border and
//                 for drag hit-testing); it already reflects the live transform.
// A slot is a vertical stripe anchored to one side of the timeline column.
// ---------------------------------------------------------------------------
type Block = { id: string; defaultSlot: string; width: number; move: () => HTMLElement | null };
type Slot = { id: string; side: 'left' | 'right' };

const LANE_GAP = { left: 0, right: 30 };

const SLOTS: Slot[] = [
  { id: 'stripe-left', side: 'left' },
  { id: 'stripe-right', side: 'right' },
];

const navHeader = (): HTMLElement | null => document.querySelector('header[role="banner"]');

const BLOCKS: Block[] = [
  { id: 'nav-rail', defaultSlot: 'stripe-left', width: 275, move: navHeader },
  { id: 'sidebar-rail', defaultSlot: 'stripe-right', width: 350, move: () => document.querySelector('[data-testid="sidebarColumn"]') },
];

const blockById = (id: string) => BLOCKS.find((b) => b.id === id);
const slotById = (id: string) => SLOTS.find((s) => s.id === id);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let layout: Record<string, string> = identityLayout();
let arranging = false;
let mutating = false; // set while we write to the DOM so the observer ignores us
const borders = new Map<string, HTMLElement>();
// `previewSlot` is the slot the dragged block is currently hovering — the other
// block reflows to match it live (iPhone-style), before the finger is released.
let drag: { blockId: string; dx: number; dy: number; previewSlot: string } | null = null;
let startX = 0;
let startY = 0;

function identityLayout(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const b of BLOCKS) m[b.id] = b.defaultSlot;
  return m;
}
function isIdentity(l: Record<string, string>): boolean {
  return BLOCKS.every((b) => l[b.id] === b.defaultSlot);
}
function sanitize(raw: any): Record<string, string> {
  const l = identityLayout();
  if (raw && typeof raw === 'object') {
    for (const b of BLOCKS) {
      const v = raw[b.id];
      if (typeof v === 'string' && slotById(v)) l[b.id] = v;
    }
  }
  return l;
}

// ---------------------------------------------------------------------------
// Lane geometry — anchored to the timeline column (never moved).
// ---------------------------------------------------------------------------
function primaryRect(): DOMRect | null {
  const p = document.querySelector('[data-testid="primaryColumn"]') as HTMLElement | null;
  return p ? p.getBoundingClientRect() : null;
}

// Where a block's LEFT edge should sit when placed in a slot. Blocks anchor to
// the timeline-facing edge, so a block wider than the gap extends OUTWARD (toward
// the viewport edge) and never overlaps the timeline:
//   left slot  → block's right edge meets the timeline's left edge
//   right slot → block's left edge meets the timeline's right edge (+gap)
function slotTargetLeft(slotId: string, width: number): number | null {
  const slot = slotById(slotId);
  const p = primaryRect();
  if (!slot || !p) return null;
  return Math.round(slot.side === 'left' ? p.left - LANE_GAP.left - width : p.right + LANE_GAP.right);
}

// The slot a block occupies for live positioning. The dragged block keeps its
// committed slot as its base (it follows the finger via the drag delta on top);
// a non-dragged block shifts into the dragged block's committed slot the moment
// the drag previews over its slot — so the rails trade places live, not on drop.
function liveSlot(blockId: string): string {
  const committed = layout[blockId] ?? blockById(blockId)?.defaultSlot ?? '';
  if (!drag || blockId === drag.blockId) return committed;
  const draggedCommitted = layout[drag.blockId];
  if (drag.previewSlot !== draggedCommitted && committed === drag.previewSlot) return draggedCommitted;
  return committed;
}

// Horizontal shift from a block's home position to its live slot.
function targetTranslateX(b: Block): number {
  const to = slotTargetLeft(liveSlot(b.id), b.width);
  const home = slotTargetLeft(b.defaultSlot, b.width);
  return to !== null && home !== null ? to - home : 0;
}

// The block's live content box — where its dotted border goes and where drags
// are hit-tested. Derived purely from the layout math (plus the live drag delta),
// NOT by reading X's geometry, so the border always tracks the block including
// mid-drag and after a swap.
function contentRect(b: Block): Rect | null {
  const left = slotTargetLeft(liveSlot(b.id), b.width);
  if (left === null) return null;
  let dx = 0, dy = 0;
  if (drag?.blockId === b.id) { dx = drag.dx; dy = drag.dy; }
  return { left: left + dx, width: b.width, top: dy, height: window.innerHeight };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const css = `
#${BTN_ID} {
  position: fixed; right: 18px; top: 9px; z-index: 2147483646;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 44px; min-width: 78px; padding: 0 14px;
  border: none; border-radius: 9999px;
  font: 600 13.5px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #fff; background: #7856ff; box-shadow: 0 3px 12px rgba(120,86,255,.4);
  cursor: pointer; transition: background .25s ease, transform .15s ease;
}
#${BTN_ID}:hover { background: #6a46f0; transform: translateY(-1px); }
#${BTN_ID}:active { transform: translateY(0); }

/* The single dotted border, drawn as an overlay over each movable block. */
.${BORDER_CLASS} {
  position: fixed; z-index: 2147483643; pointer-events: none; box-sizing: border-box;
  border: 2px dotted rgba(120,86,255,.75); border-radius: 12px;
}
.${BORDER_CLASS}.dragging { border-style: solid; background: rgba(120,86,255,.10); }
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
    btn.textContent = label;
  }
}

// ---------------------------------------------------------------------------
// Dotted-border overlays (arrange mode only). Inset slightly so the border hugs
// the visible content.
// ---------------------------------------------------------------------------
function ensureBorders() {
  if (!arranging) {
    for (const [, ov] of borders) ov.remove();
    borders.clear();
    return;
  }
  for (const b of BLOCKS) {
    const rect = contentRect(b);
    let ov = borders.get(b.id);
    if (!rect) { if (ov) { ov.remove(); borders.delete(b.id); } continue; }
    if (!ov || !ov.isConnected) {
      ov = document.createElement('div');
      ov.className = BORDER_CLASS;
      ov.id = `airglow-customizex-border-${b.id}`;
      document.body.appendChild(ov);
      borders.set(b.id, ov);
    }
    setStyle(ov, 'left', `${rect.left}px`);
    setStyle(ov, 'top', `${rect.top + 8}px`);
    setStyle(ov, 'width', `${rect.width}px`);
    setStyle(ov, 'height', `${rect.height - 16}px`);
    setClass(ov, 'dragging', drag?.blockId === b.id);
  }
}

// ---------------------------------------------------------------------------
// Engine: translate each block to its assigned lane (or clear it).
// ---------------------------------------------------------------------------
function applyLayout() {
  const relocated = arranging || !isIdentity(layout);
  for (const b of BLOCKS) {
    const el = b.move();
    if (!el) continue;
    if (!relocated) {
      setStyle(el, 'transform', '');
      setStyle(el, 'transition', '');
      setStyle(el, 'zIndex', '');
      continue;
    }
    const isDragged = drag?.blockId === b.id;
    let tx = targetTranslateX(b);
    let ty = 0;
    if (isDragged && drag) { tx += drag.dx; ty += drag.dy; }
    setStyle(el, 'transform', tx || ty ? `translate(${tx}px, ${ty}px)` : '');
    setStyle(el, 'transition', isDragged ? 'none' : 'transform .18s ease');
    setStyle(el, 'zIndex', isDragged ? '2147483641' : '2147483640');
  }
  ensureBorders();
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
    try {
      ensureButton();
      applyLayout();
    } finally {
      mutating = false;
    }
  });
}
const observer = new MutationObserver(schedule);

// ---------------------------------------------------------------------------
// Arrange mode + persistence
// ---------------------------------------------------------------------------
function setArranging(on: boolean) {
  arranging = on;
  document.documentElement.classList.toggle(EDIT_ROOT_CLASS, on);
  if (!on) drag = null;
  mutating = true;
  try { ensureButton(); applyLayout(); } finally { mutating = false; }
}

function saveLayout() {
  try { airglow.storage.set(LAYOUT_KEY, layout); } catch {}
}

// ---------------------------------------------------------------------------
// Pointer drag (capture phase, hit-tested against each block's content box).
// ---------------------------------------------------------------------------
function blockAtPoint(x: number, y: number): string | null {
  for (const b of BLOCKS) {
    const r = contentRect(b);
    if (r && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height) return b.id;
  }
  return null;
}
// With two stripes, the drop target is simply whichever side of the timeline the
// pointer is on.
function slotUnderPoint(x: number): string | null {
  const p = primaryRect();
  if (!p) return null;
  return x < p.left + p.width / 2 ? 'stripe-left' : 'stripe-right';
}

function onPointerDown(e: PointerEvent) {
  if (!arranging || e.button !== 0) return;
  const id = blockAtPoint(e.clientX, e.clientY);
  if (!id) return;
  e.preventDefault();
  e.stopPropagation();
  drag = { blockId: id, dx: 0, dy: 0, previewSlot: layout[id] ?? blockById(id)?.defaultSlot ?? '' };
  startX = e.clientX;
  startY = e.clientY;
  try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch {}
  mutating = true;
  try { applyLayout(); } finally { mutating = false; }
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return;
  e.preventDefault();
  drag.dx = e.clientX - startX;
  drag.dy = e.clientY - startY;
  // The slot under the finger; the other block reflows toward it immediately.
  drag.previewSlot = slotUnderPoint(e.clientX) ?? drag.previewSlot;
  mutating = true;
  try { applyLayout(); } finally { mutating = false; }
}

function onPointerUp(e: PointerEvent) {
  if (!drag) return;
  e.preventDefault();
  e.stopPropagation();
  const moved = Math.abs(drag.dx) > 6 || Math.abs(drag.dy) > 6;
  const dragged = drag.blockId;
  // Commit the previewed slot — the other block has already reflowed to match.
  const target = drag.previewSlot;
  drag = null;
  if (moved && target) {
    const from = layout[dragged];
    if (target !== from) {
      // Swap whoever occupies the target slot into the vacated slot.
      const occupant = BLOCKS.find((b) => b.id !== dragged && layout[b.id] === target);
      if (occupant) layout[occupant.id] = from;
      layout[dragged] = target;
      saveLayout();
    }
  }
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

  // Suppress the click that follows a drag while editing.
  document.addEventListener(
    'click',
    (e) => {
      if (arranging && blockAtPoint(e.clientX, e.clientY)) { e.preventDefault(); e.stopPropagation(); }
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
  try { layout = sanitize(await airglow.storage.get(LAYOUT_KEY)); } catch {}
  if (document.body) attach();
  else window.addEventListener('DOMContentLoaded', attach, { once: true });
}

init();
