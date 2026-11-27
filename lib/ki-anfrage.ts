// KI-Angebotsassistent (Paket 1): Aus einem freien Text (Chat) einen Anfrage-ENTWURF herauslesen.
// Reine Logik ohne Netz und Datenbank. Grundsatz: die KI darf nichts erfinden. Jede Angabe muss im Text der Eingabe belegt sein,
// sonst wird sie verworfen und als Rückfrage gezeigt. Gerechnet wird hier nichts (Mengen, Preise bleiben bei der festen Berechnung).

export interface AnfrageEntwurf {
  kunde: string | null
  ansprechpartner: string | null
  strasse: string | null
  plz: string | null
  ort: string | null
  leistung: string | null
  flaeche_m2: number | null
  arbeitshoehe_m: number | null
  traufhoehe_m: number | null
  standzeit_wochen: number | null
  wunschtermin: string | null
  bemerkung: string | null
  gebaeude_laenge_m: number | null
  gebaeude_breite_m: number | null
  umlaufend: boolean
  /** Festpreis in Euro, nur wenn wörtlich im Text („5.000 € fest“); lokal gelesen, nicht von der KI */
  festpreis_eur: number | null
  /** Fahrtsatz in Euro je km, nur wenn wörtlich im Text („0,80 € pro km“) */
  fahrt_satz_eur_km: number | null
  /** true = Fläche wurde berechnet (Umfang × Höhe) und ist keine bestätigte Gerüstmenge */
  flaeche_vorlaeufig: boolean
  /** Aus dem Text gelesen (nicht von der KI, nicht berechnet): Besonderheiten der Baustelle */
  besonderheiten: Besonderheit[]
  /** Standzeit-Angabe wörtlich, z. B. „sechs bis acht Wochen“ */
  standzeit_text: string | null
}
export interface Besonderheit { art: 'einfahrt_frei' | 'treppenaufgang'; text: string }
export const FELD_LABEL: Record<keyof AnfrageEntwurf, string> = {
  festpreis_eur: 'Festpreis (€)', fahrt_satz_eur_km: 'Fahrtkosten (€ je km)',
  kunde: 'Kunde (Firma)', ansprechpartner: 'Ansprechpartner', gebaeude_laenge_m: 'Gebäudelänge (m)', gebaeude_breite_m: 'Gebäudebreite (m)', umlaufend: 'Gerüst rundum', strasse: 'Straße und Hausnummer', plz: 'PLZ', ort: 'Ort', leistung: 'Art des Gerüsts',
  flaeche_m2: 'Fläche (m²)', arbeitshoehe_m: 'Arbeitshöhe (m)', traufhoehe_m: 'Traufhöhe (m)', flaeche_vorlaeufig: 'Fläche vorläufig', besonderheiten: 'Besonderheiten', standzeit_text: 'Standzeit laut Text', standzeit_wochen: 'Standzeit (Wochen)', wunschtermin: 'Wunschtermin', bemerkung: 'Bemerkung',
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
  // Arbeits-/Gerüsthöhe nur mit eigenem Stichwort: eine genannte Traufhöhe ist keine Arbeitshöhe
  arbeitshoehe_m: { einheit: /(?:m|meter|metern)\.?\s*(?:arbeitshöhe|arbeitshoehe|gerüsthöhe|gerüsthoehe|hoch\b)/, stichwort: /(?:arbeits|gerüst|geruest)(?:höhe|hoehe)[^0-9]{0,22}$/ },
  traufhoehe_m: { einheit: /(?:m|meter|metern)\.?\s*(?:traufhöhe|traufhoehe)/, stichwort: /(?:traufhöhe|traufhoehe|traufe)[^0-9]{0,22}$/ },
  standzeit_wochen: { einheit: /wochen?|wo\.?/ },
  gebaeude_laenge_m: { einheit: /(?:m|meter|metern)\.?\s*(?:lang|länge|laenge)/ },
  gebaeude_breite_m: { einheit: /(?:m|meter|metern)\.?\s*(?:breit|breite)/ },
} as const

