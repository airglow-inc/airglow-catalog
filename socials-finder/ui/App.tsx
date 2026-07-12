import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppPage, SettingsSection, SettingField } from '@shared/components';

interface FoundAccount { handle: string; url: string }

interface TraceStep {
  type: 'search' | 'results' | 'text';
  query?: string;
  results?: { title: string; url: string }[];
  text?: string;
}

interface FoundWebsite { url: string; domain: string }
interface GithubProfile { name: string | null; avatar: string; repos: number }
interface XProfile { name: string | null; avatar: string; followers: number }

interface SocialsEntry {
  slug: string;
  name: string;
  headline?: string;
  profileUrl: string;
  github: FoundAccount | null;
  x: FoundAccount | null;
  website?: FoundWebsite | null;
  githubProfile?: GithubProfile | null;
  xProfile?: XProfile | null;
  sources?: string[];
  trace?: TraceStep[];
  searches?: number | null;
  model?: string | null;
  fetchedAt: number;
}

const CACHE_PREFIX = 'socials:';

// ── Preview — styles copied verbatim from userscripts/linkedin.ts ─────────────

const AIRGLOW_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="245 250 520 520" aria-hidden="true" style={{ width: 22, height: 22 }}>
    <g transform="translate(52, 18) scale(0.98)">
      <path fill="#1c1917" d="M416.6 246.2 L200.8 753.5 L707.6 753.5 L490.8 246.2 Z" />
      <path fill="#F8BB5B" fillRule="evenodd" d="M416.6 246.2 L210.4 731 L313 649.9 L326.7 649.9 L446.9 551.2 L539.7 639.1 L560.2 640.1 L698 731 L490.8 246.2 Z M392.1 543.3 L510.4 543.3 L450.8 382.1 Z" />
      <path fill="#F99E3D" d="M200.8 753.5 L318.8 753.5 L355 678.2 L393.1 697.8 L448.8 634.2 L473.3 659.6 L468.4 634.2 L475.2 627.4 L446.9 570.7 L334.5 667.5 Z" />
      <path fill="#F99E3D" d="M595.4 753.5 L707.6 753.5 L556.3 669.4 Z" />
    </g>
  </svg>
);

const cardStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  gap: 10,
  padding: '10px 14px',
  width: '100%',
  maxWidth: 240,
  boxSizing: 'border-box',
  background: 'linear-gradient(180deg, #FFFCF4, #FFFDFA)',
  border: '1.5px solid #F5A623',
  borderRadius: 10,
  boxShadow: '0 2px 10px rgba(245,166,35,0.14), 0 0 0 1px rgba(245,166,35,0.08)',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

// Static stand-ins for the real profile photos the widget fetches.
const mockAvatar = (bg: string, initials: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${bg}"/>` +
    `<text x="16" y="21" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">${initials}</text></svg>`,
  );

function PreviewAccountRow({ avatar, round, label, sub }: { avatar: string; round?: boolean; label: string; sub: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <img src={avatar} alt={label} style={{ width: 32, height: 32, borderRadius: round ? '50%' : 4, display: 'block', objectFit: 'cover' }} />
      <span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(0,0,0,0.9)', lineHeight: 1.25, display: 'block' }}>{label}</span>
        <span style={{ fontSize: 12.5, fontWeight: 400, color: 'rgba(0,0,0,0.6)', lineHeight: 1.25, marginTop: 1, display: 'block' }}>{sub}</span>
      </span>
    </span>
  );
}

