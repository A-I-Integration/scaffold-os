// ============================================================
// SCAFFOLD OS – Vorhaltezeiträume atomar führen (nur Server, Faktura F8)
// Ruft vorhaltung_zuordnen (supabase/phase-127-…) auf: Projekt gesperrt, Überschneidung geprüft, genau ein Zeitraum geändert.
// ============================================================

export type VorhaltungAktion = 'reservieren' | 'abschliessen' | 'freigeben' | 'freigeben_rechnung'
export type VorhaltungErgebnis = 'ok' | 'ueberschneidung' | 'reserviert' | 'geaendert' | 'keine_reservierung' | 'nicht_gefunden' | 'projekt_fehlt' | 'rpc_fehler'

export async function vorhaltungZuordnen(a: {
  projectId: string; aktion: VorhaltungAktion; periode?: Record<string, unknown>; erwartetBis?: string | null; token?: string
  invoiceId?: string; invoiceNumber?: string
}): Promise<VorhaltungErgebnis> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return 'rpc_fehler'
    const res = await fetch(`${url}/rest/v1/rpc/vorhaltung_zuordnen`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        p_project: a.projectId, p_aktion: a.aktion, p_periode: a.periode ?? null, p_erwartet_bis: a.erwartetBis ?? null, p_token: a.token ?? null,
        p_invoice_id: a.invoiceId ?? null, p_invoice_number: a.invoiceNumber ?? null,
      }),
    })
    if (!res.ok) return 'rpc_fehler'
    const t = await res.json()
    return (['ok', 'ueberschneidung', 'reserviert', 'geaendert', 'keine_reservierung', 'nicht_gefunden', 'projekt_fehlt'] as string[]).includes(t) ? (t as VorhaltungErgebnis) : 'rpc_fehler'
  } catch { return 'rpc_fehler' }
}

export function vorhaltungFehlerText(e: VorhaltungErgebnis): { status: number; code: string; text: string } {
  switch (e) {
    case 'ueberschneidung': return { status: 409, code: 'VORHALTUNG_BEREITS_BERECHNET', text: 'Dieser Zeitraum ist bereits berechnet (vielleicht gerade von jemand anderem). Es wird nicht doppelt berechnet. Bitte neu laden.' }
    case 'reserviert': return { status: 409, code: 'VORHALTUNG_IN_BEARBEITUNG', text: 'Dieser Zeitraum wird gerade von jemand anderem abgerechnet. Bitte kurz warten und neu laden.' }
    case 'geaendert': return { status: 409, code: 'VORHALTUNG_GEAENDERT', text: 'Die berechneten Zeiträume haben sich gerade geändert. Bitte neu laden.' }
    default: return { status: 503, code: 'VORHALTUNG_SPERRE_NICHT_MOEGLICH', text: 'Die Absicherung gegen Doppelabrechnung ist nicht erreichbar (Datenbank-Migration phase-127 ausgeführt?). Die Rechnung wurde NICHT angelegt.' }
  }
}
