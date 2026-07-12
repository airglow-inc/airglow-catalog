// Shared per-site gate. Two storage keys decide whether a site's blocking runs:
//   focus_mode_sites  — JSON string of permanent on/off flags (site key → boolean)
//   focus_mode_snooze — object of temporary pauses (site key → epoch-ms expiry)
// 'snoozed' pauses blocking for the current page load; an expired pause counts
// as 'on' again, so blocking resumes on the next navigation/reload.
// Everything is opt-in: a site blocks only when its flag is explicitly true,
// so a fresh install (no stored flags) does nothing.

export type GateState = 'on' | 'snoozed' | 'off';

export async function siteGate(key: string): Promise<GateState> {
  let sitesVal: string | undefined;
  let snoozeVal: Record<string, number> | undefined;
  try {
    [sitesVal, snoozeVal] = await Promise.all([
      airglow.storage.get<string>('focus_mode_sites'),
      airglow.storage.get<Record<string, number>>('focus_mode_snooze'),
    ]);
  } catch {
    return 'off';
  }
  try {
    if (!sitesVal || JSON.parse(sitesVal)[key] !== true) return 'off';
  } catch {
    return 'off';
  }
  const until = snoozeVal?.[key];
  if (typeof until === 'number' && Date.now() < until) return 'snoozed';
  return 'on';
}
