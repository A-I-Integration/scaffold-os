// KI-Angebotsassistent (Paket 1): Aus einem freien Text (Chat) einen Anfrage-ENTWURF herauslesen.
// Reine Logik ohne Netz und Datenbank. Grundsatz: die KI darf nichts erfinden. Jede Angabe muss im Text der Eingabe belegt sein,
// sonst wird sie verworfen und als Rückfrage gezeigt. Gerechnet wird hier nichts (Mengen, Preise bleiben bei der festen Berechnung).

export interface AnfrageEntwurf {
  kunde: string | null
  strasse: string | null
  plz: string | null
  ort: string | null
  leistung: string | null
  flaeche_m2: number | null
  arbeitshoehe_m: number | null
  standzeit_wochen: number | null
  wunschtermin: string | null
  bemerkung: string | null
}
export const FELD_LABEL: Record<keyof AnfrageEntwurf, string> = {
  kunde: 'Kunde', strasse: 'Straße und Hausnummer', plz: 'PLZ', ort: 'Ort', leistung: 'Art des Gerüsts',
  flaeche_m2: 'Fläche (m²)', arbeitshoehe_m: 'Arbeitshöhe (m)', standzeit_wochen: 'Standzeit (Wochen)', wunschtermin: 'Wunschtermin', bemerkung: 'Bemerkung',
}
/** Diese Angaben braucht es mindestens, damit sich ein Angebot überhaupt vorbereiten lässt. */
export const PFLICHT: (keyof AnfrageEntwurf)[] = ['kunde', 'ort', 'flaeche_m2', 'arbeitshoehe_m']

const WORTZAHLEN: Record<string, number> = { ein: 1, eine: 1, einen: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwoelf: 12, zwölf: 12, dreizehn: 13, vierzehn: 14, fuenfzehn: 15, fünfzehn: 15, sechzehn: 16, achtzehn: 18, zwanzig: 20 }
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

interface Zahlstelle { wert: number; ende: number; anfang: number }
function zahlstellen(t: string): Zahlstelle[] {
  const out: Zahlstelle[] = []
  for (const m of t.matchAll(/\d+(?:[.,]\d+)?/g)) out.push({ wert: parseFloat(m[0].replace(',', '.')), anfang: m.index!, ende: m.index! + m[0].length })
  for (const m of t.matchAll(/(?<![a-zäöüß])([a-zäöüß]+)(?![a-zäöüß])/g)) {
    const n = WORTZAHLEN[m[1]]
    if (n !== undefined) out.push({ wert: n, anfang: m.index!, ende: m.index! + m[0].length })
  }
  return out
}

/** Kommt diese Zahl im Text vor (Ziffern, auch mit Komma, oder Zahlwort bis zwanzig)? Optional nur gültig direkt vor einer Einheit oder nach einem Stichwort (z. B. „Höhe 8“). */
export function zahlImText(wert: number, original: string, kontext?: { einheit?: RegExp; stichwort?: RegExp }): boolean {
  const t = original.toLowerCase()
  return zahlstellen(t).some((z) => {
    if (Math.abs(z.wert - wert) >= 1e-9) return false
    if (!kontext) return true
    const danach = t.slice(z.ende, z.ende + 14)
    const davor = t.slice(Math.max(0, z.anfang - 25), z.anfang)
    return !!((kontext.einheit && new RegExp(`^\\s*(?:${kontext.einheit.source})`).test(danach)) || (kontext.stichwort && kontext.stichwort.test(davor)))
  })
}
const KONTEXT = {
  flaeche_m2: { einheit: /m²|m2|qm|quadratmeter|quadrat/ },
  arbeitshoehe_m: { einheit: /m(?![²2a-zäöüß])|meter|metern/, stichwort: /(?:höhe|hoehe|hoch)[^0-9]{0,12}$/ },
  standzeit_wochen: { einheit: /wochen?|wo\.?/ },
} as const

const STRASSE_RE = /\b[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]*(?:str(?:aße|asse)?|weg|gasse|allee|platz|ring|damm|chaussee|pfad|steig|ufer|markt|graben|brücke|anger)\.?\s+\d{1,4}\s?[a-z]?\b/
const PLZ_ORT_RE = /\b(\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+(?:[ -][A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+)*)\b/

/** Adresse lokal aus dem Originaltext lesen. Die KI bekommt Straße und PLZ nie zu sehen (siehe Pseudonymisierung). */
export function extrahiereAdresse(text: string): { strasse: string | null; plz: string | null; ort: string | null } {
  const s = text.match(STRASSE_RE)
  const p = text.match(PLZ_ORT_RE)
  return { strasse: s ? s[0].replace(/\s+/g, ' ').trim() : null, plz: p ? p[1] : null, ort: p ? p[2] : null }
}

const zahl = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? parseFloat(v.replace(',', '.')) : NaN
  return Number.isFinite(n) && n > min && n <= max ? Math.round(n * 100) / 100 : null
}
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export interface LeseErgebnis { entwurf: AnfrageEntwurf; verworfen: string[] }

