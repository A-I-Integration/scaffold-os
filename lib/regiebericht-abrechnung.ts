// ============================================================
// SCAFFOLD OS – Regiebericht ↔ Rechnung (Paket 10)
// Ein Regiebericht gilt als abgerechnet, sobald er einer Rechnung zugeordnet ist (rechnung_id).
// Die Zuordnung geschieht serverseitig beim Anlegen der Rechnung und ist nur möglich, solange der Bericht noch frei ist.
// Wird eine nicht versendete Rechnung storniert, wird der Bericht wieder frei; eine neue Version übernimmt die Zuordnung.
// ============================================================

export interface RegieCfg { url: string; headers: Record<string, string> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bereinigeIds(roh: unknown): string[] {
  if (!Array.isArray(roh)) return [];
  return [...new Set(roh.filter((x): x is string => typeof x === 'string' && UUID.test(x)))].slice(0, 50);
}

/** Vor dem Anlegen der Rechnung: alle Berichte gehören zur Baustelle und sind noch frei. */
export async function pruefeRegieAuswahl(c: RegieCfg, ids: string[], projectId: string | null | undefined, positionen: { bezeichnung?: unknown }[] = []): Promise<{ ok: true; ungezeichnet: string[] } | { ok: false; status: number; code: string; fehler: string; ids?: string[] }> {
  if (!ids.length) return { ok: true, ungezeichnet: [] };
  if (!projectId) return { ok: false, status: 400, code: 'REGIE_OHNE_BAUSTELLE', fehler: 'Regieberichte lassen sich nur in eine Rechnung mit Baustelle übernehmen.' };
  const r = await fetch(`${c.url}/rest/v1/regieberichte?id=in.(${ids.join(',')})&select=id,nummer,project_id,status,rechnung_id,rechnung_nummer`, { headers: c.headers });
  if (!r.ok) return { ok: false, status: 503, code: 'REGIE_TABELLE_FEHLT', fehler: 'Die Regieberichte konnten nicht geprüft werden (SQL phase-143-regieberichte.sql ausführen?). Es wurde nichts angelegt.' };
  const rows = (await r.json()) as { id: string; nummer: string; project_id: string; status: string; rechnung_id: string | null; rechnung_nummer: string | null }[];
  if (rows.length !== ids.length) return { ok: false, status: 409, code: 'REGIE_NICHT_GEFUNDEN', fehler: 'Ein ausgewählter Regiebericht existiert nicht mehr. Bitte die Auswahl neu laden.' };
  const fremd = rows.find((x) => x.project_id !== projectId);
  if (fremd) return { ok: false, status: 409, code: 'REGIE_ANDERE_BAUSTELLE', fehler: `Der Regiebericht ${fremd.nummer} gehört zu einer anderen Baustelle.` };
  const schon = rows.find((x) => x.rechnung_id);
  if (schon) return { ok: false, status: 409, code: 'REGIE_BEREITS_ABGERECHNET', fehler: `Der Regiebericht ${schon.nummer} ist bereits abgerechnet${schon.rechnung_nummer ? ` (Rechnung ${schon.rechnung_nummer})` : ''}.` };
  // Nur Berichte, die wirklich auf der Rechnung stehen (ihre Nummer steht in einer Position), gelten danach als abgerechnet
  const fehlend = rows.filter((x) => !positionen.some((p) => String(p.bezeichnung ?? '').includes(x.nummer)));
  if (fehlend.length) return { ok: false, status: 409, code: 'REGIE_NICHT_IN_RECHNUNG', ids: fehlend.map((x) => x.id), fehler: `Der Regiebericht ${fehlend.map((x) => x.nummer).join(', ')} steht nicht (mehr) auf der Rechnung. Die Zuordnung wurde entfernt: bitte die Rechnung noch einmal anlegen oder die Positionen erneut übernehmen.` };
  return { ok: true, ungezeichnet: rows.filter((x) => x.status === 'entwurf' || x.status === 'versendet').map((x) => x.nummer) };
}

/** Nach dem Anlegen: Berichte der Rechnung zuordnen (nur noch freie). Gibt die Zahl der zugeordneten zurück. */
export async function ordneRegieZu(c: RegieCfg, ids: string[], rechnung: { id: string; invoice_number: string }): Promise<number> {
  if (!ids.length) return 0;
  const r = await fetch(`${c.url}/rest/v1/regieberichte?id=in.(${ids.join(',')})&rechnung_id=is.null`, {
    method: 'PATCH', headers: { ...c.headers, Prefer: 'return=representation' },
    body: JSON.stringify({ rechnung_id: rechnung.id, rechnung_nummer: rechnung.invoice_number, abgerechnet_am: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(await r.text());
  return ((await r.json()) as unknown[]).length;
}

/** Rechnung storniert (nicht versendet) → Berichte wieder frei. */
export async function gibRegieFrei(c: RegieCfg, rechnungId: string): Promise<number> {
  try {
    const r = await fetch(`${c.url}/rest/v1/regieberichte?rechnung_id=eq.${encodeURIComponent(rechnungId)}`, {
      method: 'PATCH', headers: { ...c.headers, Prefer: 'return=representation' },
      body: JSON.stringify({ rechnung_id: null, rechnung_nummer: null, abgerechnet_am: null, updated_at: new Date().toISOString() }),
    });
    return r.ok ? ((await r.json()) as unknown[]).length : 0;
  } catch { return 0; }
}

/** Neue Version einer Rechnung: Berichte zeigen künftig auf die neue Rechnung. */
export async function uebertrageRegie(c: RegieCfg, alteId: string, neu: { id: string; invoice_number: string }): Promise<void> {
  try {
    await fetch(`${c.url}/rest/v1/regieberichte?rechnung_id=eq.${encodeURIComponent(alteId)}`, {
      method: 'PATCH', headers: c.headers,
      body: JSON.stringify({ rechnung_id: neu.id, rechnung_nummer: neu.invoice_number, updated_at: new Date().toISOString() }),
    });
  } catch { /* Zuordnung bleibt bei der alten Rechnung: im Bericht sichtbar */ }
}
