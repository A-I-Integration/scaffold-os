// Prüfprotokoll für Arbeits- und Schutzgerüste mit Checkliste (ausfüllbar, Ablage in der Baustellenmappe).
// Die Prüfpunkte sind eine Arbeitsvorlage; die prüfende (befähigte) Person trägt das tatsächliche Ergebnis ein
// und verantwortet es. Die App gibt keine Grenzwerte vor und bewertet nichts fachlich – kein KI-Gutachten.

export type Antwort = 'ja' | 'nein' | 'nz'
export const ANTWORT_LABEL: Record<Antwort, string> = { ja: 'ja', nein: 'nein', nz: 'nicht zutreffend' }

export const BAUARTEN = [
  { gruppe: 'Arbeitsgerüst', werte: ['Fassadengerüst', 'Raumgerüst', 'Fahrgerüst'] },
  { gruppe: 'Schutzgerüst', werte: ['Fanggerüst', 'Dachfanggerüst', 'Schutzdach', 'Treppenturm'] },
] as const
export const LASTKLASSEN = ['2', '3', '4'] as const
export const LASTKLASSE_KN: Record<string, string> = { '2': '1,5', '3': '2,0', '4': '3,0' }
export const BREITENKLASSEN = ['W06', 'W09'] as const

export interface Pruefpunkt { key: string; gruppe: string; label: string }
export const PRUEFPUNKTE: Pruefpunkt[] = [
  { key: 'bauteile', gruppe: 'Gerüstbauteile', label: 'augenscheinlich unbeschädigt' },
  { key: 'aufstand', gruppe: 'Standsicherheit', label: 'Tragfähigkeit der Aufstandsfläche' },
  { key: 'spindel', gruppe: 'Standsicherheit', label: 'Fußspindel – Auszugslänge' },
  { key: 'diagonalen', gruppe: 'Standsicherheit', label: 'Verstrebungen / Diagonalen' },
  { key: 'laengsriegel', gruppe: 'Standsicherheit', label: 'Längsriegel in Fußpunkthöhe' },
  { key: 'gitter', gruppe: 'Standsicherheit', label: 'Gitterträger – Aussteifungen' },
  { key: 'verankerung', gruppe: 'Standsicherheit', label: 'Verankerungen nach Montageanweisung / Aufbau- und Verwendungsanleitung' },
  { key: 'lagen', gruppe: 'Beläge', label: 'Gerüstlagen voll ausgelegt, Belagsicherung' },
  { key: 'systembelaege', gruppe: 'Beläge', label: 'Systembeläge einschließlich Konsolenbelag' },
  { key: 'ecke', gruppe: 'Beläge', label: 'Eckausbildung in voller Breite herumgeführt' },
  { key: 'bohlen', gruppe: 'Beläge', label: 'Gerüstbohlen – Querschnitt, Auflagerung' },
  { key: 'oeffnungen', gruppe: 'Beläge', label: 'Öffnungen zwischen den Belägen' },
  { key: 'seitenschutz', gruppe: 'Arbeits- und Betriebssicherheit', label: 'Seitenschutz einschließlich Stirnseitenschutz' },
  { key: 'wandabstand', gruppe: 'Arbeits- und Betriebssicherheit', label: 'Wandabstand ≤ 30 cm' },
  { key: 'innenschutz', gruppe: 'Arbeits- und Betriebssicherheit', label: 'innenliegender Seitenschutz' },
  { key: 'aufstiege', gruppe: 'Arbeits- und Betriebssicherheit', label: 'Aufstiege, Zugänge – Abstand ≤ 50 m' },
  { key: 'treppe', gruppe: 'Arbeits- und Betriebssicherheit', label: 'Treppenturm, Gerüsttreppe' },
  { key: 'leiter', gruppe: 'Arbeits- und Betriebssicherheit', label: 'Anlegeleiter ≤ 5 m, Leitergang' },
  { key: 'schutzwand', gruppe: 'Arbeits- und Betriebssicherheit', label: 'Schutzwand' },
  { key: 'schutzdach', gruppe: 'Arbeits- und Betriebssicherheit', label: 'Schutzdach' },
  { key: 'verkehr', gruppe: 'Arbeits- und Betriebssicherheit', label: 'Verkehrssicherung – Beleuchtung' },
  { key: 'rollen', gruppe: 'Fahrgerüste', label: 'Fahrrollen' },
  { key: 'ballast', gruppe: 'Fahrgerüste', label: 'Ballast / Verbreiterungen' },
  { key: 'kennzeichnung', gruppe: 'Kennzeichnung', label: 'Gerüstkennzeichnung an den Zugängen' },
  { key: 'sperrung', gruppe: 'Sperrung', label: 'Nicht fertig gestellte Bereiche abgegrenzt, Verbotszeichen „Zutritt verboten“ angebracht' },
]

