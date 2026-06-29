import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppPage } from '@shared/components';

declare const airglow: any;

const appId =
  (window as any).__airglow_app_id ||
  new URLSearchParams(location.search).get('app') ||
  'customizable-x';

// The userscript and this page share the same airglow.storage key.
const LAYOUT_KEY = 'customizex-layout';
// Identity layout — each rail in its home stripe (visually stock X).
const DEFAULT_LAYOUT: Record<string, string> = {
  'nav-rail': 'stripe-left',
  'sidebar-rail': 'stripe-right',
};

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

function Preview() {
  // The entry point the app injects: an "Arrange" pill that floats at the
  // top-right of X, next to the search box.
  return (
    <div
      style={{
        background: '#16181c', height: 72, borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <button
        type="button"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          height: 44, minWidth: 78, padding: '0 14px',
          border: 'none', borderRadius: 9999,
          font: '600 13.5px/1 system-ui, -apple-system, "Segoe UI", sans-serif',
          color: '#fff', background: '#7856ff',
          boxShadow: '0 3px 12px rgba(120,86,255,.4)',
          cursor: 'default',
        }}
      >
        Arrange
      </button>
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

function describeLayout(layout: Record<string, string>): string {
  const nav = layout['nav-rail'] === 'stripe-right' ? 'right' : 'left';
  const side = layout['sidebar-rail'] === 'stripe-left' ? 'left' : 'right';
  if (nav === 'left' && side === 'right') return 'Default — nav on the left, sidebar on the right.';
  return `Swapped — nav on the ${nav}, sidebar on the ${side}.`;
}

function App() {
  const [layout, setLayout] = useState<Record<string, string>>(DEFAULT_LAYOUT);

  useEffect(() => {
    airglow.storage
      .get(LAYOUT_KEY)
      .then((v: any) => {
        if (v && typeof v === 'object') setLayout({ ...DEFAULT_LAYOUT, ...v });
      })
      .catch(() => {});
  }, []);

  function reset() {
    setLayout(DEFAULT_LAYOUT);
    airglow.storage.set(LAYOUT_KEY, DEFAULT_LAYOUT).catch(() => {});
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
              An <strong>Arrange</strong> button appears at the top-right of X
              (Twitter), next to the search box.
            </Bullet>
            <Bullet>
              Click it to enter arrange mode — the left navigation and the right
              sidebar get a dotted border to show they can be moved.
            </Bullet>
            <Bullet>
              Drag either stripe onto the other side to <strong>swap</strong> them.
              The timeline stays centered.
            </Bullet>
            <Bullet>
              Click <strong>Arrange</strong> again or press <kbd>Esc</kbd> to save.
              Your layout persists across reloads.
            </Bullet>
          </ul>
        </Section>
        <Section title="Current layout">
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 16, padding: '14px 16px', borderRadius: 10,
              border: '1px solid var(--border, rgba(255,255,255,.12))',
              fontSize: '0.875rem', color: 'var(--fg-secondary)',
            }}
          >
            <span>{describeLayout(layout)}</span>
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
              Reset layout
            </button>
          </div>
          <p style={{ margin: '10px 2px 0', fontSize: '0.8125rem', color: 'var(--fg-tertiary)' }}>
            Reset applies on the next page load (or the next paint on an open X tab).
          </p>
        </Section>
      </div>
    </AppPage>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
