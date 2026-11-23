// ============================================================
// SCAFFOLD OS – Änderungsverlauf der Abrechnung (Faktura F6, nur Server)
// Wer hat wann was an einer Rechnung/Abrechnung geändert, mit Grund. Best effort: ein Fehler beim Protokollieren darf den Vorgang
// nie rückwirkend verhindern (z. B. wenn die Tabelle noch fehlt).
// ============================================================

export type HistorieAktion =
  | 'rechnung_angelegt' | 'neue_version' | 'gutschrift_angelegt' | 'zahlung_geaendert' | 'status_geaendert' | 'storniert' | 'geloescht' | 'abweichung_freigegeben'

export interface HistorieEintrag {
  aktion: HistorieAktion
  invoiceId?: string | null
  invoiceNumber?: string | null
  projectId?: string | null
  userId?: string | null
  grund?: string | null
  details?: Record<string, unknown> | null
}

export function baueHistorieZeile(e: HistorieEintrag) {
  return {
    aktion: e.aktion,
    invoice_id: e.invoiceId || null,
    invoice_number: e.invoiceNumber ? String(e.invoiceNumber).slice(0, 60) : null,
    project_id: e.projectId || null,
    user_id: e.userId || null,
    grund: e.grund ? String(e.grund).trim().slice(0, 500) : null,
    details: e.details ?? null,
  }
}

export async function schreibeHistorie(e: HistorieEintrag): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return false
    const res = await fetch(`${url}/rest/v1/abrechnung_historie`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
      body: JSON.stringify(baueHistorieZeile(e)),
    })
    return res.ok
  } catch { return false }
}