/** „sechs bis acht Wochen“: beide Werte der Spanne gelten als im Text belegt. */
export function zahlInWochenSpanne(wert: number, original: string): boolean {
  const t = original.toLowerCase()
  const tok = '(\\d+(?:[.,]\\d+)?|[a-zäöüß]+)'
  for (const m of t.matchAll(new RegExp(`${tok}\\s*(?:bis|-|–|oder)\\s*${tok}\\s*wochen?`, 'g'))) {
    for (const x of [m[1], m[2]]) {
      const n = /^\d/.test(x) ? parseFloat(x.replace(',', '.')) : WORTZAHLEN[x]
      if (n !== undefined && Math.abs(n - wert) < 1e-9) return true
    }
  }
  return false
}
/** Bemerkung sinngemäß belegt: fast alle längeren Wörter stehen im Text (Satzzeichen und Reihenfolge egal). */
export function sinngemaessBelegt(wert: string, original: string): boolean {
  const o = original.toLowerCase()
  const woerter = wert.toLowerCase().split(/[^a-zäöüß0-9]+/).filter((w) => w.length > 3)
  if (!woerter.length) return false
  const treffer = woerter.filter((w) => o.includes(w.slice(0, Math.max(4, w.length - 2)))).length
  return treffer / woerter.length >= 0.8
}
/** Besonderheiten lokal aus dem Text lesen (satzweise, wörtlich). Es wird nichts angenommen, keine Konstruktion und kein Preis. */
export function leseBesonderheiten(original: string): Besonderheit[] {
  const out: Besonderheit[] = []
  for (const satz of original.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean)) {
    if (/einfahrt|durchfahrt|zufahrt/i.test(satz) && /frei/i.test(satz)) out.push({ art: 'einfahrt_frei', text: satz.slice(0, 300) })
    else if (/treppenaufgang|treppenturm|treppe/i.test(satz)) out.push({ art: 'treppenaufgang', text: satz.slice(0, 300) })
  }
  return out
}
/** Standzeit-Angabe wörtlich („sechs bis acht Wochen“, „6 Wochen“), damit bei einer Spanne nichts verloren geht. */
export function leseStandzeitText(original: string): string | null {
  const m = original.match(/(?:\d+(?:[.,]\d+)?|[a-zäöüß]+)\s*(?:bis|-|–|oder)\s*(?:\d+(?:[.,]\d+)?|[a-zäöüß]+)\s*wochen?|\b\d+(?:[.,]\d+)?\s*wochen?/i)
  return m ? m[0].trim() : null
}
/** Besteht die Bemerkung nur aus Stichwörtern, die schon als Besonderheit (Einfahrt/Treppenaufgang) erfasst sind? */
export function nurBesonderheitsWoerter(wert: string): boolean {
  const woerter = wert.toLowerCase().split(/[^a-zäöüß0-9]+/).filter((w) => w.length > 2)
  return woerter.length > 0 && woerter.every((w) => /^(einfahrt|durchfahrt|zufahrt|freihalten|freihaltung|frei|bleiben|treppenaufgang|treppenturm|treppe|und|sowie|muss|soll|erforderlich|nötig|benötigt)$/.test(w))
}
/** Deutsche Zahl: „5.000“ (Tausenderpunkt), „0,80“, „1200“. */
function deutscheZahl(ganz: string, nachkomma?: string): number {
  return parseFloat(`${ganz.replace(/\./g, '')}${nachkomma ? '.' + nachkomma : ''}`)
}
export interface PreisAngaben { festpreis_eur: number | null; fahrt_satz_eur_km: number | null; hinweise: string[] }
/** Preise nur lokal und nur wörtlich aus dem Text lesen („5.000 € fest“, „0,80 € pro km“). Nichts wird gerechnet oder geschätzt. */
export function lesePreisangaben(original: string): PreisAngaben {
  const t = original.toLowerCase()
  const hinweise: string[] = []
  const BETRAG = '(\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,(\\d{1,2}))?'
  let festpreis: number | null = null
  const f = t.match(new RegExp(`${BETRAG}\\s*(?:€|euro|eur)\\s*(?:fest(?:preis)?|pauschal\\w*)`)) || t.match(new RegExp(`(?:festpreis|pauschal\\w*)\\s*(?:von|über|:)?\\s*${BETRAG}\\s*(?:€|euro|eur)`))
  if (f) {
    const n = deutscheZahl(f[1], f[2])
    if (n >= 1 && n <= 10_000_000) { festpreis = n; hinweise.push(`Festpreis ${n.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € aus dem Text gelesen. Ob netto oder brutto, steht nicht im Text, das Angebot rechnet netto zuzüglich USt`) }
  }
  let satz: number | null = null
  const k = t.match(new RegExp(`${BETRAG}\\s*(?:(€|euro|eur|cent|ct)\\s*(?:pro|je|/)?\\s*|(?:pro|je|/)\\s*)(?:km|kilometer)\\b`))
  if (k) {
    let n = deutscheZahl(k[1], k[2])
    const einheit = k[3]
    if ((einheit === 'cent' || einheit === 'ct') && n >= 10) n = n / 100
    else if (einheit === 'cent' || einheit === 'ct') hinweise.push(`„cent“ gesagt, aber ${n.toLocaleString('de-DE', { minimumFractionDigits: 2 })} als Euro je km gelesen. bitte prüfen`)
    if (n >= 0.1 && n <= 10) { satz = Math.round(n * 100) / 100; hinweise.push(`Fahrtkosten ${satz.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € je km aus dem Text gelesen. Die Kilometer fehlen noch und werden im Angebot ergänzt`) }
  }
  return { festpreis_eur: festpreis, fahrt_satz_eur_km: satz, hinweise }
}
const RUNDUM = /rund\s*um|rundum|umlaufend|ringsum|allseitig|alle\s+(?:vier\s+)?seiten/i

