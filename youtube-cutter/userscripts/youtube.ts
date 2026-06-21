// YouTube Cutter — a "✂ Cut" button in the watch-page action row toggles
// "cut mode": two draggable handles appear ON YouTube's real progress bar to
// mark the start/end of a fragment (the kept range is tinted), and a small
// floating control downloads just that fragment as an MP4 (server/cut.ts via
// yt-dlp). Dragging a handle seeks the video so you see the exact frame.
//
// The overlay is a sibling of the bar (in #movie_player), not a child: the
// container is pointer-events:none so plain clicks pass through and seek
// normally, while the handles (pointer-events:auto, on top) capture their own
// drags — so there's no fight with YouTube's own scrubbing.
declare const airglow: any;
export {};

;(function () {
  const BTN_ID = 'airglow-cut-btn';
  const OVERLAY_ID = 'airglow-cut-overlay';
  const CTRL_ID = 'airglow-cut-ctrl';
  const STYLE_ID = 'airglow-cut-style';
  const ACCENT = '#3ea6ff';

  // ── styles ──────────────────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
#${BTN_ID} {
  display: inline-flex; align-items: center; gap: 6px;
  height: 36px; padding: 0 14px; margin-left: 8px;
  border: none; border-radius: 18px; cursor: pointer;
  background: rgba(255,255,255,0.1); color: var(--yt-spec-text-primary, #f1f1f1);
  font: 500 14px/1 "Roboto", system-ui, sans-serif; white-space: nowrap;
  transition: background .15s ease;
}
html:not([dark]) #${BTN_ID} { background: rgba(0,0,0,0.05); color: #0f0f0f; }
#${BTN_ID}:hover { background: rgba(255,255,255,0.2); }
html:not([dark]) #${BTN_ID}:hover { background: rgba(0,0,0,0.1); }
#${BTN_ID}[data-open="true"] { background: ${ACCENT}; color: #0f0f0f; }
#${BTN_ID} svg { width: 16px; height: 16px; }

/* keep the player controls (and thus the timeline) visible while cutting */
#movie_player.airglow-cutting .ytp-chrome-bottom,
#movie_player.airglow-cutting .ytp-gradient-bottom { opacity: 1 !important; }
#movie_player.airglow-cutting { cursor: auto !important; }

#${OVERLAY_ID} { position: absolute; pointer-events: none; z-index: 60; }
#${OVERLAY_ID} .acut-band {
  position: absolute; top: -2px; bottom: -2px;
  background: rgba(62,166,255,.5); border-left: 2px solid ${ACCENT}; border-right: 2px solid ${ACCENT};
  box-sizing: border-box; pointer-events: none;
}
#${OVERLAY_ID} .acut-h {
  position: absolute; top: 50%; transform: translate(-50%, -50%);
  width: 15px; height: 15px; border-radius: 50%;
  background: #fff; border: 3px solid ${ACCENT}; box-shadow: 0 1px 5px rgba(0,0,0,.7);
  pointer-events: auto; cursor: grab; touch-action: none; z-index: 2;
}
#${OVERLAY_ID} .acut-h:active { cursor: grabbing; }
#${OVERLAY_ID} .acut-h::after {
  content: attr(data-label); position: absolute; bottom: 20px; left: 50%;
  transform: translateX(-50%); white-space: nowrap;
  font: 600 11px/1 "Roboto", sans-serif; background: #000; color: #fff;
  padding: 3px 6px; border-radius: 4px;
}

