import { createHash } from 'crypto'

// Archiv der strukturierten E-Rechnungs-Daten (XML im Originalformat, nur anfügen).
// Die Tabelle invoice_archive lässt keine Änderung und kein Löschen zu (Datenbank-Trigger, GoBD).
// Gleicher Inhalt wird nicht doppelt abgelegt (UNIQUE auf Rechnung, Format und Prüfsumme).

export type ArchivFormat = 'zugferd' | 'xrechnung'

export function xmlPruefsumme(xml: string): string {
  return createHash('sha256').update(xml, 'utf8').digest('hex')
}

/** Legt die XML im Archiv ab. Gibt true zurück, wenn sie archiviert ist (neu oder bereits identisch vorhanden). */
export async function archiviereXml(
  api: { url: string; headers: Record<string, string> },
  inv: { id: string; invoice_number: string },
  format: ArchivFormat,
  xml: string,
  userId?: string | null,
): Promise<boolean> {
  try {
    const res = await fetch(`${api.url}/rest/v1/invoice_archive?on_conflict=invoice_id,format,sha256`, {
      method: 'POST',
      headers: { ...api.headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ invoice_id: inv.id, invoice_number: inv.invoice_number, format, xml, sha256: xmlPruefsumme(xml), created_by: userId || null }),
    })
    return res.ok
  } catch {
    return false
  }
}