const STRASSE_RE = /(?<![A-Za-zÄÖÜäöüß])[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]*(?:str(?:aße|asse)?|weg|gasse|allee|platz|ring|damm|chaussee|pfad|steig|ufer|markt|graben|brücke|anger)\.?\s+\d{1,4}\s?[a-z]?\b/
// kleingeschrieben getippt/diktiert („ölbachstr. 48“): mindestens drei Buchstaben davor, damit „weg 5“ im Satz nichts auslöst
const STRASSE_KLEIN_RE = /(?<![A-Za-zÄÖÜäöüß])[a-zäöüß]{3,}(?:str(?:aße|asse)?|weg|gasse|allee|platz|ring|damm|chaussee|pfad|steig|ufer|markt|graben|anger)\.?\s+\d{1,4}\s?[a-z]?\b/
const PLZ_ORT_RE = /\b(\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+(?:[ -][A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+)*)\b/

/** Adresse lokal aus dem Originaltext lesen. Die KI bekommt Straße und PLZ nie zu sehen (siehe Pseudonymisierung). */
export function extrahiereAdresse(text: string): { strasse: string | null; plz: string | null; ort: string | null } {
  const s = text.match(STRASSE_RE) || text.match(STRASSE_KLEIN_RE)
  const p = text.match(PLZ_ORT_RE)
  return { strasse: s ? s[0].replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()) : null, plz: p ? p[1] : null, ort: p ? p[2] : null }
}

const zahl = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? parseFloat(v.replace(',', '.')) : NaN
  return Number.isFinite(n) && n > min && n <= max ? Math.round(n * 100) / 100 : null
}
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export interface LeseErgebnis { entwurf: AnfrageEntwurf; verworfen: string[]; abgeleitet: string[] }

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
  const belegtSinngemaess = (wert: string | null, feld: keyof AnfrageEntwurf): string | null => {
    if (!wert) return null
    if (o.includes(norm(wert)) || sinngemaessBelegt(wert, original)) return wert
    // Fasst die KI nur zusammen, was ohnehin als Besonderheit aus dem Text gelesen wurde (z. B. „Einfahrt freihalten“), ist das keine Warnung wert
    if (leseBesonderheiten(original).length > 0 && nurBesonderheitsWoerter(wert)) return null
    verworfen.push(`${FELD_LABEL[feld]}: „${wert}“ steht nicht im Text`)
    return null
  }
  const mitZahl = (v: unknown, min: number, max: number, feld: 'flaeche_m2' | 'arbeitshoehe_m' | 'traufhoehe_m' | 'standzeit_wochen' | 'gebaeude_laenge_m' | 'gebaeude_breite_m'): number | null => {
    const n = zahl(v, min, max)
    if (n === null) { if (v !== null && v !== undefined && v !== '') verworfen.push(`${FELD_LABEL[feld]}: Wert nicht plausibel`); return null }
    if (!(zahlImText(n, original, KONTEXT[feld]) || (feld === 'standzeit_wochen' && zahlInWochenSpanne(n, original)))) { verworfen.push(`${FELD_LABEL[feld]}: ${n} steht nicht im Text`); return null }
    return n
  }

  const preise = lesePreisangaben(original)
  const ort = adr.ort ?? belegt(text(r.ort, 80), 'ort')
  const entwurf: AnfrageEntwurf = {
    kunde: belegt(text(r.kunde, 120), 'kunde'),
    ansprechpartner: belegt(text(r.ansprechpartner, 80), 'ansprechpartner'),
    strasse: adr.strasse, plz: adr.plz, ort,
    leistung: belegt(text(r.leistung, 80), 'leistung'),
    flaeche_m2: mitZahl(r.flaeche_m2, 0, 100000, 'flaeche_m2'),
    arbeitshoehe_m: mitZahl(r.arbeitshoehe_m, 0, 200, 'arbeitshoehe_m'),
    traufhoehe_m: mitZahl(r.traufhoehe_m, 0, 200, 'traufhoehe_m'),
    standzeit_wochen: mitZahl(r.standzeit_wochen, 0, 520, 'standzeit_wochen'),
    wunschtermin: belegt(text(r.wunschtermin, 60), 'wunschtermin'),
    bemerkung: belegtSinngemaess(text(r.bemerkung, 300), 'bemerkung'),
    gebaeude_laenge_m: mitZahl(r.gebaeude_laenge_m, 0, 1000, 'gebaeude_laenge_m'),
    gebaeude_breite_m: mitZahl(r.gebaeude_breite_m, 0, 1000, 'gebaeude_breite_m'),
    umlaufend: r.umlaufend === true && RUNDUM.test(original),
    festpreis_eur: preise.festpreis_eur,
    fahrt_satz_eur_km: preise.fahrt_satz_eur_km,
    flaeche_vorlaeufig: false,
    besonderheiten: leseBesonderheiten(original),
    standzeit_text: leseStandzeitText(original),
  }
  const abgeleitet = leiteFlaecheAb(entwurf)
  abgeleitet.push(...preise.hinweise)
  if (entwurf.arbeitshoehe_m !== null && !/(?:arbeits|gerüst|geruest)(?:höhe|hoehe)/i.test(original)) abgeleitet.push(`Arbeitshöhe ${entwurf.arbeitshoehe_m} m aus einer Angabe wie „m hoch“ gelesen, bitte prüfen (Gebäude oder Gerüst?)`)
  return { entwurf, verworfen, abgeleitet }
}

