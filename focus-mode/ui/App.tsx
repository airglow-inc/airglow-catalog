import { useState, useEffect, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Clock, Youtube, Instagram, Twitter, Linkedin, Mail, MessageCircle, RotateCcw, Crosshair, Newspaper, Timer, Ban } from 'lucide-react';
import { AppPage } from '@shared/components';
declare const airglow: any;

const SCHEDULE_KEY = 'focus_mode_schedule';
const SITES_KEY = 'focus_mode_sites';
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

interface Schedule {
  allowStart: number;
  allowEnd: number;
  enabled: boolean;
}

type SiteFlags = Record<string, boolean>;

const DEFAULT_SCHEDULE: Schedule = { allowStart: 2, allowEnd: 11, enabled: true };

const SITES = [
  { key: 'youtube', name: 'YouTube', desc: 'Hides feed, shorts, suggestions', icon: Youtube },
  { key: 'instagram', name: 'Instagram', desc: 'Hides feed, stories, reels', icon: Instagram },
  { key: 'x', name: 'X (Twitter)', desc: 'Hides timeline, sidebar, trends', icon: Twitter },
  { key: 'linkedin', name: 'LinkedIn', desc: 'Blocks entire site or just the feed', icon: Linkedin },
  { key: 'messaging', name: 'WhatsApp & Telegram', desc: 'Hides chat list, search only', icon: MessageCircle },
  { key: 'gmail', name: 'Gmail', desc: 'Time-based blocking with schedule', icon: Mail },
  { key: 'hltv', name: 'HLTV', desc: 'Blocks the entire site', icon: Crosshair },
  { key: 'hacker-news', name: 'Hacker News', desc: 'Blocks the entire site', icon: Newspaper },
] as const;

const DEFAULT_SITES: SiteFlags = Object.fromEntries(SITES.map(s => [s.key, true]));

function formatHour(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}

