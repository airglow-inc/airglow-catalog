import { useState, useEffect, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Youtube, Instagram, Twitter, Linkedin, MessageCircle, RotateCcw, Globe, Plus, Trash2, Timer, Ban } from 'lucide-react';
import { AppPage } from '@shared/components';
declare const airglow: any;

const SITES_KEY = 'focus_mode_sites';
const BLOCKED_HOSTS_KEY = 'focus_mode_blocked_hosts';
const SNOOZE_KEY = 'focus_mode_snooze';
const SNOOZE_MS = 10 * 60 * 1000;
const AMBER = '#b58a2e';
const LINKEDIN_FULL_BLOCK_KEY = 'focus_mode_linkedin_full_block';
const X_STOP_AUTOPLAY_KEY = 'focus_mode_x_stop_autoplay';
const X_COUNT_KEY = 'x_open_count';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type SiteFlags = Record<string, boolean>;

const SITES = [
  { key: 'youtube', name: 'YouTube', desc: 'Hides feed, shorts, suggestions', icon: Youtube },
  { key: 'instagram', name: 'Instagram', desc: 'Hides feed, stories, reels', icon: Instagram },
  { key: 'x', name: 'X (Twitter)', desc: 'Hides timeline, sidebar, trends', icon: Twitter },
  { key: 'linkedin', name: 'LinkedIn', desc: 'Blocks entire site or just the feed', icon: Linkedin },
  { key: 'messaging', name: 'WhatsApp & Telegram', desc: 'Hides chat list, search only', icon: MessageCircle },
] as const;

// Everything ships off — each block is opt-in from this page.
const DEFAULT_SITES: SiteFlags = Object.fromEntries(SITES.map(s => [s.key, false]));

// Fully-blocked sites the user can extend. Kept in sync with
// DEFAULT_BLOCKED_HOSTS in userscripts/blocked-sites.ts (used until the user
// first edits the list).
const DEFAULT_BLOCKED_HOSTS = ['hltv.org', 'news.ycombinator.com'];