#${CTRL_ID} {
  position: absolute; left: 50%; bottom: 62px; transform: translateX(-50%);
  z-index: 61; display: flex; align-items: center; gap: 12px;
  padding: 8px 10px 8px 14px; border-radius: 10px;
  background: rgba(18,18,20,.94); color: #f1f1f1;
  font: 13px/1.3 "Roboto", system-ui, sans-serif;
  box-shadow: 0 4px 20px rgba(0,0,0,.55); backdrop-filter: blur(8px);
}
#${CTRL_ID} .acut-times { white-space: nowrap; }
#${CTRL_ID} .acut-times b { font-weight: 600; font-variant-numeric: tabular-nums; }
#${CTRL_ID} .acut-times .sep { color: #888; margin: 0 4px; }
#${CTRL_ID} .acut-dl {
  height: 30px; padding: 0 14px; border: none; border-radius: 15px;
  background: ${ACCENT}; color: #0f0f0f; font: 600 13px/1 "Roboto", sans-serif; cursor: pointer;
}
#${CTRL_ID} .acut-dl:disabled { opacity: .5; cursor: default; }
#${CTRL_ID} .acut-close { background: transparent; border: none; color: #aaa; cursor: pointer; font-size: 16px; line-height: 1; padding: 4px; }
#${CTRL_ID} .acut-close:hover { color: #fff; }
#${CTRL_ID} .acut-status { font-size: 12px; max-width: 260px; }
#${CTRL_ID} .acut-status.ok { color: #81c995; }
#${CTRL_ID} .acut-status.err { color: #f28b82; }
#${CTRL_ID} .acut-status code { background: rgba(255,255,255,.12); padding: 1px 5px; border-radius: 4px; }
`;
    (document.head || document.documentElement).appendChild(s);
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  const SCISSORS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`;

  function isWatch() { return location.pathname === '/watch' && !!videoId(); }
  function videoId(): string | null { return new URLSearchParams(location.search).get('v'); }
  function getVideo(): HTMLVideoElement | null {
    return (document.querySelector('#movie_player video') as HTMLVideoElement)
        || (document.querySelector('video.html5-main-video') as HTMLVideoElement)
        || (document.querySelector('video') as HTMLVideoElement);
  }
  function getPlayer(): HTMLElement | null {
    return (document.querySelector('#movie_player') as HTMLElement)
        || (document.querySelector('.html5-video-player') as HTMLElement);
  }
  function getBar(): HTMLElement | null { return document.querySelector('.ytp-progress-bar') as HTMLElement; }
  function clamp(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)); }
  function fmt(sec: number): string {
    if (!Number.isFinite(sec)) return '0:00';
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
    return (h > 0 ? `${h}:` : '') + `${mm}:${String(r).padStart(2, '0')}`;
  }

  // ── Cut button ──────────────────────────────────────────────────────────
  function ensureButton() {
    if (!isWatch()) { exitCut(); document.getElementById(BTN_ID)?.remove(); return; }
    if (document.getElementById(BTN_ID)) return;
    const anchor = document.querySelector('#top-level-buttons-computed')
                || document.querySelector('ytd-watch-metadata #actions ytd-menu-renderer')
                || document.querySelector('ytd-menu-renderer');
    if (!anchor) return;
    injectStyle();
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Cut a fragment of this video');
    btn.innerHTML = `${SCISSORS}<span>Cut</span>`;
    btn.addEventListener('click', toggleCut);
    anchor.appendChild(btn);
  }

  // ── cut mode ────────────────────────────────────────────────────────────
  let cutting = false;
  let curStart = 0, curEnd = 0, dur = 0;
  let raf = 0;

  function toggleCut() { cutting ? exitCut() : enterCut(); }

  function exitCut() {
    cutting = false;
    if (raf) cancelAnimationFrame(raf), (raf = 0);
    getPlayer()?.classList.remove('airglow-cutting');
    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById(CTRL_ID)?.remove();
    const b = document.getElementById(BTN_ID);
    if (b) b.dataset.open = 'false';
  }

  function enterCut() {
    const video = getVideo(), player = getPlayer(), bar = getBar();
    if (!video || !player || !bar) { airglow.log.warn('Cut: player/bar not ready'); return; }
    dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (!dur) { airglow.log.warn('Cut: no duration (live or not loaded)'); return; }
    curStart = clamp(video.currentTime || 0, 0, Math.max(0, dur - 1));
    curEnd = clamp(curStart + 15, curStart + 0.5, dur);
    cutting = true;
    player.classList.add('airglow-cutting');
    const b = document.getElementById(BTN_ID); if (b) b.dataset.open = 'true';
    buildOverlay(player);
    buildControl(player);
    raf = requestAnimationFrame(tick);
  }

  let bandEl: HTMLElement, hStart: HTMLElement, hEnd: HTMLElement;
  let timesEl: HTMLElement, dlBtn: HTMLButtonElement, statusEl: HTMLElement;

  function buildOverlay(player: HTMLElement) {
    const ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.innerHTML = `<div class="acut-band"></div><div class="acut-h" data-which="start"></div><div class="acut-h" data-which="end"></div>`;
    player.appendChild(ov);
    bandEl = ov.querySelector('.acut-band') as HTMLElement;
    hStart = ov.querySelector('.acut-h[data-which="start"]') as HTMLElement;
    hEnd = ov.querySelector('.acut-h[data-which="end"]') as HTMLElement;
    wireDrag(hStart, 'start');
    wireDrag(hEnd, 'end');
  }

  function buildControl(player: HTMLElement) {
    const c = document.createElement('div');
    c.id = CTRL_ID;
    c.innerHTML = `
      <span class="acut-times"></span>
      <button class="acut-dl">Download MP4</button>
      <span class="acut-status"></span>
      <button class="acut-close" aria-label="Exit cut mode">✕</button>`;
    player.appendChild(c);
    timesEl = c.querySelector('.acut-times') as HTMLElement;
    dlBtn = c.querySelector('.acut-dl') as HTMLButtonElement;
    statusEl = c.querySelector('.acut-status') as HTMLElement;
    (c.querySelector('.acut-close') as HTMLElement).addEventListener('click', exitCut);
    dlBtn.addEventListener('click', download);
  }

  function wireDrag(el: HTMLElement, which: 'start' | 'end') {
    el.addEventListener('pointerdown', (e: PointerEvent) => {
      // Don't let the press reach YouTube's progress bar (no accidental seek).
      e.preventDefault();
      e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch {}
      const move = (ev: PointerEvent) => {
        const bar = getBar(); if (!bar) return;
        const r = bar.getBoundingClientRect();
        const t = clamp((ev.clientX - r.left) / r.width, 0, 1) * dur;
        const MIN = 0.5;
        if (which === 'start') curStart = clamp(t, 0, curEnd - MIN);
        else curEnd = clamp(t, curStart + MIN, dur);
        const v = getVideo(); if (v) v.currentTime = which === 'start' ? curStart : curEnd;
      };
      const up = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
      };
      // Listen on window (capture) so the drag keeps tracking even when the
      // pointer leaves the small handle, and works without pointer capture.
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
    });
  }

  // keep the overlay aligned to the (moving/resizing) bar and re-render labels
  function tick() {
    if (!cutting) return;
    const player = getPlayer(), bar = getBar();
    const ov = document.getElementById(OVERLAY_ID);
    if (player && bar && ov) {
      const pr = player.getBoundingClientRect();
      const br = bar.getBoundingClientRect();
      ov.style.left = (br.left - pr.left) + 'px';
      ov.style.top = (br.top - pr.top) + 'px';
      ov.style.width = br.width + 'px';
      ov.style.height = br.height + 'px';
      const ps = dur > 0 ? (curStart / dur) * 100 : 0;
      const pe = dur > 0 ? (curEnd / dur) * 100 : 0;
      if (bandEl) { bandEl.style.left = ps + '%'; bandEl.style.width = (pe - ps) + '%'; }
      if (hStart) { hStart.style.left = ps + '%'; hStart.dataset.label = fmt(curStart); }
      if (hEnd) { hEnd.style.left = pe + '%'; hEnd.dataset.label = fmt(curEnd); }
    }
    if (timesEl) {
      timesEl.innerHTML = `✂ <b>${fmt(curStart)}</b><span class="sep">–</span><b>${fmt(curEnd)}</b> <span style="color:#888">(${fmt(curEnd - curStart)})</span>`;
    }
    raf = requestAnimationFrame(tick);
  }

  async function download() {
    const id = videoId();
    if (!id || !dlBtn) return;
    dlBtn.disabled = true;
    statusEl.className = 'acut-status';
    statusEl.textContent = '⏳ Downloading…';
    try {
      const res: any = await airglow.rpc('cut', {
        videoId: id,
        start: Math.round(curStart * 10) / 10,
        end: Math.round(curEnd * 10) / 10,
        title: document.title,
      });
      if (res?.ok) {
        statusEl.className = 'acut-status ok';
        statusEl.innerHTML = `✓ <code>Downloads/${res.file}</code>`;
      } else {
        statusEl.className = 'acut-status err';
        statusEl.textContent = '✕ ' + (res?.error || 'Download failed.');
      }
    } catch (e: any) {
      statusEl.className = 'acut-status err';
      statusEl.textContent = '✕ ' + (e?.message || String(e));
      airglow.log.error('Cut: rpc failed', { error: String(e) });
    } finally {
      dlBtn.disabled = false;
    }
  }

  // ── SPA lifecycle ─────────────────────────────────────────────────────────
  let lastV = videoId();
  setInterval(() => {
    const v = videoId();
    if (v !== lastV) { lastV = v; exitCut(); }
    ensureButton();
  }, 250);
  window.addEventListener('yt-navigate-finish', () => { exitCut(); ensureButton(); });

  let scheduled = false;
  const obs = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; ensureButton(); });
  });
  if (document.body) obs.observe(document.body, { childList: true, subtree: true });

  ensureButton();
})();