/** Rohantwort der KI prüfen: nur Belegtes bleibt stehen; Adresse kommt aus dem Originaltext. */
export function pruefeKiAntwort(roh: unknown, original: string): LeseErgebnis {
  const r = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>
  const verworfen: string[] = []
  const o = norm(original)
  const adr = extrahiereAdresse(original)

  const belegt = (wert: string | null, feld: keyof AnfrageEntwurf): string | null => {
    if (!wert) return null
    if (o.includes(norm(wert))) return wert
    verworfen.push(`${FELD_LABEL[feld]}: „${wert}“ steht nicht im Text`)
    return null
  }
  const mitZahl = (v: unknown, min: number, max: number, feld: 'flaeche_m2' | 'arbeitshoehe_m' | 'standzeit_wochen'): number | null => {
    const n = zahl(v, min, max)
    if (n === null) { if (v !== null && v !== undefined && v !== '') verworfen.push(`${FELD_LABEL[feld]}: Wert nicht plausibel`); return null }
    if (!zahlImText(n, original, KONTEXT[feld])) { verworfen.push(`${FELD_LABEL[feld]}: ${n} steht nicht im Text`); return null }
    return n
  }

  const ort = adr.ort ?? belegt(text(r.ort, 80), 'ort')
  return {
    verworfen,
    entwurf: {
      kunde: belegt(text(r.kunde, 120), 'kunde'),
      strasse: adr.strasse, plz: adr.plz, ort,
      leistung: belegt(text(r.leistung, 80), 'leistung'),
      flaeche_m2: mitZahl(r.flaeche_m2, 0, 100000, 'flaeche_m2'),
      arbeitshoehe_m: mitZahl(r.arbeitshoehe_m, 0, 200, 'arbeitshoehe_m'),
      standzeit_wochen: mitZahl(r.standzeit_wochen, 0, 520, 'standzeit_wochen'),
      wunschtermin: belegt(text(r.wunschtermin, 60), 'wunschtermin'),
      bemerkung: belegt(text(r.bemerkung, 300), 'bemerkung'),
    },
  }
}

/** Was fehlt noch für einen Angebotsentwurf? (als lesbare Rückfragen) */
export function fehlendeAngaben(e: AnfrageEntwurf): string[] {
  const f: string[] = []
  for (const k of PFLICHT) if (e[k] === null || e[k] === '') f.push(FELD_LABEL[k])
  if (!e.strasse) f.push(FELD_LABEL.strasse)
  if (e.standzeit_wochen === null) f.push(FELD_LABEL.standzeit_wochen)
  return f
}

const RECHTSFORM = /\b(gmbh\s*&\s*co\.?\s*kg|gmbh|ug|ag|kg|ohg|gbr|e\.?\s?k\.?|e\.?\s?v\.?|mbh|co\.?)\b/g
export const kundenSchluessel = (n: string) => n.toLowerCase().replace(RECHTSFORM, ' ').replace(/[^a-zäöüß0-9]+/g, ' ').replace(/\s+/g, ' ').trim()

export interface KundeKurz { id: string; name: string }
export interface KundenTreffer { kunde: KundeKurz; art: 'exakt' | 'aehnlich' }

/** Bestehende Kunden zum genannten Namen. „exakt“ = gleicher Name ohne Rechtsform, „ähnlich“ = einer enthält den anderen. Entscheidet immer der Mensch. */
export function findeKunden(name: string | null, kunden: KundeKurz[]): KundenTreffer[] {
  const k = name ? kundenSchluessel(name) : ''
  if (k.length < 3) return []
  const treffer: KundenTreffer[] = []
  for (const c of kunden) {
    const s = kundenSchluessel(c.name)
    if (!s) continue
    if (s === k) treffer.push({ kunde: c, art: 'exakt' })
    else if (s.includes(k) || k.includes(s)) treffer.push({ kunde: c, art: 'aehnlich' })
  }
  return treffer.sort((a, b) => (a.art === b.art ? 0 : a.art === 'exakt' ? -1 : 1)).slice(0, 5)
}

/** Daten für die neue Baustelle: nur was der Mensch bestätigt hat; Quelle und Zeitpunkt zur Nachvollziehbarkeit. */
export function baueAnfrageDaten(e: AnfrageEntwurf, original: string, jetzt = new Date()) {
  return { quelle: 'ki-chat', erfasst_am: jetzt.toISOString(), eingabetext: original.slice(0, 4000), ...e }
}
export function projektName(e: AnfrageEntwurf): string {
  return [e.leistung || 'Gerüst', e.ort].filter(Boolean).join(' ')
}