export interface Geruestpruefung {
  pruefdatum: string            // YYYY-MM-DD
  bauart: string[]              // mehrere möglich
  sonderGeruest: string
  lastklasse: string            // '2' | '3' | '4' | 'eigene'
  lastEigen: string             // kN/m² bei eigener Lastklasse
  breitenklasse: string         // 'W06' | 'W09' | 'eigene'
  breiteEigen: string
  nutzungsbeschraenkung: string
  bekleidung: { netze: boolean; planen: boolean }
  verankerungsprotokoll: '' | 'erstellt' | 'nicht_notwendig'
  antworten: Record<string, Antwort | undefined>
  bemerkungen: string
  auftraggeber: string
  pruefer: string               // Name der befähigten Person
  unterschrift?: string         // PNG-Data-URL der befähigten Person
  unterschriftAuftraggeber?: string
}

export const leerePruefung = (heute: string): Geruestpruefung => ({
  pruefdatum: heute, bauart: [], sonderGeruest: '', lastklasse: '', lastEigen: '', breitenklasse: '', breiteEigen: '',
  nutzungsbeschraenkung: '', bekleidung: { netze: false, planen: false }, verankerungsprotokoll: '', antworten: {},
  bemerkungen: '', auftraggeber: '', pruefer: '',
})

/** Lastklasse als Text, z. B. „Lastklasse 3 (2,0 kN/m²)“. */
export function lastklasseText(p: Pick<Geruestpruefung, 'lastklasse' | 'lastEigen'>): string {
  if (p.lastklasse === 'eigene') return p.lastEigen.trim() ? `${p.lastEigen.trim()} kN/m²` : ''
  return p.lastklasse && LASTKLASSE_KN[p.lastklasse] ? `Lastklasse ${p.lastklasse} (${LASTKLASSE_KN[p.lastklasse]} kN/m²)` : ''
}
export function breitenklasseText(p: Pick<Geruestpruefung, 'breitenklasse' | 'breiteEigen'>): string {
  return p.breitenklasse === 'eigene' ? p.breiteEigen.trim() : p.breitenklasse
}

export function bauartText(p: Pick<Geruestpruefung, 'bauart' | 'sonderGeruest'>): string {
  return [...p.bauart, p.sonderGeruest.trim()].filter(Boolean).join(', ')
}

export function auswertung(p: Pick<Geruestpruefung, 'antworten'>) {
  const offen = PRUEFPUNKTE.filter(x => !p.antworten[x.key])
  const nein = PRUEFPUNKTE.filter(x => p.antworten[x.key] === 'nein')
  return { offen, nein, anzahlOffen: offen.length, anzahlNein: nein.length }
}

/** Fehlende Pflichtangaben vor dem Ablegen; leere Liste = vollständig. */
export function fehlendeAngaben(p: Geruestpruefung): string[] {
  const f: string[] = []
  if (!p.pruefdatum) f.push('Prüfdatum')
  if (p.bauart.length === 0 && !p.sonderGeruest.trim()) f.push('Gerüstart')
  if (!lastklasseText(p)) f.push('Lastklasse')
  if (!breitenklasseText(p)) f.push('Breitenklasse')
  const a = auswertung(p)
  if (a.anzahlOffen) f.push(`Prüfpunkte noch nicht beantwortet (${a.anzahlOffen})`)
  if (!p.pruefer.trim()) f.push('Name der befähigten Person')
  if (!p.unterschrift) f.push('Unterschrift der befähigten Person')
  return f
}

/** Kennzeichnung darf laut Formular nur angebracht werden, wenn es keine Mängel („nein“) gibt. */
export const kennzeichnungMoeglich = (p: Geruestpruefung): boolean => {
  const a = auswertung(p)
  return a.anzahlOffen === 0 && a.anzahlNein === 0
}

/** Zeilen für die Anzeige/PDF, gruppiert. */
export function gruppiert(): { gruppe: string; punkte: Pruefpunkt[] }[] {
  const out: { gruppe: string; punkte: Pruefpunkt[] }[] = []
  for (const x of PRUEFPUNKTE) {
    const g = out[out.length - 1]
    if (g && g.gruppe === x.gruppe) g.punkte.push(x)
    else out.push({ gruppe: x.gruppe, punkte: [x] })
  }
  return out
}
