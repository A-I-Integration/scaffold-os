// ============================================================
// SCAFFOLD OS – Urlaubskonto je Mitarbeiter (reine Logik)
//
// Regeln (Annahmen des Betriebs, in der Oberfläche benannt):
//  • Anspruch: Tage pro Jahr aus dem Verlauf „Urlaubsanspruch“ (Stand am Ende des jeweiligen Monats).
//  • Anteilig: je Monat ein Zwölftel. Ein Monat zählt, wenn der Mitarbeiter ihn von Anfang bis Ende beschäftigt ist
//    (Eintritt am 1., kein Austritt vor Monatsende). Es wird bis einschließlich zum betrachteten Monat gezählt.
//    Ohne erfassten Eintritt gilt das volle Jahr. Gerundet wird auf halbe Tage. Wartezeit und Übertrag ins Folgejahr sind nicht abgebildet.
//  • Urlaubstage = Arbeitstage Montag bis Freitag ohne gesetzliche Feiertage in NRW.
//  • Reihenfolge: Urlaubstage werden nach Datum aufgebraucht. Ein Tag ist bezahlt, wenn der bis zu diesem Tag (Monat) zustehende
//    Anspruch noch reicht, sonst unbezahlt. Genehmigte und beantragte Urlaube zählen; abgelehnte nicht.
// ============================================================

export type Tag = string // JJJJ-MM-TT

const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (t: Tag) => new Date(t + 'T00:00:00Z')
const plus = (t: Tag, tage: number) => { const d = utc(t); d.setUTCDate(d.getUTCDate() + tage); return iso(d) }

/** Ostersonntag (Gregorianischer Kalender, Gauß/„anonymer“ Algorithmus). */
function ostern(jahr: number): Tag {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1
  return `${jahr}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`
}

/** Gesetzliche Feiertage in Nordrhein-Westfalen. */
export function feiertageNrw(jahr: number): Set<Tag> {
  const o = ostern(jahr)
  return new Set<Tag>([
    `${jahr}-01-01`, plus(o, -2), plus(o, 1), `${jahr}-05-01`, plus(o, 39), plus(o, 50), plus(o, 60),
    `${jahr}-10-03`, `${jahr}-11-01`, `${jahr}-12-25`, `${jahr}-12-26`,
  ])
}

/** Arbeitstage (Mo–Fr, ohne Feiertage) von bis einschließlich, als Liste. */
export function arbeitstage(von: Tag, bis: Tag): Tag[] {
  const aus: Tag[] = []
  if (bis < von) return aus
  const feiertage = new Map<number, Set<Tag>>()
  for (let t = von; t <= bis; t = plus(t, 1)) {
    const wt = utc(t).getUTCDay()
    if (wt === 0 || wt === 6) continue
    const j = Number(t.slice(0, 4))
    if (!feiertage.has(j)) feiertage.set(j, feiertageNrw(j))
    if (!feiertage.get(j)!.has(t)) aus.push(t)
  }
  return aus
}

export interface AnspruchEintrag { tage_pro_jahr: number | string; gueltig_ab: Tag }

const letzterTagDesMonats = (jahr: number, monat: number): Tag => iso(new Date(Date.UTC(jahr, monat, 0)))
const ersterTagDesMonats = (jahr: number, monat: number): Tag => `${jahr}-${String(monat).padStart(2, '0')}-01`
const halbeTage = (x: number) => Math.round(x * 2) / 2

function anspruchAm(historie: AnspruchEintrag[], tag: Tag): number | null {
  const p = historie.filter(h => h.gueltig_ab <= tag).sort((a, b) => (a.gueltig_ab < b.gueltig_ab ? 1 : -1))[0]
  return p ? Number(p.tage_pro_jahr) : null
}

export interface KontoEingabe {
  anspruch: AnspruchEintrag[]
  eintritt?: Tag | null
  austritt?: Tag | null
}

/** Anteiliger Anspruch eines Jahres bis einschließlich Monat 1–12 (halbe Tage). */
export function anspruchBisMonat(k: KontoEingabe, jahr: number, bisMonat: number): number {
  let summe = 0
  for (let m = 1; m <= Math.min(12, Math.max(0, bisMonat)); m++) {
    const monatsanfang = ersterTagDesMonats(jahr, m), monatsende = letzterTagDesMonats(jahr, m)
    if (k.eintritt && k.eintritt > monatsanfang) continue
    if (k.austritt && k.austritt < monatsende) continue
    const tage = anspruchAm(k.anspruch, monatsende)
    if (tage !== null) summe += tage / 12
  }
  return halbeTage(summe)
}

export interface UrlaubAbwesenheit { id: string; start_date: Tag; end_date: Tag; status: string }

export interface UrlaubZeile { id: string; von: Tag; bis: Tag; status: string; tage: number; bezahlt: number; unbezahlt: number }

