// ============================================================
// SCAFFOLD OS – Änderungsverlauf der Abrechnung (Faktura F6, nur Server)
// Wer hat wann was an einer Rechnung/Abrechnung geändert, mit Grund. Best effort: ein Fehler beim Protokollieren darf den Vorgang
// nie rückwirkend verhindern (z. B. wenn die Tabelle noch fehlt).
// ============================================================

export type HistorieAktion =
  | 'rechnung_angelegt' | 'neue_version' | 'gutschrift_angelegt' | 'zahlung_geaendert' | 'status_geaendert' | 'storniert' | 'geloescht' | 'abweichung_freigegeben'
  | 'auftragswert_geaendert' | 'nachtrag_angelegt' | 'nachtrag_status' | 'nachtrag_betrag' | 'nachtrag_geloescht'

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

export const AKTION_LABEL: Record<HistorieAktion, string> = {
  rechnung_angelegt: 'Rechnung angelegt', neue_version: 'Neue Version angelegt', gutschrift_angelegt: 'Gutschrift angelegt',
  zahlung_geaendert: 'Zahlung geändert', status_geaendert: 'Status geändert', storniert: 'Storniert', geloescht: 'Gelöscht',
  abweichung_freigegeben: 'Abweichung freigegeben', auftragswert_geaendert: 'Auftragswert geändert',
  nachtrag_angelegt: 'Nachtrag angelegt', nachtrag_status: 'Nachtrag-Status geändert', nachtrag_betrag: 'Nachtrag-Betrag geändert', nachtrag_geloescht: 'Nachtrag gelöscht',
}

/** Kurzfassung der Änderung für Anzeige im Verlauf (von → auf). */
export function historieKurz(aktion: string, d: Record<string, any> | null): string {
  if (!d) return ''
  const eur = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '–')
  if (aktion === 'auftragswert_geaendert') return `${eur(d.von)} → ${eur(d.auf)}`
  if (aktion.startsWith('nachtrag_')) {
    const t = d.nachtrag?.titel ? `${d.nachtrag.titel}: ` : ''
    if (aktion === 'nachtrag_status') return `${t}${d.status?.von ?? '–'} → ${d.status?.auf ?? '–'}`
    if (aktion === 'nachtrag_betrag') return `${t}${eur(d.betrag?.von)} → ${eur(d.betrag?.auf)}`
    return `${t}${eur(d.betrag?.auf)}`
  }
  return ''
}
