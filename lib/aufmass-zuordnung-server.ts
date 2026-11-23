// ============================================================
// SCAFFOLD OS – Zuordnung Zwischenaufmaß ↔ Rechnung, atomar in der Datenbank (nur Server)
// Ruft die Funktion aufmass_zuordnen (supabase/phase-126-…) auf, die das Projekt sperrt, prüft und genau ein Zwischenaufmaß ändert.
// ============================================================

export type ZuordnungAktion = 'reservieren' | 'abschliessen' | 'freigeben' | 'freigeben_rechnung' | 'ersetzen'
export type ZuordnungErgebnis = 'ok' | 'bereits_abgerechnet' | 'reserviert' | 'geaendert' | 'nicht_gefunden' | 'keine_reservierung' | 'projekt_fehlt' | 'rpc_fehler'

export async function aufmassZuordnen(a: {
  projectId: string; zaId?: string; aktion: ZuordnungAktion; erwartet?: unknown; token?: string
  invoiceId?: string; invoiceNumber?: string; neuInvoiceId?: string
}): Promise<ZuordnungErgebnis> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return 'rpc_fehler'
    const res = await fetch(`${url}/rest/v1/rpc/aufmass_zuordnen`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        p_project: a.projectId, p_za_id: a.zaId ?? '', p_aktion: a.aktion, p_erwartet: a.erwartet ?? null, p_token: a.token ?? null,
        p_invoice_id: a.invoiceId ?? null, p_invoice_number: a.invoiceNumber ?? null, p_neu_invoice_id: a.neuInvoiceId ?? null,
        p_heute: new Date().toISOString().slice(0, 10),
      }),
    })
    if (!res.ok) return 'rpc_fehler'
    const t = await res.json()
    return (['ok', 'bereits_abgerechnet', 'reserviert', 'geaendert', 'nicht_gefunden', 'keine_reservierung', 'projekt_fehlt'] as string[]).includes(t) ? (t as ZuordnungErgebnis) : 'rpc_fehler'
  } catch { return 'rpc_fehler' }
}

/** Meldung für den Benutzer, wenn die Reservierung nicht klappt. */
export function reservierungFehlerText(e: ZuordnungErgebnis): { status: number; code: string; text: string } {
  switch (e) {
    case 'bereits_abgerechnet': return { status: 409, code: 'AUFMASS_BEREITS_ABGERECHNET', text: 'Dieses Zwischenaufmaß ist bereits abgerechnet (vielleicht gerade von jemand anderem). Es wird nicht doppelt berechnet. Bitte die Seite neu laden.' }
    case 'reserviert': return { status: 409, code: 'AUFMASS_IN_BEARBEITUNG', text: 'Dieses Zwischenaufmaß wird gerade von jemand anderem abgerechnet. Bitte kurz warten und die Seite neu laden.' }
    case 'geaendert': return { status: 409, code: 'AUFMASS_GEAENDERT', text: 'Das Zwischenaufmaß wurde gerade geändert. Bitte den Dialog schließen und neu öffnen.' }
    case 'nicht_gefunden': return { status: 409, code: 'AUFMASS_NICHT_GEFUNDEN', text: 'Das Zwischenaufmaß gibt es nicht mehr. Bitte die Seite neu laden.' }
    default: return { status: 503, code: 'AUFMASS_SPERRE_NICHT_MOEGLICH', text: 'Die Absicherung gegen Doppelabrechnung ist nicht erreichbar (Datenbank-Migration phase-126 ausgeführt?). Die Rechnung wurde NICHT angelegt.' }
  }
}