export interface Urlaubskonto {
  jahr: number
  anspruchJahr: number
  anspruchBisHeute: number
  genommenBezahlt: number      // genehmigt
  beantragtBezahlt: number     // noch offen
  unbezahlt: number            // genehmigt und beantragt zusammen
  restBisHeute: number         // zustehend bis heute minus alle bezahlten Urlaubstage des Jahres
  restJahresende: number
  zeilen: UrlaubZeile[]
  hinweise: string[]
}

const zaehlt = (a: UrlaubAbwesenheit) => a.status === 'approved' || a.status === 'pending'

interface TagErgebnis { tag: Tag; id: string; bezahlt: boolean }

/** Urlaubstage nach Datum aufbrauchen: bezahlt, solange der bis zu diesem Monat zustehende Anspruch des Jahres reicht. */
function verteile(k: KontoEingabe, urlaube: UrlaubAbwesenheit[]): TagErgebnis[] {
  const tage: { tag: Tag; id: string }[] = []
  for (const a of urlaube.filter(zaehlt)) for (const t of arbeitstage(a.start_date, a.end_date)) tage.push({ tag: t, id: a.id })
  tage.sort((x, y) => (x.tag < y.tag ? -1 : x.tag > y.tag ? 1 : 0))
  const verbraucht = new Map<number, number>()
  const cache = new Map<string, number>()
  return tage.map(({ tag, id }) => {
    const jahr = Number(tag.slice(0, 4)), monat = Number(tag.slice(5, 7)), key = `${jahr}-${monat}`
    if (!cache.has(key)) cache.set(key, anspruchBisMonat(k, jahr, monat))
    const schon = verbraucht.get(jahr) ?? 0
    const bezahlt = schon + 1 <= cache.get(key)! + 1e-9
    if (bezahlt) verbraucht.set(jahr, schon + 1)
    return { tag, id, bezahlt }
  })
}

const summiere = (tage: TagErgebnis[], id: string) => {
  const m = tage.filter(t => t.id === id)
  const bezahlt = m.filter(t => t.bezahlt).length
  return { tage: m.length, bezahlt, unbezahlt: m.length - bezahlt }
}

/** Urlaubskonto für das Jahr des Stichtags „heute“. */
export function urlaubskonto(k: KontoEingabe, urlaube: UrlaubAbwesenheit[], heute: Tag): Urlaubskonto {
  const jahr = Number(heute.slice(0, 4)), monat = Number(heute.slice(5, 7))
  const tage = verteile(k, urlaube)
  const status = new Map(urlaube.map(a => [a.id, a.status]))
  const imJahr = tage.filter(t => Number(t.tag.slice(0, 4)) === jahr)
  const genehmigt = imJahr.filter(t => t.bezahlt && status.get(t.id) === 'approved').length
  const beantragt = imJahr.filter(t => t.bezahlt && status.get(t.id) !== 'approved').length
  const unbezahlt = imJahr.filter(t => !t.bezahlt).length
  const zeilen: UrlaubZeile[] = urlaube.filter(zaehlt).sort((x, y) => (x.start_date < y.start_date ? -1 : 1))
    .map(a => ({ id: a.id, von: a.start_date, bis: a.end_date, status: a.status, ...summiere(tage, a.id) }))
  const anspruchJahr = anspruchBisMonat(k, jahr, 12), anspruchBisHeute = anspruchBisMonat(k, jahr, monat)
  const hinweise: string[] = []
  if (!k.anspruch.length) hinweise.push('Es ist noch kein Urlaubsanspruch hinterlegt.')
  if (!k.eintritt) hinweise.push('Der erste Arbeitstag fehlt: es wird das volle Jahr angenommen.')
  return {
    jahr, anspruchJahr, anspruchBisHeute, genommenBezahlt: genehmigt, beantragtBezahlt: beantragt, unbezahlt,
    restBisHeute: anspruchBisHeute - genehmigt - beantragt, restJahresende: anspruchJahr - genehmigt - beantragt, zeilen, hinweise,
  }
}

export interface Vorschau { tage: number; bezahlt: number; unbezahlt: number; restBisHeute: number; hinweis: string }

/** Wirkung eines neuen Urlaubsantrags (von–bis) auf das Konto. */
export function urlaubsVorschau(k: KontoEingabe, urlaube: UrlaubAbwesenheit[], von: Tag, bis: Tag, heute: Tag): Vorschau {
  const alle = [...urlaube.filter(a => a.id !== '__neu__'), { id: '__neu__', start_date: von, end_date: bis, status: 'pending' }]
  const z = summiere(verteile(k, alle), '__neu__')
  const t = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`
  const hinweis = z.tage === 0 ? 'In diesem Zeitraum liegt kein Arbeitstag (Wochenende oder Feiertag).'
    : z.unbezahlt > 0 ? `${t(z.unbezahlt)} davon müssen als unbezahlter Urlaub genommen werden (bezahlt: ${t(z.bezahlt)}).`
    : `${t(z.tage)} bezahlter Urlaub.`
  return { ...z, restBisHeute: urlaubskonto(k, alle, heute).restBisHeute, hinweis }
}
