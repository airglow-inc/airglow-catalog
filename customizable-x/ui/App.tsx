import { type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppPage } from '@shared/components';

declare const airglow: any;

const appId =
  (window as any).__airglow_app_id ||
  new URLSearchParams(location.search).get('app') ||
  'customizable-x';

// The userscript and this page share this airglow.storage key.
const ORDER_KEY = 'customizex-order';

// NOTE: the shared AppPage's Tailwind layout classes (p-8, max-w-6xl, …) don't
// get generated in an app's own CSS build, so its padding renders as 0. We use
// inline styles throughout and rely only on theme tokens (var(--…)). See the
// matching note in cinematic-x/ui/App.tsx.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: '1.125rem', lineHeight: 1.35, fontWeight: 600, margin: '0 0 16px', color: 'var(--fg-primary)' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

// The entry point the app injects, styled verbatim from the userscript: a small
// indigo "Arrange" pill (with a grip glyph) that sits by X's search box.
function Preview() {
  return (
    <div
      style={{
        background: '#16181c', height: 72, borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          height: 44, padding: '0 16px', borderRadius: 9999,
          font: '600 13.5px/1 -apple-system, system-ui, "Segoe UI", sans-serif',
          color: '#fff', background: '#6366f1', boxShadow: '0 3px 12px rgba(99,102,241,.4)',
        }}
      >
        <svg viewBox="0 0 24 24" width={15} height={15} fill="currentColor" aria-hidden>
          <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
        </svg>
        Arrange
      </span>
    </div>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li style={{ display: 'flex', gap: 8 }}>
      <span aria-hidden style={{ color: 'var(--fg-tertiary)' }}>•</span>
      <span>{children}</span>
    </li>
  );
}

function App() {
  function reset() {
    airglow.storage.set(ORDER_KEY, { nav: [], sidebar: [] }).catch(() => {});
  }

  return (
    <AppPage appId={appId}>
      <div style={{ padding: '20px 32px 32px' }}>
        <Section title="What it looks like">
          <Preview />
        </Section>
        <Section title="How it works">
          <ul
            style={{
              listStyle: 'none', margin: 0, padding: 0,
              display: 'flex', flexDirection: 'column', gap: 10,
              fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--fg-secondary)',
            }}
          >
            <Bullet>
              An <strong>Arrange</strong> button sits by X's search box, top-right.
              Click it to start arranging.
            </Bullet>
            <Bullet>
              Reorder the <strong>left menu</strong> — drag Home, Explore,
              Notifications and the rest into whatever order you read in.
            </Bullet>
            <Bullet>
              Reorder the <strong>right sidebar</strong> — move Search, Subscribe to
              Premium, What's happening and Who to follow up or down.
            </Bullet>
            <Bullet>
              Items slide to make room as you drag. Click <strong>Arrange</strong>{' '}
              again or press <kbd>Esc</kbd> to finish — your order sticks across reloads.
            </Bullet>
          </ul>
        </Section>
        <Section title="Reset">
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 16, padding: '14px 16px', borderRadius: 10,
              border: '1px solid var(--border, rgba(255,255,255,.12))',
              fontSize: '0.875rem', color: 'var(--fg-secondary)',
            }}
          >
            <span>Put both lists back in X's original order.</span>
            <button
              type="button"
              onClick={reset}
              style={{
                flexShrink: 0, height: 34, padding: '0 14px',
                border: '1px solid var(--border, rgba(255,255,255,.2))', borderRadius: 8,
                background: 'transparent', color: 'var(--fg-primary)',
                font: '600 13px/1 system-ui, sans-serif', cursor: 'pointer',
              }}
            >
              Reset order
            </button>
          </div>
          <p style={{ margin: '10px 2px 0', fontSize: '0.8125rem', color: 'var(--fg-tertiary)' }}>
            Takes effect on the next page load (or the next paint on an open X tab).
          </p>
        </Section>
      </div>
    </AppPage>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
