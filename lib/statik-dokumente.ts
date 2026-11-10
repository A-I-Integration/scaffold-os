// ============================================================
// SCAFFOLD OS – Statik-Dokumente: Regeln (rein, ohne DB)
//
// Unterlagen zwischen Büro und Statiker (Entwurf/Bestand vom Bauherrn hin, Pläne/Berechnung/Bescheinigung zurück) und die
// Freigabe-Schritte je Projekt. SCAFFOLD OS liest die Dateien NICHT aus und rechnet nichts: es legt sie ab und zeigt den Stand.
//
// Frist: Ausführungspläne spätestens 10 Werktage vor Montagebeginn einreichen. Als Werktag zählen hier Montag–Freitag
// (vorsichtig: früher gewarnt als bei Mo–Sa). Feiertage sind nicht berücksichtigt.
// ============================================================

export const DOKUMENT_ARTEN = [
  { id: 'entwurfsplan', text: 'Entwurfszeichnung (Bauherr)' },
  { id: 'entwurfsstatik', text: 'Entwurfsstatik (Bauherr)' },
  { id: 'bestandsplan', text: 'Bestandsplan' },
  { id: 'ausfuehrungsplan', text: 'Ausführungsplan' },
  { id: 'berechnung', text: 'Statische Berechnung' },
  { id: 'montageanweisung', text: 'Montageanweisung' },
  { id: 'konformitaet', text: 'Konformitätsprüfung' },
  { id: 'bescheinigung', text: 'Bescheinigung der Standfestigkeit' },
  { id: 'verankerungsprotokoll', text: 'Verankerungsprotokoll' },
  { id: 'sonstiges', text: 'Sonstiges' },
] as const
export type DokumentArt = (typeof DOKUMENT_ARTEN)[number]['id']
export const ART_IDS = DOKUMENT_ARTEN.map((a) => a.id) as [DokumentArt, ...DokumentArt[]]

export const ERLAUBTE_ENDUNGEN = ['pdf', 'ifc', 'dwg', 'dxf', 'png', 'jpg', 'jpeg', 'xlsx', 'xls', 'docx', 'doc', 'csv', 'zip'] as const
export const MAX_DATEI_BYTES = 50 * 1024 * 1024

export type Absender = 'buero' | 'statiker'

export const SCHRITTE = [
  { id: 'eingereicht', spalte: 'eingereicht_am', text: 'Pläne eingereicht' },
  { id: 'freigegeben', spalte: 'freigegeben_am', text: 'Pläne freigegeben' },
  { id: 'konformitaet', spalte: 'konformitaet_am', text: 'Konformitätsprüfung erfolgt' },
  { id: 'bescheinigung', spalte: 'bescheinigung_am', text: 'Standfestigkeit bescheinigt' },
] as const
export type SchrittId = (typeof SCHRITTE)[number]['id']
export type StatusFeld = SchrittId | 'montagebeginn'

/** Wer darf welchen Schritt setzen: Büro alles, Statiker nur Konformitätsprüfung und Bescheinigung. */
export function darfSchrittSetzen(absender: Absender, feld: StatusFeld): boolean {
  if (absender === 'buero') return true
  return feld === 'konformitaet' || feld === 'bescheinigung'
}

export function endung(dateiname: string): string {
  const m = /\.([A-Za-z0-9]{1,6})$/.exec(dateiname.trim())
  return m ? m[1].toLowerCase() : ''
}
export function dateiErlaubt(dateiname: string): boolean {
  return (ERLAUBTE_ENDUNGEN as readonly string[]).includes(endung(dateiname))
}
/** Anzeigename: ohne Pfad und Steuerzeichen, höchstens 200 Zeichen. */
export function sauberDateiname(name: string): string {
  const ohnePfad = name.split(/[\\/]/).pop() ?? ''
  const s = ohnePfad.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return (s || 'Datei').slice(-200)
}
export function speicherPfadOk(projectId: string, pfad: string): boolean {
  return new RegExp(`^projects/${projectId}/statik/[A-Za-z0-9_.-]{1,120}$`).test(pfad) && !pfad.includes('..') && dateiErlaubt(pfad)
}

const tag = (iso: string) => { const d = new Date(iso + 'T12:00:00Z'); return Number.isNaN(d.getTime()) ? null : d }
const istWerktag = (d: Date) => { const w = d.getUTCDay(); return w !== 0 && w !== 6 }

/** Datum, n Werktage (Mo–Fr) vor `ziel`. */
export function werktageVor(ziel: string, n: number): string | null {
  const d = tag(ziel)
  if (!d) return null
  let rest = n
  while (rest > 0) { d.setUTCDate(d.getUTCDate() - 1); if (istWerktag(d)) rest-- }
  return d.toISOString().slice(0, 10)
}

export const FRIST_WERKTAGE = 10

export interface StatusZeile {
  montagebeginn?: string | null
  eingereicht_am?: string | null
  freigegeben_am?: string | null
  konformitaet_am?: string | null
  bescheinigung_am?: string | null
}
export interface Hinweis { stufe: 'rot' | 'gelb' | 'gruen' | 'grau'; text: string }

const de = (iso: string) => { const d = tag(iso); return d ? d.toLocaleDateString('de-DE', { timeZone: 'UTC' }) : iso }

/** Fristhinweis für die Anzeige. `heute` im Format JJJJ-MM-TT. */
export function fristHinweis(s: StatusZeile | null | undefined, heute: string): Hinweis {
  const z = s ?? {}
  if (!z.montagebeginn) return { stufe: 'grau', text: 'Montagebeginn eintragen, dann wird die Einreichfrist für die Pläne berechnet.' }
  const spaetestens = werktageVor(z.montagebeginn, FRIST_WERKTAGE)
  if (z.freigegeben_am) return { stufe: 'gruen', text: `Pläne freigegeben am ${de(z.freigegeben_am)}.` }
  if (z.montagebeginn <= heute) return { stufe: 'rot', text: `Montagebeginn war ${de(z.montagebeginn)}, aber die Pläne sind nicht als freigegeben eingetragen. Ohne genehmigte Pläne nicht montieren.` }
  if (z.eingereicht_am) return { stufe: 'gelb', text: `Pläne eingereicht am ${de(z.eingereicht_am)}, Freigabe steht aus (Montagebeginn ${de(z.montagebeginn)}).` }
  if (spaetestens && heute > spaetestens) return { stufe: 'rot', text: `Pläne hätten bis ${de(spaetestens)} eingereicht werden müssen (${FRIST_WERKTAGE} Werktage vor Montagebeginn ${de(z.montagebeginn)}).` }
  return { stufe: 'gelb', text: `Pläne spätestens bis ${de(spaetestens ?? z.montagebeginn)} einreichen (${FRIST_WERKTAGE} Werktage vor Montagebeginn ${de(z.montagebeginn)}).` }
}