function Preview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <div style={cardStyle}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, color: 'rgba(0,0,0,0.9)', padding: 2 }}>
          <span style={{ width: 22, height: 22, borderRadius: 5, overflow: 'hidden', display: 'inline-flex', flexShrink: 0 }}>{AIRGLOW_ICON}</span>
          Find socials
        </span>
      </div>
      <div style={cardStyle}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 400, color: 'rgba(0,0,0,0.6)', padding: 2, lineHeight: 1.3 }}>
          <span style={{ width: 14, height: 14, flexShrink: 0, borderRadius: '50%', border: '2px solid rgba(245,166,35,0.35)', borderTopColor: '#F5A623', boxSizing: 'border-box' }} />
          <span>🔗 github.com</span>
        </span>
        <span style={{ fontSize: 11.5, color: 'rgba(0,0,0,0.4)', paddingLeft: 22 }}>3 searches · 6 sources · 12s</span>
      </div>
      <div style={cardStyle}>
        <PreviewAccountRow avatar={mockAvatar('#57606a', 'JL')} label="GitHub" sub="jamesliounis · 42 repos" />
        <PreviewAccountRow avatar={mockAvatar('#1d9bf0', 'JL')} round label="X" sub="@JamesLiounis_ · 1.2K followers" />
        <PreviewAccountRow avatar={mockAvatar('#5b6b7b', '🌐')} label="Website" sub="jamesliounis.com" />
      </div>
      <p className="text-xs" style={{ color: 'var(--fg-tertiary)', margin: 0 }}>
        The button sits below the affiliation block on a profile; while a lookup
        runs, the pill shows the current phase plus elapsed time (searches run
        server-side in one silent LLM call, so individual queries can't stream).
        The result card then replaces it (cached — shown automatically next
        visit): profile photo and repo count from GitHub; photo and follower
        count for X; and a personal website if the person has one. The search
        count and result links land in the trace below afterwards.
      </p>
    </div>
  );
}

// ── Trace log ─────────────────────────────────────────────────────────────────

