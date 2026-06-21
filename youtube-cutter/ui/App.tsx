import { type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppPage } from '@shared/components';

const appId =
  (window as any).__airglow_app_id ||
  new URLSearchParams(location.search).get('app') ||
  'youtube-cutter';

// Inline styles throughout + 32px padding to match the dashboard shell header
// (the @shared AppPage's Tailwind layout classes don't get generated in an
// app's own CSS build). Plain cream sections; only the preview tile stands out.

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

const SCISSORS = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
);

function Preview() {
  // The entry point (the "✂ Cut" pill in the action row) + how it looks in
  // action: a floating range control above YouTube's own progress bar, with two
  // handles marking the kept fragment. Mirrors the real injected UI.
  return (
    <div style={{ background: '#181818', borderRadius: 10, padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
      <button
        type="button"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 36, padding: '0 14px', border: 'none', borderRadius: 18,
          background: 'rgba(255,255,255,0.12)', color: '#f1f1f1',
          font: '500 14px/1 "Roboto", system-ui, sans-serif', cursor: 'default',
        }}
      >
        {SCISSORS}
        <span>Cut</span>
      </button>

      {/* floating range control */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '7px 9px 7px 12px', borderRadius: 9, background: 'rgba(18,18,20,0.94)', color: '#f1f1f1', font: '12.5px/1 "Roboto", system-ui, sans-serif', boxShadow: '0 4px 18px rgba(0,0,0,0.5)' }}>
        <span>✂ <b>0:17</b><span style={{ color: '#888', margin: '0 3px' }}>–</span><b>0:32</b> <span style={{ color: '#888' }}>(0:15)</span></span>
        <span style={{ height: 26, padding: '0 12px', borderRadius: 13, background: '#3ea6ff', color: '#0f0f0f', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>Download MP4</span>
      </div>

      {/* on YouTube's own progress bar */}
      <div style={{ position: 'relative', width: '92%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.25)' }}>
        <div style={{ position: 'absolute', left: 0, width: '28%', top: 0, bottom: 0, background: '#ff0033', borderRadius: 3 }} />
        <div style={{ position: 'absolute', left: '28%', width: '34%', top: -2, bottom: -2, background: 'rgba(62,166,255,0.5)', borderLeft: '2px solid #3ea6ff', borderRight: '2px solid #3ea6ff', boxSizing: 'border-box' }} />
        {['28%', '62%'].map((l) => (
          <div key={l} style={{ position: 'absolute', left: l, top: '50%', width: 15, height: 15, borderRadius: '50%', background: '#fff', border: '3px solid #3ea6ff', transform: 'translate(-50%,-50%)', boxShadow: '0 1px 5px rgba(0,0,0,0.7)' }} />
        ))}
      </div>
      <div style={{ color: '#aaa', fontSize: 12 }}>Drag the handles on the video's own timeline</div>
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
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--fg-secondary)' }}>
            <Bullet>A <strong>✂ Cut</strong> button appears in the action row under any YouTube video (next to Like / Share).</Bullet>
            <Bullet>Click it: two handles appear right on the video's <strong>own progress bar</strong>. Drag them to set the <strong>start</strong> and <strong>end</strong> — the kept range is highlighted, and dragging seeks the video so you see the frame.</Bullet>
            <Bullet>A small floating control shows the range — hit <strong>Download MP4</strong> and just that fragment is saved to your <strong>Downloads</strong> folder.</Bullet>
            <Bullet>Keep clips reasonably short — very long ranges can hit a 2-minute processing limit.</Bullet>
          </ul>
        </Section>

        <Section title="Requirements">
          <div style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--fg-secondary)' }}>
            <p style={{ margin: '0 0 8px' }}>
              Downloading needs two free command-line tools on your machine:
              {' '}<strong>yt-dlp</strong> and <strong>ffmpeg</strong>. Install both once:
            </p>
            <pre style={{ margin: '0 0 10px', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--fg-primary)', fontSize: 13, overflowX: 'auto' }}>brew install yt-dlp ffmpeg</pre>
            <p style={{ margin: 0, color: 'var(--fg-tertiary)', fontSize: '0.8125rem' }}>
              Clips are saved to <code>~/Downloads</code>. For personal use — please respect content creators' rights.
            </p>
          </div>
        </Section>
      </div>
    </AppPage>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
