import { type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppPage } from '@shared/components';

const appId =
  (window as any).__airglow_app_id ||
  new URLSearchParams(location.search).get('app') ||
  'cinematic-x';

// NOTE: the shared AppPage's Tailwind layout classes (p-8, max-w-6xl, …) don't
// get generated in an app's own CSS build, so its padding renders as 0 and the
// content sits flush-left. The dashboard shell's header uses px-8 (32px), so we
// match that here with inline padding to keep the page aligned. Layout uses
// inline styles throughout (utility-class generation is unreliable in the app
// bundle); only theme tokens (var(--…)) are relied on.

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
  // The entry point the app injects: a blue "Cinema" pill, styled verbatim
  // from the userscript (#airglow-cine-btn), on a dark tile evoking X's top
  // bar where it floats (top-right, next to the search box).
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
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          height: 44, minWidth: 96, padding: '0 18px',
          border: 'none', borderRadius: 9999,
          font: '600 14px/1 system-ui, -apple-system, "Segoe UI", sans-serif',
          color: '#fff', background: '#4a90e2',
          boxShadow: '0 4px 18px rgba(74,144,226,.45)',
          cursor: 'default',
        }}
      >
        Cinema
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

function App() {
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
              A floating <strong>Cinema</strong> button appears at the top-right of
              X (Twitter), next to the search box.
            </Bullet>
            <Bullet>
              Toggling it on blacks out the left navigation and the right sidebar,
              and centers the timeline so only the posts remain.
            </Bullet>
            <Bullet>
              The For you / Following tab bar and the “What’s happening” composer
              are hidden in this mode.
            </Bullet>
            <Bullet>
              Everything animates smoothly. Press the button again or hit{' '}
              <kbd>Esc</kbd> to exit.
            </Bullet>
          </ul>
        </Section>
      </div>
    </AppPage>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
