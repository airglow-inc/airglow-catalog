import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppPage, SettingsSection, SettingField } from '@shared/components';

function Toggle({
  checked,
  onChange,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer"
      style={{ background: checked ? 'var(--olive)' : 'var(--border-secondary)' }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full transition-transform"
        style={{
          background: 'var(--bg-white)',
          transform: checked ? 'translateX(24px)' : 'translateX(4px)',
        }}
      />
    </button>
  );
}

function useBoolSetting(key: string, def: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(def);
  useEffect(() => {
    airglow.storage.get<boolean>(key).then((v) => {
      if (v !== undefined) setValue(v);
    });
  }, [key]);
  const update = (v: boolean) => {
    setValue(v);
    airglow.storage.set(key, v);
  };
  return [value, update];
}

// Static mock of a Google results page: the sponsored block shown struck-out
// (what the app removes), organic results untouched.
function PreviewMock() {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 340,
        background: '#fff',
        border: '1px solid #dadce0',
        borderRadius: 8,
        padding: 14,
        fontFamily: 'arial, sans-serif',
      }}
    >
      <div
        style={{
          border: '1px dashed #d93025',
          borderRadius: 6,
          padding: 10,
          marginBottom: 12,
          opacity: 0.55,
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: -9,
            right: 8,
            fontSize: 10,
            fontWeight: 700,
            color: '#fff',
            background: '#d93025',
            borderRadius: 4,
            padding: '1px 6px',
          }}
        >
          removed
        </span>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#5f6368', marginBottom: 2 }}>
          Sponsored
        </div>
        <div style={{ fontSize: 14, color: '#1a0dab', textDecoration: 'line-through' }}>
          Best Widgets 2026 — 50% Off Today Only
        </div>
        <div style={{ fontSize: 12, color: '#4d5156', textDecoration: 'line-through' }}>
          Shop the widest widget selection. Free shipping…
        </div>
      </div>
      {[
        ['Widget — Wikipedia', 'A widget is an element of a graphical user interface…'],
        ['What is a widget? Definition and examples', 'Widgets are small applications that…'],
      ].map(([title, snippet]) => (
        <div key={title} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#202124' }}>example.com</div>
          <div style={{ fontSize: 14, color: '#1a0dab' }}>{title}</div>
          <div style={{ fontSize: 12, color: '#4d5156' }}>{snippet}</div>
        </div>
      ))}
    </div>
  );
}

function App() {
  const [hideBottom, setHideBottom] = useBoolSetting('hideBottom', true);
  const [hideShopping, setHideShopping] = useBoolSetting('hideShopping', true);

  useEffect(() => {
    (window as any).__test = { setHideBottom, setHideShopping };
  }, []);

  return (
    <AppPage
      appId="google-search-ad-blocker"
      name="Google Search Ad Blocker"
      description="Remove sponsored results from Google Search."
      preview={<PreviewMock />}
    >
      <SettingsSection title="What to remove">
        <SettingField
          label="Top sponsored results"
          hint="Always removed — the reason this app exists."
        >
          <Toggle checked onChange={() => {}} testId="toggle-top" />
        </SettingField>
        <SettingField
          label="Bottom sponsored results"
          hint="Ads below the organic results. Applies on the next page load."
        >
          <Toggle checked={hideBottom} onChange={setHideBottom} testId="toggle-bottom" />
        </SettingField>
        <SettingField
          label="Shopping ads"
          hint="Sponsored product carousels and shopping units. Applies on the next page load."
        >
          <Toggle checked={hideShopping} onChange={setHideShopping} testId="toggle-shopping" />
        </SettingField>
      </SettingsSection>
    </AppPage>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