/** „Rund um das Gebäude“: Umfang = 2 × (Länge + Breite); vorläufige Fassadenfläche = Umfang × Höhe (Arbeitshöhe, sonst Traufhöhe). Nur wenn die Fläche nicht selbst genannt wurde.
 *  Das ist eine geometrische Näherung, keine bestätigte Gerüstmenge: ohne Abzug für Einfahrt oder Lücken, ohne Giebel, Dachüberstände und unterschiedliche Höhen. */
export function leiteFlaecheAb(e: AnfrageEntwurf): string[] {
  const hoehe = e.arbeitshoehe_m ?? e.traufhoehe_m
  if (e.flaeche_m2 !== null || !e.umlaufend || !e.gebaeude_laenge_m || !e.gebaeude_breite_m || !hoehe) return []
  const umfang = umfangRundum(e) as number
  e.flaeche_m2 = Math.round(umfang * hoehe * 100) / 100
  e.flaeche_vorlaeufig = true
  const z = (n: number) => String(n).replace('.', ',')
  return [`Vorläufige Fassadenfläche (keine bestätigte Gerüstmenge): Umfang 2 × (${z(e.gebaeude_laenge_m)} + ${z(e.gebaeude_breite_m)}) = ${z(umfang)} m, ${z(umfang)} m × ${z(hoehe)} m ${e.arbeitshoehe_m ? 'Arbeitshöhe' : 'Traufhöhe'} = ${z(e.flaeche_m2)} m². Ohne Abzug für Einfahrt oder Lücken, ohne Giebel, Dachüberstände und unterschiedliche Höhen`]
}
export function umfangRundum(e: Pick<AnfrageEntwurf, 'umlaufend' | 'gebaeude_laenge_m' | 'gebaeude_breite_m'>): number | null {
  return e.umlaufend && e.gebaeude_laenge_m && e.gebaeude_breite_m ? Math.round(2 * (e.gebaeude_laenge_m + e.gebaeude_breite_m) * 100) / 100 : null
}

