// ============================================================
// SCAFFOLD OS – UptimeRobot-Monitoring (Sprint 1, Automatisierung)
//
// Legt für jede neue Kundeninstanz automatisch einen Uptime-Monitor
// an (Alarm an die in UptimeRobot hinterlegte E-Mail) und entfernt
// ihn beim Löschen der Instanz wieder.
//
// Braucht Env-Var auf der MASTER-Instanz:
//   UPTIMEROBOT_API_KEY  (My Settings → API Settings → Main API Key)
//
// Monitoring ist bewusst OPTIONAL: Ohne Key passiert nichts, die
// Provisionierung läuft trotzdem durch.
// ============================================================

const API = 'https://api.uptimerobot.com/v2';

function apiKey(): string | null {
  return process.env.UPTIMEROBOT_API_KEY || null;
}

async function call(endpoint: string, params: Record<string, string>): Promise<any> {
  const key = apiKey();
  if (!key) return null;
  const body = new URLSearchParams({ api_key: key, format: 'json', ...params });
  const res = await fetch(`${API}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`UptimeRobot ${endpoint}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.stat !== 'ok') throw new Error(`UptimeRobot ${endpoint}: ${JSON.stringify(json)}`);
  return json;
}

// ─── Monitor anlegen (beim Provisionieren) ───
export async function createUptimeMonitor(subdomain: string, label: string): Promise<void> {
  if (!apiKey()) return; // Key fehlt → Monitoring überspringen
  const url = `https://${subdomain}`;
  try {
    await call('newMonitor', {
      friendly_name: `SCAFFOLD OS – ${label}`,
      url,
      type: '1', // HTTP(s)
      interval: '300', // alle 5 Minuten prüfen
    });
  } catch (err: any) {
    // „Monitor existiert bereits" (Resume) ist kein Fehler
    if (/already exists/i.test(err.message)) return;
    throw err;
  }
}

// ─── Monitor entfernen (beim Löschen der Instanz) ───
// Sucht per URL (keine Monitor-ID nötig – nichts muss gespeichert werden)
export async function deleteUptimeMonitor(subdomain: string): Promise<void> {
  if (!apiKey()) return;
  const url = `https://${subdomain}`;
  const list = await call('getMonitors', { search: subdomain });
  const treffer = (list?.monitors || []).filter((m: any) => m.url === url);
  for (const m of treffer) {
    await call('deleteMonitor', { id: String(m.id) });
  }
}