function getBlockedHours(start: number, end: number): number {
  if (start < end) return 24 - (end - start);
  return start - end;
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
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE);
  const [sites, setSites] = useState<SiteFlags>(DEFAULT_SITES);
  const [snooze, setSnooze] = useState<Record<string, number>>({});
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [linkedinFullBlock, setLinkedinFullBlock] = useState<boolean>(true);
  const [xStopAutoplay, setXStopAutoplay] = useState<boolean>(true);
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
      airglow.storage.get(SCHEDULE_KEY),
      airglow.storage.get(SITES_KEY),
      airglow.storage.get(LINKEDIN_FULL_BLOCK_KEY),
      airglow.storage.get(X_STOP_AUTOPLAY_KEY),
      airglow.storage.get(SNOOZE_KEY),
    ]).then(([schedVal, sitesVal, liFullVal, xAutoplayVal, snoozeVal]: [string | undefined, string | undefined, string | undefined, any, Record<string, number> | undefined]) => {
      if (schedVal) {
        try { setSchedule({ ...DEFAULT_SCHEDULE, ...JSON.parse(schedVal) }); } catch {}
      }
      if (sitesVal) {
        try { setSites({ ...DEFAULT_SITES, ...JSON.parse(sitesVal) }); } catch {}
      }
      if (liFullVal === 'false') setLinkedinFullBlock(false);
      if (xAutoplayVal === false || xAutoplayVal === 'false') setXStopAutoplay(false);
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

  function saveSchedule(updates: Partial<Schedule>) {
    const next = { ...schedule, ...updates };
    setSchedule(next);
    airglow.storage.set(SCHEDULE_KEY, JSON.stringify(next));
  }

  function setSiteFlag(key: string, value: boolean) {
    const next = { ...sites, [key]: value };
    setSites(next);
    airglow.storage.set(SITES_KEY, JSON.stringify(next));
  }

  // Toggle semantics: on → 10-minute pause; paused → resume now; off → back on.
  function toggleSite(key: string) {
    const enabled = sites[key] ?? true;
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
    (window as any).__test = { toggleSite, disablePermanently, getSnooze: () => snooze, getSites: () => sites };
  });

  const blockedHours = getBlockedHours(schedule.allowStart, schedule.allowEnd);
  const now = new Date().getHours();
  const isCurrentlyBlocked = schedule.enabled && sites.gmail && (() => {
    const { allowStart, allowEnd } = schedule;
    if (allowStart < allowEnd) return !(now >= allowStart && now < allowEnd);
    return !(now >= allowStart || now < allowEnd);
  })();

  return (
    <AppPage
      appId="focus-mode"
      name="Focus Mode"
      description="Hides distracting content on YouTube, Instagram, X, LinkedIn, WhatsApp/Telegram, and Gmail — feeds and suggestions are replaced with a calm focus screen, with optional time-based access for Gmail. Fully blocks HLTV and Hacker News."
      preview={<FocusBannerPreview />}
    >
      <div>
        {/* Sites list */}
        <div className="rounded-md" style={{ background: 'var(--bg-white)', boxShadow: 'var(--shadow-card)' }}>
          {SITES.map((site, i) => {
            const Icon = site.icon;
            const enabled = sites[site.key] ?? true;
            const pausedUntil = snooze[site.key] ?? 0;
            const paused = enabled && pausedUntil > nowMs;
            const isLast = i === SITES.length - 1;
            const hasSub = paused || ((site.key === 'gmail' || site.key === 'linkedin' || site.key === 'x') && enabled);
            return (
              <div key={site.key}>
                <div
                  className="flex items-center gap-3 px-5 py-4"
                  style={{ borderBottom: isLast && !hasSub ? 'none' : '1px solid var(--border-tertiary)' }}
                >
                  <Icon size={20} style={{ color: !enabled ? 'var(--fg-tertiary)' : paused ? AMBER : 'var(--clay)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-medium">{site.name}</div>
                    <div className="text-sm" style={{ color: 'var(--fg-tertiary)' }}>
                      {enabled ? site.desc : 'Off — flip the switch to block again'}
                    </div>
                  </div>
                  <Toggle on={enabled && !paused} paused={paused} onToggle={() => toggleSite(site.key)} testId={`toggle-${site.key}`} />
                </div>

                {/* 10-minute pause bar */}
                {paused && (
                  <div className="px-5 pb-4 pt-0" style={{ borderBottom: isLast && !((site.key === 'gmail' || site.key === 'linkedin' || site.key === 'x') && enabled) ? 'none' : '1px solid var(--border-tertiary)' }}>
                    <div
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md"
                      style={{
                        background: `color-mix(in srgb, ${AMBER} 9%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${AMBER} 28%, transparent)`,
                      }}
                    >
                      <Timer size={16} style={{ color: AMBER }} className="shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium tabular-nums" style={{ color: AMBER }} data-testid={`pause-countdown-${site.key}`}>
                          Paused · resumes in {formatRemaining(pausedUntil - nowMs)}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--fg-tertiary)' }}>
                          Blocking comes back on the next page load after time runs out
                        </div>
                      </div>
                      <button
                        onClick={() => disablePermanently(site.key)}
                        className="h-7 px-2.5 rounded-md text-xs font-semibold cursor-pointer border flex items-center gap-1.5 shrink-0"
                        style={{ background: 'var(--bg-white)', borderColor: 'var(--border-secondary)', color: 'var(--error)' }}
                        data-testid={`off-permanent-${site.key}`}
                      >
                        <Ban size={12} /> Turn off for good
                      </button>
                    </div>
                  </div>
                )}

                {/* LinkedIn full-block sub-toggle */}
                {site.key === 'linkedin' && enabled && (
                  <div className="px-5 pb-4 pt-1" style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-tertiary)' }}>
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
                  <div className="px-5 pb-4 pt-1" style={{ borderBottom: '1px solid var(--border-tertiary)' }}>
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
                  <div className="px-5 pb-4 pt-1" style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-tertiary)' }}>
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

                {/* Gmail schedule section */}
                {site.key === 'gmail' && enabled && (
                  <div className="px-5 pb-5 pt-1" style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-tertiary)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-medium" style={{ color: 'var(--fg-secondary)' }}>Time-based schedule</span>
                      <Toggle on={schedule.enabled} onToggle={() => saveSchedule({ enabled: !schedule.enabled })} testId="schedule-toggle" />
                    </div>

                    <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-sm" style={{ background: 'var(--bg-secondary)' }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: isCurrentlyBlocked ? 'var(--error)' : 'var(--olive)' }} />
                      <span className="text-sm" style={{ color: 'var(--fg-secondary)' }}>
                        {!schedule.enabled
                          ? 'Schedule off — Gmail always blocked'
                          : isCurrentlyBlocked
                            ? `Blocked now (until ${formatHour(schedule.allowStart)})`
                            : `Accessible (until ${formatHour(schedule.allowEnd)})`}
                      </span>
                    </div>

                    <div className={`space-y-5 ${!schedule.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                      <div>
                        <div className="flex justify-between items-baseline mb-2">
                          <label className="text-sm font-medium" style={{ color: 'var(--fg-secondary)' }}>Access starts</label>
                          <span className="text-sm font-mono" style={{ color: 'var(--clay)' }}>{formatHour(schedule.allowStart)}</span>
                        </div>
                        <input
                          type="range" min={0} max={23} step={1}
                          value={schedule.allowStart}
                          onChange={(e) => saveSchedule({ allowStart: parseInt(e.target.value) })}
                          className="w-full h-1.5 rounded-full cursor-pointer accent-[var(--clay)]"
                          style={{ background: 'var(--bg-tertiary)' }}
                          data-testid="slider-allow-start"
                        />
                        <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--fg-tertiary)' }}>
                          <span>12 AM</span><span>12 PM</span><span>11 PM</span>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between items-baseline mb-2">
                          <label className="text-sm font-medium" style={{ color: 'var(--fg-secondary)' }}>Access ends</label>
                          <span className="text-sm font-mono" style={{ color: 'var(--clay)' }}>{formatHour(schedule.allowEnd)}</span>
                        </div>
                        <input
                          type="range" min={0} max={23} step={1}
                          value={schedule.allowEnd}
                          onChange={(e) => saveSchedule({ allowEnd: parseInt(e.target.value) })}
                          className="w-full h-1.5 rounded-full cursor-pointer accent-[var(--clay)]"
                          style={{ background: 'var(--bg-tertiary)' }}
                          data-testid="slider-allow-end"
                        />
                        <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--fg-tertiary)' }}>
                          <span>12 AM</span><span>12 PM</span><span>11 PM</span>
                        </div>
                      </div>

                      <div className="pt-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock size={14} style={{ color: 'var(--fg-tertiary)' }} />
                          <span className="text-xs" style={{ color: 'var(--fg-tertiary)' }}>
                            {blockedHours}h blocked · {24 - blockedHours}h accessible
                          </span>
                        </div>
                        <div className="h-3 rounded-full overflow-hidden flex" style={{ background: 'var(--bg-tertiary)' }}>
                          {Array.from({ length: 24 }, (_, i) => {
                            const { allowStart, allowEnd } = schedule;
                            const allowed = allowStart < allowEnd
                              ? i >= allowStart && i < allowEnd
                              : i >= allowStart || i < allowEnd;
                            return (
                              <div
                                key={i}
                                className="flex-1 transition-colors"
                                style={{
                                  background: allowed ? 'var(--olive)' : 'color-mix(in srgb, var(--error) 40%, transparent)',
                                  opacity: i === now ? 1 : 0.7,
                                  borderRight: i < 23 ? '1px solid var(--bg-primary)' : 'none',
                                }}
                                title={`${formatHour(i)} — ${allowed ? 'Accessible' : 'Blocked'}`}
                              />
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--fg-tertiary)' }}>
                          <span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-sm mt-4" style={{ color: 'var(--fg-tertiary)' }}>
          Flipping a switch off pauses blocking for 10 minutes; use “Turn off for good” in the pause bar to disable a site permanently. Changes apply on next page load.
        </p>
      </div>
    </AppPage>
  );
}

createRoot(document.getElementById('root')!).render(createElement(App));