// "reddit.com" from "https://www.reddit.com/r/all?x=1" — or null if the input
// doesn't look like a hostname.
function normalizeHost(raw: string): string | null {
  let h = raw.trim().toLowerCase();
  h = h.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  h = h.split(/[/?#]/)[0].split(':')[0];
  if (!h || !h.includes('.') || /[^a-z0-9.-]/.test(h)) return null;
  return h;
}

function Toggle({ on, paused, onToggle, testId }: { on: boolean; paused?: boolean; onToggle: () => void; testId?: string }) {
  return (
    <button
      onClick={onToggle}
      className="relative w-11 h-6 rounded-full cursor-pointer transition-colors shrink-0"
      style={{ background: on ? 'var(--clay)' : paused ? AMBER : 'var(--bg-tertiary)' }}
      data-testid={testId}
      title={paused ? 'Paused — click to resume blocking now' : undefined}
    >
      <div
        className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
        style={{
          background: 'var(--bg-white)',
          transform: on ? 'translateX(22px)' : paused ? 'translateX(12px)' : 'translateX(2px)',
        }}
      />
    </button>
  );
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// The focus banner the YouTube userscript injects in place of the feed,
// matching its real markup (focus-mode/userscripts/youtube.ts): the analog
// clock face with indigo accents plus the motivational copy. Static preview.
function FocusBannerPreview() {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = ((i * 30 - 90) * Math.PI) / 180;
    return (
      <line
        key={i}
        x1={100 + 80 * Math.cos(a)} y1={100 + 80 * Math.sin(a)}
        x2={100 + 88 * Math.cos(a)} y2={100 + 88 * Math.sin(a)}
        stroke="#6366f1" strokeWidth="2" strokeLinecap="round"
      />
    );
  });
  return (
    <div
      className="rounded-xl px-6 py-8 text-center"
      style={{ background: '#1a1d2e', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
    >
      <svg width="96" height="96" viewBox="0 0 200 200" style={{ margin: '0 auto 16px', display: 'block' }}>
        <circle cx="100" cy="100" r="95" fill="#252545" stroke="#2a2a4a" strokeWidth="2" />
        <circle cx="100" cy="100" r="88" fill="none" stroke="#2a2a4a" strokeWidth="0.5" />
        {ticks}
        <line x1="100" y1="100" x2="118" y2="60" stroke="#e0e0e0" strokeWidth="3.5" strokeLinecap="round" />
        <line x1="100" y1="100" x2="140" y2="120" stroke="#e0e0e0" strokeWidth="2" strokeLinecap="round" />
        <line x1="100" y1="100" x2="80" y2="48" stroke="#6366f1" strokeWidth="1" strokeLinecap="round" />
        <circle cx="100" cy="100" r="4" fill="#6366f1" />
      </svg>
      <p className="m-0" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.2, color: '#e2e4eb' }}>
        Time to do great things
      </p>
    </div>
  );
}

export default function App() {
  const [sites, setSites] = useState<SiteFlags>(DEFAULT_SITES);
  const [blockedHosts, setBlockedHosts] = useState<string[]>(DEFAULT_BLOCKED_HOSTS);
  const [newHost, setNewHost] = useState('');
  const [snooze, setSnooze] = useState<Record<string, number>>({});
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [linkedinFullBlock, setLinkedinFullBlock] = useState<boolean>(false);
  const [xStopAutoplay, setXStopAutoplay] = useState<boolean>(false);
  const [xCount, setXCount] = useState<number>(0);

  function loadXCount() {
    airglow.storage.get(X_COUNT_KEY).then((v: any) => {
      setXCount(v && typeof v.count === 'number' && v.date === todayStr() ? v.count : 0);
    });
  }

  function resetXCount() {
    airglow.storage.set(X_COUNT_KEY, { date: todayStr(), count: 0 }).then(loadXCount);
  }

  useEffect(() => {
    loadXCount();
    Promise.all([
      airglow.storage.get(SITES_KEY),
      airglow.storage.get(BLOCKED_HOSTS_KEY),
      airglow.storage.get(LINKEDIN_FULL_BLOCK_KEY),
      airglow.storage.get(X_STOP_AUTOPLAY_KEY),
      airglow.storage.get(SNOOZE_KEY),
    ]).then(([sitesVal, hostsVal, liFullVal, xAutoplayVal, snoozeVal]: [string | undefined, string[] | undefined, any, any, Record<string, number> | undefined]) => {
      if (sitesVal) {
        try { setSites({ ...DEFAULT_SITES, ...JSON.parse(sitesVal) }); } catch {}
      }
      if (Array.isArray(hostsVal)) setBlockedHosts(hostsVal);
      if (liFullVal === true || liFullVal === 'true') setLinkedinFullBlock(true);
      if (xAutoplayVal === true || xAutoplayVal === 'true') setXStopAutoplay(true);
      if (snoozeVal && typeof snoozeVal === 'object') setSnooze(snoozeVal);
    });
  }, []);

  // Tick every second while any pause is counting down.
  useEffect(() => {
    if (!Object.values(snooze).some(t => t > Date.now())) return;
    const id = setInterval(() => {
      setNowMs(Date.now());
      // When the last countdown hits zero, prune expired entries; the state
      // change re-runs this effect and stops the interval.
      if (!Object.values(snooze).some(t => t > Date.now())) saveSnooze(snooze);
    }, 1000);
    return () => clearInterval(id);
  }, [snooze]);

  function saveSnooze(next: Record<string, number>) {
    const pruned = Object.fromEntries(Object.entries(next).filter(([, t]) => t > Date.now()));
    setSnooze(pruned);
    airglow.storage.set(SNOOZE_KEY, pruned);
  }

  function toggleLinkedinFullBlock() {
    const next = !linkedinFullBlock;
    setLinkedinFullBlock(next);
    airglow.storage.set(LINKEDIN_FULL_BLOCK_KEY, String(next));
  }

  function toggleXStopAutoplay() {
    const next = !xStopAutoplay;
    setXStopAutoplay(next);
    airglow.storage.set(X_STOP_AUTOPLAY_KEY, next);
  }

  function setSiteFlag(key: string, value: boolean) {
    const next = { ...sites, [key]: value };
    setSites(next);
    airglow.storage.set(SITES_KEY, JSON.stringify(next));
  }

  function saveHosts(next: string[]) {
    setBlockedHosts(next);
    airglow.storage.set(BLOCKED_HOSTS_KEY, next);
  }

  function addHost(e: { preventDefault: () => void }) {
    e.preventDefault();
    const host = normalizeHost(newHost);
    if (!host) return;
    setNewHost('');
    if (!blockedHosts.includes(host)) saveHosts([...blockedHosts, host]);
    // Adding a site means "block it" — switch it on right away.
    setSiteFlag(host, true);
  }

  function removeHost(host: string) {
    saveHosts(blockedHosts.filter(h => h !== host));
    const { [host]: _flag, ...restSites } = sites;
    setSites(restSites);
    airglow.storage.set(SITES_KEY, JSON.stringify(restSites));
    const { [host]: _snooze, ...restSnooze } = snooze;
    saveSnooze(restSnooze);
  }

  // Toggle semantics: on → 10-minute pause; paused → resume now; off → back on.
  function toggleSite(key: string) {
    const enabled = sites[key] ?? false;
    const paused = (snooze[key] ?? 0) > Date.now();
    if (!enabled) {
      setSiteFlag(key, true);
      const { [key]: _, ...rest } = snooze;
      saveSnooze(rest);
    } else if (paused) {
      const { [key]: _, ...rest } = snooze;
      saveSnooze(rest);
    } else {
      saveSnooze({ ...snooze, [key]: Date.now() + SNOOZE_MS });
    }
  }

  function disablePermanently(key: string) {
    setSiteFlag(key, false);
    const { [key]: _, ...rest } = snooze;
    saveSnooze(rest);
  }

  useEffect(() => {
    (window as any).__test = { toggleSite, disablePermanently, addHost: (h: string) => { setNewHost(h); }, getSnooze: () => snooze, getSites: () => sites, getHosts: () => blockedHosts };
  });

  function PauseBar({ siteKey, until, borderBottom }: { siteKey: string; until: number; borderBottom: string }) {
    return (
      <div className="px-5 pb-4 pt-0" style={{ borderBottom }}>
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-md"
          style={{
            background: `color-mix(in srgb, ${AMBER} 9%, transparent)`,
            border: `1px solid color-mix(in srgb, ${AMBER} 28%, transparent)`,
          }}
        >
          <Timer size={16} style={{ color: AMBER }} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium tabular-nums" style={{ color: AMBER }} data-testid={`pause-countdown-${siteKey}`}>
              Paused · resumes in {formatRemaining(until - nowMs)}
            </div>
            <div className="text-xs" style={{ color: 'var(--fg-tertiary)' }}>
              Blocking comes back on the next page load after time runs out
            </div>
          </div>
          <button
            onClick={() => disablePermanently(siteKey)}
            className="h-7 px-2.5 rounded-md text-xs font-semibold cursor-pointer border flex items-center gap-1.5 shrink-0"
            style={{ background: 'var(--bg-white)', borderColor: 'var(--border-secondary)', color: 'var(--error)' }}
            data-testid={`off-permanent-${siteKey}`}
          >
            <Ban size={12} /> Turn off for good
          </button>
        </div>
      </div>
    );
  }

  const rowBorder = '1px solid var(--border-tertiary)';

  return (
    <AppPage
      appId="focus-mode"
      name="Focus Mode"
      description="Hides distracting content on YouTube, Instagram, X, LinkedIn, and WhatsApp/Telegram — feeds and suggestions are replaced with a calm focus screen. Fully blocks any site you add to the block list. Everything is off until you switch it on."
      preview={<FocusBannerPreview />}
    >
      <div>
        {/* Sites list */}
        <div className="rounded-md" style={{ background: 'var(--bg-white)', boxShadow: 'var(--shadow-card)' }}>
          {SITES.map((site) => {
            const Icon = site.icon;
            const enabled = sites[site.key] ?? false;
            const pausedUntil = snooze[site.key] ?? 0;
            const paused = enabled && pausedUntil > nowMs;
            return (
              <div key={site.key}>
                <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: rowBorder }}>
                  <Icon size={20} style={{ color: !enabled ? 'var(--fg-tertiary)' : paused ? AMBER : 'var(--clay)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-medium">{site.name}</div>
                    <div className="text-sm" style={{ color: 'var(--fg-tertiary)' }}>
                      {enabled ? site.desc : 'Off — flip the switch to block'}
                    </div>
                  </div>
                  <Toggle on={enabled && !paused} paused={paused} onToggle={() => toggleSite(site.key)} testId={`toggle-${site.key}`} />
                </div>

                {paused && <PauseBar siteKey={site.key} until={pausedUntil} borderBottom={rowBorder} />}

                {/* LinkedIn full-block sub-toggle */}
                {site.key === 'linkedin' && enabled && (
                  <div className="px-5 pb-4 pt-1" style={{ borderBottom: rowBorder }}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="text-sm font-medium" style={{ color: 'var(--fg-secondary)' }}>Block entire site</div>
                        <div className="text-xs" style={{ color: 'var(--fg-tertiary)' }}>
                          {linkedinFullBlock ? 'All LinkedIn pages show a focus screen' : 'Only the feed is hidden'}
                        </div>
                      </div>
                      <Toggle on={linkedinFullBlock} onToggle={toggleLinkedinFullBlock} testId="toggle-linkedin-full" />
                    </div>
                  </div>
                )}

                {/* X stop-autoplay sub-toggle */}
                {site.key === 'x' && enabled && (
                  <div className="px-5 pb-4 pt-1" style={{ borderBottom: rowBorder }}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="text-sm font-medium" style={{ color: 'var(--fg-secondary)' }}>Hide videos</div>
                        <div className="text-xs" style={{ color: 'var(--fg-tertiary)' }}>
                          {xStopAutoplay ? 'Videos are replaced with a small “Video attached” pill' : 'Videos show and play normally'}
                        </div>
                      </div>
                      <Toggle on={xStopAutoplay} onToggle={toggleXStopAutoplay} testId="toggle-x-autoplay" />
                    </div>
                  </div>
                )}

                {/* X daily open counter */}
                {site.key === 'x' && enabled && (
                  <div className="px-5 pb-4 pt-1" style={{ borderBottom: rowBorder }}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-medium" style={{ color: 'var(--fg-secondary)' }}>Opened today</span>
                          <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--clay)' }}>{xCount}×</span>
                        </div>
                        <div className="text-xs" style={{ color: 'var(--fg-tertiary)' }}>
                          A floating card on x.com counts your visits. Resets at midnight.
                        </div>
                      </div>
                      <button
                        onClick={resetXCount}
                        className="h-8 px-2.5 rounded-md text-xs font-semibold cursor-pointer border flex items-center gap-1.5 shrink-0"
                        style={{ background: 'var(--bg-white)', borderColor: 'var(--border-secondary)', color: 'var(--fg-secondary)' }}
                        data-testid="reset-x-count"
                      >
                        <RotateCcw size={13} /> Reset
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* User-managed fully-blocked sites */}
          {blockedHosts.map((host) => {
            const enabled = sites[host] ?? false;
            const pausedUntil = snooze[host] ?? 0;
            const paused = enabled && pausedUntil > nowMs;
            return (
              <div key={host}>
                <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: rowBorder }}>
                  <Globe size={20} style={{ color: !enabled ? 'var(--fg-tertiary)' : paused ? AMBER : 'var(--clay)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-medium">{host}</div>
                    <div className="text-sm" style={{ color: 'var(--fg-tertiary)' }}>
                      {enabled ? 'Blocks the entire site' : 'Off — flip the switch to block'}
                    </div>
                  </div>
                  <button
                    onClick={() => removeHost(host)}
                    className="w-8 h-8 rounded-md cursor-pointer flex items-center justify-center shrink-0"
                    style={{ color: 'var(--fg-tertiary)', background: 'transparent' }}
                    title="Remove from list"
                    data-testid={`remove-host-${host}`}
                  >
                    <Trash2 size={15} />
                  </button>
                  <Toggle on={enabled && !paused} paused={paused} onToggle={() => toggleSite(host)} testId={`toggle-${host}`} />
                </div>

                {paused && <PauseBar siteKey={host} until={pausedUntil} borderBottom={rowBorder} />}
              </div>
            );
          })}

          {/* Add a site to the block list */}
          <form onSubmit={addHost} className="flex items-center gap-3 px-5 py-4">
            <Plus size={20} style={{ color: 'var(--fg-tertiary)' }} />
            <input
              value={newHost}
              onChange={(e) => setNewHost(e.target.value)}
              placeholder="Block another site — e.g. reddit.com"
              className="flex-1 min-w-0 text-base bg-transparent outline-none border-none"
              style={{ color: 'var(--fg-primary)' }}
              data-testid="add-host-input"
            />
            <button
              type="submit"
              disabled={!normalizeHost(newHost)}
              className="h-8 px-3 rounded-md text-xs font-semibold border flex items-center gap-1.5 shrink-0"
              style={{
                background: 'var(--bg-white)',
                borderColor: 'var(--border-secondary)',
                color: normalizeHost(newHost) ? 'var(--fg-secondary)' : 'var(--fg-tertiary)',
                cursor: normalizeHost(newHost) ? 'pointer' : 'default',
              }}
              data-testid="add-host-button"
            >
              Add
            </button>
          </form>
        </div>

        <p className="text-sm mt-4" style={{ color: 'var(--fg-tertiary)' }}>
          Flipping a switch off pauses blocking for 10 minutes; use “Turn off for good” in the pause bar to disable a site permanently. Changes apply on next page load.
        </p>
      </div>
    </AppPage>
  );
}

createRoot(document.getElementById('root')!).render(createElement(App));
