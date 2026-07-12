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
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '16px 24px',
  width: '100%',
  boxSizing: 'border-box',
  position: 'relative',
  background: 'linear-gradient(180deg, #FFFCF4, #FFFDFA)',
  border: '1.5px solid #F5A623',
  borderRadius: 10,
  boxShadow: '0 2px 10px rgba(245,166,35,0.14), 0 0 0 1px rgba(245,166,35,0.08)',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

// Section heading, present in every card state (like LinkedIn's "About");
// the result state carries the reload control inline after the title.
function PreviewHead({ refresh }: { refresh?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: 'rgba(0,0,0,0.9)', lineHeight: 1.3 }}>
      <span style={{ width: 22, height: 22, borderRadius: 5, overflow: 'hidden', display: 'inline-flex', flexShrink: 0 }}>{AIRGLOW_ICON}</span>
      Socials
      {refresh && <span style={{ padding: '0 2px', fontSize: 20, lineHeight: 1, color: 'rgba(0,0,0,0.35)', fontWeight: 400 }}>↻</span>}
    </span>
  );
}

// Static stand-ins for the real profile photos the widget fetches.
const mockAvatar = (bg: string, initials: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${bg}"/>` +
    `<text x="16" y="21" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">${initials}</text></svg>`,
  );

// Brand logos, verbatim from userscripts/linkedin.ts.
const GH_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
      '<rect width="16" height="16" fill="#ffffff"/>' +
      '<g transform="translate(1.6,1.6) scale(0.8)"><path fill="#1b1f24" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></g>' +
    '</svg>',
  );
const X_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<rect width="24" height="24" fill="#000000"/>' +
      '<g transform="translate(3.6,3.6) scale(0.7)"><path fill="#ffffff" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></g>' +
    '</svg>',
  );

function PreviewAccountRow({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <img src={icon} alt={label} style={{ width: 32, height: 32, borderRadius: 4, display: 'block', objectFit: 'cover' }} />
      <span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(0,0,0,0.9)', lineHeight: 1.25, display: 'block' }}>{label}</span>
        <span style={{ fontSize: 12.5, fontWeight: 400, color: 'rgba(0,0,0,0.6)', lineHeight: 1.25, marginTop: 1, display: 'block' }}>{sub}</span>
      </span>
    </span>
  );
}

// The hover mini-card that appears over a GitHub/X row (styles verbatim from
// the #agsf-hover rules in the userscript).
function PreviewHoverCard() {
  return (
    <div
      style={{
        width: '100%', maxWidth: 280, boxSizing: 'border-box',
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
        background: 'linear-gradient(180deg, #FFFCF4, #FFFDFA)',
        border: '1.5px solid #F5A623', borderRadius: 10,
        boxShadow: '0 6px 24px rgba(0,0,0,0.16), 0 0 0 1px rgba(245,166,35,0.08)',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        <img src={GH_LOGO} alt="" style={{ width: 16, height: 16, borderRadius: 4, display: 'block' }} />
        GitHub
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src={mockAvatar('#57606a', 'JL')} alt="" style={{ width: 44, height: 44, borderRadius: 6, display: 'block', objectFit: 'cover', flexShrink: 0 }} />
        <span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(0,0,0,0.9)', lineHeight: 1.25, display: 'block' }}>James Liounis</span>
          <span style={{ fontSize: 12.5, color: 'rgba(0,0,0,0.6)', lineHeight: 1.25, marginTop: 1, display: 'block' }}>jamesliounis</span>
        </span>
      </span>
      <span style={{ fontSize: 12.5, color: 'rgba(0,0,0,0.65)', lineHeight: 1.45 }}>42 repos · 310 followers · Boston, MA</span>
      <span style={{ fontSize: 12.5, color: 'rgba(0,0,0,0.75)', lineHeight: 1.45 }}>ML engineer. Building data tooling.</span>
    </div>
  );
}

function Preview() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <div style={cardStyle}>
        <PreviewHead />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', fontWeight: 600, fontSize: 14, color: 'rgba(0,0,0,0.8)', padding: '5px 16px', border: '1.5px solid #F5A623', borderRadius: 9999, background: '#fff' }}>
          Find socials
        </span>
      </div>
      <div style={cardStyle}>
        <PreviewHead />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 400, color: 'rgba(0,0,0,0.6)', padding: 2, lineHeight: 1.3 }}>
          <span style={{ width: 14, height: 14, flexShrink: 0, borderRadius: '50%', border: '2px solid rgba(245,166,35,0.35)', borderTopColor: '#F5A623', boxSizing: 'border-box' }} />
          <span>🔗 github.com</span>
        </span>
        <span style={{ fontSize: 11.5, color: 'rgba(0,0,0,0.4)', paddingLeft: 22 }}>3 searches · 6 sources · 12s</span>
      </div>
      <div style={cardStyle}>
        <PreviewHead />
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 36px' }}>
          <PreviewAccountRow icon={GH_LOGO} label="GitHub" sub="jamesliounis · 42 repos" />
          <PreviewAccountRow icon={X_LOGO} label="X" sub="@JamesLiounis_ · 1.2K followers" />
          <PreviewAccountRow icon={mockAvatar('#5b6b7b', '🌐')} label="Website" sub="jamesliounis.com" />
        </span>
        <span style={{ position: 'absolute', top: 14, right: 16, fontSize: 16, lineHeight: 1, color: 'rgba(0,0,0,0.35)' }}>↻</span>
      </div>
      <PreviewHoverCard />
      <p className="text-xs" style={{ color: 'var(--fg-tertiary)', margin: 0 }}>
        The widget renders as its own "Socials" section in the profile's main
        column, right below the top card (above Sales Navigator / About). While
        a lookup runs, the pill shows the current phase plus elapsed time
        (searches run server-side in one silent LLM call, so individual queries
        can't stream). The result rows then replace it (cached — shown
        automatically next visit) with GitHub / X brand icons; hovering a row
        opens the mini-card shown last: avatar, display name, handle, stats and
        bio from the account's public profile.
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
