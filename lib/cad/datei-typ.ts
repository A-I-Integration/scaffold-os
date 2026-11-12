// ============================================================
// SCAFFOLD OS – Was ist diese Datei? Typ aus Dateiname und Plantext erkennen (Ablage im Projekt).
// Regeln statt KI: Stichworte im Dateinamen und im Schriftfeld. Bei Unsicherheit bleibt der Typ „unbekannt“ und die
// Person wählt; erkannt wird nur, was eindeutig ist. „Ansicht Ost“ / „Ansicht West“ liefert zusätzlich die Himmelsrichtung.
// ============================================================

import type { QuellTyp } from './projekt-fakten'

export type DateiArt = QuellTyp | 'lageplan' | 'unbekannt'
export interface DateiTypErgebnis {
  art: DateiArt
  /** Himmelsrichtung bei Ansichten (Ost, West, Nord, Süd), wenn im Titel genannt */
  richtung?: 'Ost' | 'West' | 'Nord' | 'Süd'
  /** hoch: Dateiname und Plantext sagen dasselbe; mittel: nur eines von beiden; niedrig: nur ein schwacher Hinweis */
  sicherheit: 'hoch' | 'mittel' | 'niedrig'
}

const REGELN: { art: Exclude<DateiArt, 'unbekannt' | 'manuell'>; re: RegExp }[] = [
  { art: 'schnitt', re: /\bschnitt\b/i },
  { art: 'ansicht', re: /\bansicht(en)?\b/i },
  { art: 'grundriss', re: /\bgrundriss(e)?\b|\b(erd|ober|dach|keller|unter)geschoss\b|\b\d\.\s*og\b/i },
  { art: 'lageplan', re: /\blageplan\b/i },
  { art: 'statik', re: /\bstatik\b|\bstandsicherheit\b|\bstatische\s+berechnung\b|\blastannahmen\b/i },
  { art: 'lv', re: /\bleistungsverzeichnis\b|\bausschreibung\b|\bLV\b|\bgaeb\b/i },
  { art: 'scan', re: /\bpunktwolke\b|\blaserscan\b|\blidar\b/i },
]

const RICHTUNG: Record<string, DateiTypErgebnis['richtung']> = { ost: 'Ost', west: 'West', nord: 'Nord', sued: 'Süd', süd: 'Süd' }

function art(text: string): Exclude<DateiArt, 'unbekannt' | 'manuell'> | null {
  const treffer = REGELN.filter((r) => r.re.test(text)).map((r) => r.art)
  // „Ansicht und Schnitt“ o. Ä.: mehrdeutig → nicht raten
  return treffer.length === 1 ? treffer[0] : null
}

/** @param plantext die Texte der ersten Plan-Seite (leer bei Bildern/Scans); nur der Anfang wird ausgewertet */
export function dateiTypErkennen(dateiname: string, plantext: string[] = []): DateiTypErgebnis {
  const name = dateiname.replace(/\.[a-z0-9]+$/i, '').replace(/[_\-.]+/g, ' ')
  if (/\.(ifc)$/i.test(dateiname)) return { art: 'scan', sicherheit: 'mittel' }
  if (/\.(ply|las|laz|e57|obj|stl|glb|gltf|nwd)$/i.test(dateiname)) return { art: 'scan', sicherheit: 'mittel' }
  const ausName = art(name)
  const ausText = art(plantext.slice(0, 80).join(' \n '))
  const gewaehlt = ausText ?? ausName
  if (!gewaehlt) return { art: 'unbekannt', sicherheit: 'niedrig' }
  const sicherheit: DateiTypErgebnis['sicherheit'] = ausName && ausText ? (ausName === ausText ? 'hoch' : 'niedrig') : 'mittel'
  if (ausName && ausText && ausName !== ausText) return { art: 'unbekannt', sicherheit: 'niedrig' }
  let richtung: DateiTypErgebnis['richtung']
  if (gewaehlt === 'ansicht') {
    const m = /\bansicht\s+(ost|west|nord|s(?:ü|ue)d)\b/i.exec(`${name} ${plantext.join(' ')}`.replace(/\s+/g, ' '))
    if (m) richtung = RICHTUNG[m[1].toLowerCase()]
  }
  return { art: gewaehlt, ...(richtung ? { richtung } : {}), sicherheit }
}
