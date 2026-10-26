// Anhänge an Rechnungen (Bilder, PDFs, Excel, E-Mails): Prüfung von Name, Typ und Größe, Speicherpfad.
// Der Dateityp wird aus der Endung bestimmt, nicht vom Browser übernommen – so lässt sich kein HTML/Script als „Bild“ ablegen.

export const ANHANG_BUCKET = 'invoice-attachments'
export const MAX_BYTES = 10 * 1024 * 1024
export const MAX_ANHAENGE = 20

export const ERLAUBTE_TYPEN: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  eml: 'message/rfc822',
  msg: 'application/vnd.ms-outlook',
  txt: 'text/plain',
}

export function endung(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function istBild(mime: string): boolean { return mime.startsWith('image/') }

export function sichererName(name: string): string {
  const roh = name.replace(/^.*[\\/]/, '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  const e = endung(roh)
  const basis = (e ? roh.slice(0, roh.length - e.length - 1) : roh).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 80) || 'datei'
  return e ? `${basis}.${e}` : basis
}

export type AnhangPruefung = { ok: true; name: string; mime: string } | { ok: false; fehler: string }

export function pruefeAnhang(datei: { name?: unknown; size?: unknown }): AnhangPruefung {
  const name = typeof datei.name === 'string' ? datei.name.trim() : ''
  if (!name) return { ok: false, fehler: 'Dateiname fehlt.' }
  const mime = ERLAUBTE_TYPEN[endung(name)]
  if (!mime) return { ok: false, fehler: 'Dateityp nicht erlaubt. Erlaubt: Bilder (JPG, PNG, WebP), PDF, Excel, Word, CSV, TXT und E-Mails (EML, MSG).' }
  const size = Number(datei.size)
  if (!Number.isFinite(size) || size <= 0) return { ok: false, fehler: 'Datei ist leer.' }
  if (size > MAX_BYTES) return { ok: false, fehler: `Datei ist zu groß (max. ${MAX_BYTES / 1024 / 1024} MB).` }
  return { ok: true, name: name.slice(0, 200), mime }
}

export function anhangPfad(invoiceId: string, anhangId: string, name: string): string {
  return `${invoiceId}/${anhangId}-${sichererName(name)}`
}

export function groesseText(bytes: number): string {
  if (!(bytes > 0)) return '–'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
}