function TraceLog({ entry }: { entry: SocialsEntry }) {
  if (!entry.trace?.length) {
    return (
      <p className="text-xs py-2" style={{ color: 'var(--fg-tertiary)' }}>
        No trace recorded for this lookup (found before trace logging was added). Re-run it from the profile (↻) to capture one.
      </p>
    );
  }
  return (
    <div className="py-2 text-xs" style={{ color: 'var(--fg-secondary)' }}>
      {(entry.model || entry.searches != null) && (
        <p className="mb-2" style={{ color: 'var(--fg-tertiary)' }}>
          {entry.model ?? 'model'} · {entry.searches ?? '?'} web searches
        </p>
      )}
      <ol className="flex flex-col gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {entry.trace.map((step, i) => (
          <li key={i} style={{ borderLeft: '2px solid var(--border-tertiary)', paddingLeft: 10 }}>
            {step.type === 'search' && (
              <span>🔍 searched <span className="font-semibold" style={{ color: 'var(--fg-primary)' }}>“{step.query}”</span></span>
            )}
            {step.type === 'results' && (
              step.results?.length ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="flex flex-col gap-0.5">
                  {step.results.map((r, j) => (
                    <li key={j} className="truncate" style={{ maxWidth: '100%' }}>
                      ↳ <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--accent, #0a66c2)' }}>{r.title || r.url}</a>
                    </li>
                  ))}
                </ul>
              ) : (
                <span style={{ color: 'var(--fg-tertiary)' }}>↳ no results</span>
              )
            )}
            {step.type === 'text' && (
              <pre className="whitespace-pre-wrap" style={{ margin: 0, fontFamily: 'inherit', color: 'var(--fg-secondary)' }}>{step.text}</pre>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function App() {
  const [autoFind, setAutoFind] = useState(false);
  const [entries, setEntries] = useState<SocialsEntry[] | null>(null);
  const [openTrace, setOpenTrace] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    const keys = (await airglow.storage.list()).filter((k) => k.startsWith(CACHE_PREFIX));
    const values = await Promise.all(keys.map((k) => airglow.storage.get<SocialsEntry>(k)));
    const list = values.filter((v): v is SocialsEntry => !!v && typeof v === 'object');
    list.sort((a, b) => (b.fetchedAt ?? 0) - (a.fetchedAt ?? 0));
    setEntries(list);
  }, []);

  useEffect(() => {
    airglow.storage.get<boolean>('auto_find').then((v) => setAutoFind(!!v));
    void loadEntries();
  }, [loadEntries]);

  const toggleAutoFind = useCallback(async (on: boolean) => {
    setAutoFind(on);
    await airglow.storage.set('auto_find', on);
  }, []);

  const removeEntry = useCallback(async (slug: string) => {
    await airglow.storage.delete(CACHE_PREFIX + slug);
    void loadEntries();
  }, [loadEntries]);

  const clearAll = useCallback(async () => {
    const keys = (await airglow.storage.list()).filter((k) => k.startsWith(CACHE_PREFIX));
    await Promise.all(keys.map((k) => airglow.storage.delete(k)));
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    (window as any).__test = { toggleAutoFind, removeEntry, clearAll, reload: loadEntries };
  }, [toggleAutoFind, removeEntry, clearAll, loadEntries]);

  return (
    <AppPage
      appId="socials-finder"
      name="Socials Finder"
      description="Find a person's GitHub and X accounts from their LinkedIn profile."
      preview={<Preview />}
    >
      <SettingsSection title="Settings">
        <SettingField
          label="Auto-find on profile visit"
          hint="Run the lookup automatically when you open a profile that has no cached result, instead of waiting for the button. Each lookup spends a few web searches from the shared LLM budget."
        >
          <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--fg-primary)' }}>
            <input
              type="checkbox"
              data-testid="auto-find"
              checked={autoFind}
              onChange={(e) => void toggleAutoFind(e.target.checked)}
            />
            Enabled
          </label>
        </SettingField>
      </SettingsSection>

      <SettingsSection title="People">
        {entries === null ? (
          <p className="text-sm" style={{ color: 'var(--fg-tertiary)' }}>Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--fg-tertiary)' }}>
            No lookups yet. Open a LinkedIn profile and press “Find socials”.
          </p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--fg-tertiary)', textAlign: 'left' }}>
                    <th className="py-2 pr-4 font-semibold">Name</th>
                    <th className="py-2 pr-4 font-semibold">GitHub</th>
                    <th className="py-2 pr-4 font-semibold">X</th>
                    <th className="py-2 pr-4 font-semibold">Website</th>
                    <th className="py-2 pr-4 font-semibold">Found</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <React.Fragment key={e.slug}>
                    <tr data-testid={`row-${e.slug}`} style={{ borderTop: '1px solid var(--border-tertiary)' }}>
                      <td className="py-2 pr-4">
                        <a href={e.profileUrl} target="_blank" rel="noopener noreferrer"
                           className="font-semibold hover:underline" style={{ color: 'var(--fg-primary)' }}>
                          {e.name}
                        </a>
                        {e.headline && (
                          <div className="text-xs" style={{ color: 'var(--fg-tertiary)' }}>{e.headline}</div>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {e.github ? (
                          <a href={e.github.url} target="_blank" rel="noopener noreferrer"
                             className="hover:underline" style={{ color: 'var(--accent, #0a66c2)' }}>
                            {e.github.handle}
                          </a>
                        ) : (
                          <span style={{ color: 'var(--fg-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {e.x ? (
                          <a href={e.x.url} target="_blank" rel="noopener noreferrer"
                             className="hover:underline" style={{ color: 'var(--accent, #0a66c2)' }}>
                            {e.x.handle}
                          </a>
                        ) : (
                          <span style={{ color: 'var(--fg-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {e.website ? (
                          <a href={e.website.url} target="_blank" rel="noopener noreferrer"
                             className="hover:underline" style={{ color: 'var(--accent, #0a66c2)' }}>
                            {e.website.domain}
                          </a>
                        ) : (
                          <span style={{ color: 'var(--fg-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap" style={{ color: 'var(--fg-tertiary)' }}>
                        {e.fetchedAt ? new Date(e.fetchedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          data-testid={`trace-${e.slug}`}
                          onClick={() => setOpenTrace(openTrace === e.slug ? null : e.slug)}
                          className="text-xs hover:underline mr-3"
                          style={{ color: 'var(--fg-tertiary)', cursor: 'pointer', background: 'none', border: 'none' }}
                          title="Show how the model found these accounts"
                        >
                          {openTrace === e.slug ? 'Hide trace' : 'Trace'}
                        </button>
                        <button
                          data-testid={`remove-${e.slug}`}
                          onClick={() => void removeEntry(e.slug)}
                          className="text-xs hover:underline"
                          style={{ color: 'var(--fg-tertiary)', cursor: 'pointer', background: 'none', border: 'none' }}
                          title="Forget this person (the profile shows the button again)"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                    {openTrace === e.slug && (
                      <tr data-testid={`tracelog-${e.slug}`}>
                        <td colSpan={6} style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '0 12px' }}>
                          <TraceLog entry={e} />
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              data-testid="clear-all"
              onClick={() => void clearAll()}
              className="mt-3 text-xs hover:underline"
              style={{ color: 'var(--fg-tertiary)', cursor: 'pointer', background: 'none', border: 'none' }}
            >
              Clear all
            </button>
          </>
        )}
      </SettingsSection>
    </AppPage>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