/** Was fehlt noch für einen Angebotsentwurf? (als lesbare Rückfragen) */
export function fehlendeAngaben(e: AnfrageEntwurf, opt: { ohneKunde?: boolean } = {}): string[] {
  const f: string[] = []
  for (const k of PFLICHT) if (!(opt.ohneKunde && k === 'kunde') && (e[k] === null || e[k] === '')) f.push(k === 'arbeitshoehe_m' && e.traufhoehe_m !== null ? `${FELD_LABEL[k]} (nur Traufhöhe ${e.traufhoehe_m} m genannt)` : FELD_LABEL[k])
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

/** Länge der Fassade aus Fläche und Höhe (im Aufmaß gilt Fläche = Länge × Höhe, siehe flaecheM2). Nur mit beiden Angaben. */
export function laengeAusFlaeche(flaeche: number | null, hoehe: number | null): number | null {
  return flaeche && hoehe && flaeche > 0 && hoehe > 0 ? Math.round((flaeche / hoehe) * 100) / 100 : null
}
const zeichenkette = (n: number) => String(n)

/** Vorbefüllte Aufmaß-Daten (Schritt 1 und 2) für die neue Baustelle. Nur Angaben, die da sind; alles Weitere trägt der Mensch im Aufmaß nach.
 *  Traufhöhe und Arbeitshöhe bleiben getrennt: aus einer genannten Traufhöhe wird keine Arbeitshöhe. Alles aus dem Gespräch steht zusätzlich in `anfrage` und in den Notizen. */
export function baueAufmassDaten(e: AnfrageEntwurf, kunde: { id: string; name: string }, original: string, jetzt = new Date()) {
  const adresse = [e.strasse, [e.plz, e.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const umfang = umfangRundum(e)
  const laenge = umfang ?? (e.arbeitshoehe_m ? laengeAusFlaeche(e.flaeche_m2, e.arbeitshoehe_m) : null)
  const z = (n: number) => String(n).replace('.', ',')
  const zeilen: string[] = []
  if (e.wunschtermin) zeilen.push(`Wunschtermin: ${e.wunschtermin}`)
  if (e.standzeit_text) zeilen.push(`Standzeit laut Anruf: ${e.standzeit_text}${e.standzeit_wochen ? ` (eingetragen: ${e.standzeit_wochen} Wochen)` : ''}`)
  if (e.gebaeude_laenge_m || e.gebaeude_breite_m) zeilen.push(`Gebäude: ${e.gebaeude_laenge_m ? `${z(e.gebaeude_laenge_m)} m lang` : ''}${e.gebaeude_laenge_m && e.gebaeude_breite_m ? ', ' : ''}${e.gebaeude_breite_m ? `${z(e.gebaeude_breite_m)} m breit` : ''}`)
  if (e.traufhoehe_m) zeilen.push(`Traufhöhe laut Anruf: ${z(e.traufhoehe_m)} m${e.arbeitshoehe_m ? '' : ' (Arbeitshöhe/Gerüsthöhe nicht genannt, im Aufmaß festlegen)'}`)
  if (umfang && laenge) zeilen.push(`Länge ${z(umfang)} m = Umfang rundum, vorläufig aus den Gebäudemaßen berechnet (ohne Abzug für Einfahrt oder Lücken)`)
  for (const b of e.besonderheiten) zeilen.push(`${b.art === 'einfahrt_frei' ? 'Einfahrt freihalten' : 'Treppenaufgang'}: ${b.text}`)
  if (e.bemerkung) zeilen.push(e.bemerkung)
  const step1: Record<string, unknown> = { name: kunde.name, customerId: kunde.id }
  if (adresse) step1.adresse = adresse
  if (e.leistung) step1.baustelle = e.leistung
  if (e.ansprechpartner) step1.ansprechpartnerName = e.ansprechpartner
  if (e.standzeit_wochen) step1.dauer = zeichenkette(Math.min(52, Math.max(1, Math.round(e.standzeit_wochen))))
  if (zeilen.length) step1.notizen = zeilen.join('\n')
  const step2: Record<string, unknown> = {}
  if (laenge) step2.laenge = zeichenkette(laenge)
  if (e.arbeitshoehe_m) step2.hoehe = zeichenkette(e.arbeitshoehe_m)
  if (e.traufhoehe_m) step2.traufhoehe = zeichenkette(e.traufhoehe_m)
  // Preisart nur aus ausdrücklich genannten Beträgen; Schritt 6 zeigt sie an und lässt sie ändern
  const preis: Record<string, unknown> = {}
  if (e.festpreis_eur) { preis.preisModus = 'pauschale'; preis.pauschale = String(e.festpreis_eur).replace('.', ',') }
  if (e.fahrt_satz_eur_km) preis.angebotAnpassungen = { fahrt: { aktiv: true, km: '', satzProKm: e.fahrt_satz_eur_km.toFixed(2).replace('.', ',') } }
  return { step1, ...(Object.keys(step2).length ? { step2 } : {}), ...preis, anfrage: baueAnfrageDaten(e, original, jetzt) }
}
