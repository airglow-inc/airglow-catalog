// Focus Mode — shared DOM-observation helper.
//
// Why this exists: X's home timeline is a virtualized React list that mutates
// the DOM hundreds of times a second, and Focus Mode hides the feed with
// `display:none`, which keeps X's infinite-scroll loading ever more posts. A
// raw `MutationObserver` that does its work on *every* mutation turns that into
// a pegged CPU core — each run re-scans a DOM that only grows, so the cost
// compounds and the main thread stalls for seconds at a time.
//
// observeCoalesced collapses a burst of mutations into at most one run per
// animation frame: the observer callback itself is O(1) (just schedules), so it
// stops feeding the mutation storm, and the actual (bounded) work runs once per
// frame. Because requestAnimationFrame is paused on hidden tabs, a backgrounded
// tab costs nothing.

export function observeCoalesced(
  target: Node,
  run: () => void,
  init: MutationObserverInit = { childList: true, subtree: true },
): MutationObserver {
  let scheduled = false;
  const flush = () => {
    // Reset before running so a throw (or a mutation the run itself causes)
    // can't wedge scheduling — the next mutation reschedules cleanly.
    scheduled = false;
    run();
  };
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(flush);
  });
  observer.observe(target, init);
  return observer;
}

// Keep the page taller than the viewport while a feed is hidden.
//
// Why: feed blockers hide posts with `display:none`, which collapses the
// document's scroll height. Infinite-scroll sites (X, Instagram, LinkedIn, …)
// decide to fetch the next page when the viewport is near the bottom of the
// document — so a collapsed page reads as *permanently at the bottom* and the
// site fetches forever (hundreds of off-screen posts → a pegged CPU core).
// Pinning `<html>` to a few viewports tall keeps us clear of the bottom, so the
// site loads one screen and stops. Reusable across any feed-hider userscript;
// call while hiding is active, call the returned stopper when it's turned off.
export function keepPageTall(minVh = 200): () => void {
  const value = `${minVh}vh`;
  const apply = () => {
    // Re-assert if an SPA re-render clears it; cheap and idempotent.
    if (document.documentElement.style.getPropertyValue('min-height') !== value) {
      document.documentElement.style.setProperty('min-height', value, 'important');
    }
  };
  apply();
  const observer = observeCoalesced(document.documentElement, apply);
  return () => {
    observer.disconnect();
    document.documentElement.style.removeProperty('min-height');
  };
}
