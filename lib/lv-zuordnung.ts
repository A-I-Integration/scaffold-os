// ============================================================
// SCAFFOLD OS – Zuordnung der CAD-Werte zu einem fremden LV (z. B. vom Statiker)
//
// Das CAD-LV hat eine eigene Gliederung (Aufbau/Vorhaltung/Abbau je m²). Ein Auftraggeber-LV ist oft
// anders aufgebaut (Pauschalpositionen in Stück, Vorhaltung in Wochen). Hier werden die Werte aus dem
// CAD auf dessen Positionsnummern gelegt. Was das CAD nicht kennt, bleibt leer und ist markiert.
// Es wird NICHTS erfunden: Preise kommen nur aus den Eingaben des LV-Fensters.
// ============================================================
import type { CADModel } from '@/lib/calculations/cad-engine'
import { ZUSATZ_INFO, type Leistungsverzeichnis, type LvPosition, type ZusatzArt } from '@/lib/leistungsverzeichnis'

export interface LvVorlagePos {
  pos: string
  titel: string
  einheit: string
  /** Menge aus dem LV des Auftraggebers (falls vorgegeben) */
  menge?: number
  /** woher die Werte kommen; ohne `quelle` kennt das CAD die Position nicht */
  quelle?: 'geruest' | 'vorh-geruest' | 'schutzdach' | 'vorh-schutzdach' | 'treppe' | 'vorh-treppe'
    | 'ueberbrueckung' | 'vorh-ueberbrueckung' | 'aufzug' | 'vorh-aufzug' | 'statik' | 'be' | 'fach' | 'helfer' | 'anfahrt'
}

/** LV Wuppertal City-Kirche (Statiker stabil.team): Positionsnummern und Kurztitel aus dessen Excel-LV. */
export const LV_VORLAGE_WUPPERTAL: LvVorlagePos[] = [
  { pos: '01.1', titel: 'Baustelleneinrichtung', einheit: 'Stück', menge: 1, quelle: 'be' },
  { pos: '01.2', titel: 'Vorhaltung zur Vorposition 01.1', einheit: 'Wo' },
  { pos: '01.3', titel: 'Baustellen-Container-WC', einheit: 'Stück', menge: 1 },
  { pos: '01.4', titel: 'Vorhaltung zur Vorposition 01.3', einheit: 'Wo' },
  { pos: '01.5', titel: 'Bauzaun', einheit: 'm' },
  { pos: '01.6', titel: 'Vorhaltung zur Vorposition 01.5', einheit: 'm/Wo' },
  { pos: '01.7', titel: 'Bauzauntor', einheit: 'Stück' },
  { pos: '01.8', titel: 'Vorhaltung zur Vorposition 01.7', einheit: 'Wo' },
  { pos: '01.9', titel: 'Abdecken von Bodenflächen BE', einheit: 'm²' },
  { pos: '01.10', titel: 'Vorhaltung zur Vorposition 01.9', einheit: 'm²/Wo' },
  { pos: '01.11', titel: 'Beantragung öffentlich-rechtliche Genehmigung', einheit: 'Stück', menge: 1 },
  { pos: '01.12', titel: 'Einrichten Halteverbotszone', einheit: 'Stück', menge: 1 },
  { pos: '01.13', titel: 'Verkehrssicherung', einheit: 'Stück', menge: 1 },
  { pos: '02.1', titel: 'Arbeitsgerüste mit integrierten Traggerüsten am Turmschaft bis 32 m Höhe', einheit: 'Stück', menge: 1, quelle: 'geruest' },
  { pos: '02.2', titel: 'Vorhaltung zur Vorposition 02.1', einheit: 'Wo', quelle: 'vorh-geruest' },
  { pos: '02.3', titel: 'Arbeitsgerüste am Turmschaft bis ca. 21,5 m Höhe (2. Bauabschnitt)', einheit: 'Stück', menge: 1 },
  { pos: '02.4', titel: 'Vorhaltung zur Vorposition 02.3', einheit: 'Wo' },
  { pos: '02.5', titel: 'Überbrückungen Dachflächen angrenzende Bauteile', einheit: 'Stück', menge: 1, quelle: 'ueberbrueckung' },
  { pos: '02.6', titel: 'Vorhaltung zur Vorposition 02.5', einheit: 'Wo', quelle: 'vorh-ueberbrueckung' },
  { pos: '02.7', titel: 'Schutzdächer Zugang Eingang Kirche', einheit: 'Stück', quelle: 'schutzdach' },
  { pos: '02.8', titel: 'Vorhaltung zur Vorposition 02.7', einheit: 'Wo', quelle: 'vorh-schutzdach' },
  { pos: '02.9', titel: 'Vertikale Bekleidung der Gerüste 1. BA ca. 21,5 m bis ca. 32 m', einheit: 'Stück', menge: 1 },
  { pos: '02.10', titel: 'Vorhaltung zur Vorposition 02.9', einheit: 'Wo' },
  { pos: '02.11', titel: 'Vertikale Bekleidung der Gerüste 2. BA bis ca. 17,5 m', einheit: 'Stück', menge: 1 },
  { pos: '02.12', titel: 'Vorhaltung zur Vorposition 02.11', einheit: 'Wo' },
  { pos: '02.13', titel: 'Gerüsttreppenturm 1. BA, H = ca. 32 m', einheit: 'Stück', menge: 1, quelle: 'treppe' },
  { pos: '02.14', titel: 'Vorhaltung zur Vorposition 02.13', einheit: 'Wo', quelle: 'vorh-treppe' },
  { pos: '02.15', titel: 'Gerüsttreppenturm 2. BA, H = ca. 21,5 m', einheit: 'Stück', menge: 1 },
  { pos: '02.16', titel: 'Vorhaltung zur Vorposition 02.15', einheit: 'Wo' },
  { pos: '02.17', titel: 'Personen- und Lastenaufzug 500/800 kg 1. BA, H = ca. 32 m', einheit: 'Stück', menge: 1, quelle: 'aufzug' },
  { pos: '02.18', titel: 'Vorhaltung zur Vorposition 02.17', einheit: 'Wo', quelle: 'vorh-aufzug' },
  { pos: '02.19', titel: 'Personen- und Lastenaufzug 500/800 kg 2. BA, H = ca. 21,5 m', einheit: 'Stück', menge: 1 },
  { pos: '02.20', titel: 'Vorhaltung zur Vorposition 02.19', einheit: 'Wo' },
  { pos: '02.21', titel: 'Haltestellenausstattung 1. BA', einheit: 'Stück', menge: 5 },
  { pos: '02.22', titel: 'Vorhaltung zur Vorposition 02.21', einheit: 'StckWo' },
  { pos: '02.23', titel: 'Haltestellenausstattung 2. BA', einheit: 'Stück', menge: 10 },
  { pos: '02.24', titel: 'Vorhaltung zur Vorposition 02.23', einheit: 'StckWo' },
  { pos: '02.25', titel: 'Schutz von Dachflächen', einheit: 'Stück' },
  { pos: '02.26', titel: 'Vorhaltung zur Vorposition 02.25', einheit: 'Wo' },
  { pos: '11.1', titel: 'Technische Bearbeitung, Vorbemerkungen', einheit: 'Stück', menge: 1, quelle: 'statik' },
  { pos: '12.1', titel: 'Facharbeiterstunden', einheit: 'h', menge: 50, quelle: 'fach' },
  { pos: '12.2', titel: 'Facharbeiterstunden inkl. Material, bei sep. An- und Abfahrt', einheit: 'h', menge: 50 },
  { pos: '12.3', titel: 'Helferstunden', einheit: 'h', menge: 50, quelle: 'helfer' },
  { pos: '12.4', titel: 'Helferstunden inkl. Material, bei sep. An- und Abfahrt', einheit: 'h', menge: 50 },
  { pos: '12.5', titel: 'Anfahrtpauschalen', einheit: 'Stück', menge: 10, quelle: 'anfahrt' },
]

export interface LvZuordnungZeile {
  pos: string
  titel: string
  einheit: string
  menge: number | null
  ep: number | null
  gp: number | null
  hinweis: string
}

export interface LvZuordnung {
  zeilen: LvZuordnungZeile[]
  summeNetto: number
  kopf: { label: string; wert: string }[]
  hinweise: string[]
}

const cent = (v: number): number => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100
const KEIN_CAD = 'Nicht aus dem CAD – bitte selbst ergänzen.'

export function erzeugeLvZuordnung(lv: Leistungsverzeichnis, model: CADModel, vorlage: LvVorlagePos[] = LV_VORLAGE_WUPPERTAL): LvZuordnung {
  const e = lv.eingaben
  const wochen = Math.max(0, e.gesamtStandzeitWochen)
  const positionen: LvPosition[] = lv.titel.flatMap((t) => t.positionen)
  const finde = (titel: string): LvPosition | undefined => positionen.find((p) => p.titel === titel)
  const gp = (...p: (LvPosition | undefined)[]): number => cent(p.reduce((s, x) => s + (x?.gp ?? 0), 0))
  const getrennt = e.stil === 'getrennt'
  const hinweise: string[] = []
  if (!getrennt) hinweise.push('Aufbau-Stil „Auf-/Abbau inkl. 4 Wochen Vorhaltung“ ist gewählt: Die Zuordnung braucht „Aufbau · Vorhaltung · Abbau getrennt“ und lässt die Gerüstpositionen leer.')
  if (!(wochen > 0)) hinweise.push('Standzeit gesamt ist 0 Wochen: Vorhaltungspositionen bleiben leer.')

  const schutzdachAnzahl = model.components3D.filter((c) => c.type === 'protection_roof').length
  const zusatzGp = (art: ZusatzArt) => {
    const i = ZUSATZ_INFO[art]
    return { aufbau: finde(`${i.name} – Aufbau`), abbau: finde(`${i.name} – Abbau`), vorh: finde(`Vorhaltung ${i.name}`), menge: (e.zusatz ?? []).find((z) => z.art === art)?.menge ?? 0 }
  }

  const leer = (v: LvVorlagePos, hinweis = KEIN_CAD): LvZuordnungZeile => ({ pos: v.pos, titel: v.titel, einheit: v.einheit, menge: v.menge ?? null, ep: null, gp: null, hinweis })
  const mitPreis = (v: LvVorlagePos, menge: number, summeGp: number, hinweis: string): LvZuordnungZeile => {
    const ep = menge > 0 ? cent(summeGp / menge) : 0
    return { pos: v.pos, titel: v.titel, einheit: v.einheit, menge, ep, gp: cent(ep * menge), hinweis: ep > 0 ? hinweis : `${hinweis} Preis fehlt (Eingaben im LV-Fenster ergänzen).` }
  }
  const vorhaltungsZeile = (v: LvVorlagePos, vorh: LvPosition | undefined, text: string): LvZuordnungZeile => {
    if (!vorh || !(wochen > 0)) return leer(v, 'Zugehörige Position ist nicht im CAD-LV enthalten.')
    return mitPreis(v, wochen, vorh.gp, `${text} Menge = Standzeit ${wochen} Wochen.`)
  }

  const zeilen = vorlage.map((v): LvZuordnungZeile => {
    switch (v.quelle) {
      case 'geruest': {
        if (!getrennt) return leer(v, 'Aufbau-Stil „getrennt“ wählen.')
        const auf = finde('Arbeits- und Schutzgerüst, Fassadengerüst – Aufbau'), ab = finde('Arbeits- und Schutzgerüst – Abbau')
        return mitPreis(v, v.menge ?? 1, gp(auf, ab), `Aufbau + Abbau aus dem CAD, ${auf?.menge ?? 0} m² Gerüstfläche, bis ${model.totalHeightM.toLocaleString('de-DE')} m. ANNAHME: Die Position umfasst Aufbau und Abbau.`)
      }
      case 'vorh-geruest': return getrennt ? vorhaltungsZeile(v, finde('Vorhaltung Arbeits- und Schutzgerüst'), 'Vorhaltung Gerüst je Woche.') : leer(v, 'Aufbau-Stil „getrennt“ wählen.')
      case 'schutzdach': {
        if (!(schutzdachAnzahl > 0)) return leer(v, 'Im CAD ist kein Schutzdach gesetzt.')
        const auf = finde('Schutzdach – Aufbau'), ab = finde('Schutzdach – Abbau')
        return mitPreis(v, schutzdachAnzahl, gp(auf, ab), `${schutzdachAnzahl} Stück aus dem CAD (Aufbau + Abbau). Lage im CAD ist ein Vorschlag (unten vorne, ca. 4 m); der Eingang ist im Modell nicht bekannt.`)
      }
      case 'vorh-schutzdach': return schutzdachAnzahl > 0 ? vorhaltungsZeile(v, finde('Vorhaltung Schutzdach'), 'Vorhaltung Schutzdach je Woche (gesamt, nicht je Stück).') : leer(v, 'Im CAD ist kein Schutzdach gesetzt.')
      case 'treppe': {
        const auf = finde('Treppenaufgang – Aufbau'), ab = finde('Treppenaufgang – Abbau')
        if (!auf) return leer(v, 'Im CAD ist kein Treppenaufgang vorhanden.')
        return mitPreis(v, v.menge ?? 1, gp(auf, ab), `Treppenaufgang aus dem CAD (${auf.menge} St, Aufbau + Abbau), Höhe ${model.totalHeightM.toLocaleString('de-DE')} m. Das CAD kennt nur einen Treppenaufgang.`)
      }
      case 'vorh-treppe': return vorhaltungsZeile(v, finde('Vorhaltung Treppenaufgang'), 'Vorhaltung Treppenaufgang je Woche.')
      case 'ueberbrueckung': case 'aufzug': {
        const z = zusatzGp(v.quelle)
        if (!(z.menge > 0)) return leer(v)
        return mitPreis(v, v.menge ?? z.menge, gp(z.aufbau, z.abbau), `Aus deinen Eingaben im LV-Fenster (${ZUSATZ_INFO[v.quelle].name}); nicht aus dem CAD-Modell.`)
      }
      case 'vorh-ueberbrueckung': case 'vorh-aufzug': {
        const art = v.quelle === 'vorh-aufzug' ? 'aufzug' : 'ueberbrueckung'
        const z = zusatzGp(art)
        return z.menge > 0 ? vorhaltungsZeile(v, z.vorh, 'Vorhaltung je Woche aus deinen Eingaben.') : leer(v)
      }
      case 'statik': { const p = finde('Technische Bearbeitung, statische Berechnung'); return p && p.ep > 0 ? mitPreis(v, v.menge ?? 1, p.gp, 'Pauschale aus deiner Eingabe.') : leer(v, 'Pauschale technische Bearbeitung im LV-Fenster eintragen.') }
      case 'be': return e.baustelleneinrichtung > 0 ? mitPreis(v, v.menge ?? 1, cent(e.baustelleneinrichtung), 'Pauschale aus deiner Eingabe.') : leer(v, 'Pauschale Baustelleneinrichtung im LV-Fenster eintragen.')
      case 'fach': return e.stundensatzFach > 0 ? mitPreis(v, v.menge ?? 0, cent((v.menge ?? 0) * e.stundensatzFach), 'Stundensatz Facharbeiter aus deiner Eingabe.') : leer(v, 'Stundensatz Facharbeiter im LV-Fenster eintragen.')
      case 'helfer': return e.stundensatzHelfer > 0 ? mitPreis(v, v.menge ?? 0, cent((v.menge ?? 0) * e.stundensatzHelfer), 'Stundensatz Helfer aus deiner Eingabe.') : leer(v, 'Stundensatz Helfer im LV-Fenster eintragen.')
      case 'anfahrt': return e.anfahrtspauschale > 0 ? mitPreis(v, v.menge ?? 0, cent((v.menge ?? 0) * e.anfahrtspauschale), 'Anfahrtspauschale aus deiner Eingabe.') : leer(v, 'Anfahrtspauschale im LV-Fenster eintragen.')
      default: return leer(v)
    }
  })

  const summeNetto = cent(zeilen.reduce((s, z) => s + (z.gp ?? 0), 0))
  const kopf = [
    { label: 'Gerüstfläche (CAD)', wert: `${model.totalAreaM2.toLocaleString('de-DE', { maximumFractionDigits: 2 })} m²` },
    { label: 'Gerüsthöhe (CAD)', wert: `${model.totalHeightM.toLocaleString('de-DE', { maximumFractionDigits: 2 })} m` },
    { label: 'Lastklasse', wert: String(e.lastklasse) },
    { label: 'Standzeit gesamt', wert: `${wochen} Wochen` },
  ]
  return { zeilen, summeNetto, kopf, hinweise: [...hinweise, 'Positionen ohne Wert kennt das CAD nicht (z. B. 2. Bauabschnitt, Kederplane, Haltestellen, Dachschutz). Sie sind leer und mit „Nicht aus dem CAD“ markiert.'] }
}

export async function erzeugeLvZuordnungXlsx(z: LvZuordnung): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx')
  const euro = '#,##0.00 "€"'
  type Zelle = { t: 's' | 'n'; v: string | number; f?: string; z?: string }
  const zellen: Record<string, Zelle> = {}
  let r = 1
  zellen[`A${r}`] = { t: 's', v: 'Zuordnung CAD-Werte zum LV des Auftraggebers (Entwurf)' }; r += 1
  for (const k of z.kopf) { zellen[`A${r}`] = { t: 's', v: k.label }; zellen[`B${r}`] = { t: 's', v: k.wert }; r += 1 }
  r += 1
  for (const [i, h] of ['Pos.', 'Leistung', 'Menge', 'Einheit', 'EP netto (€)', 'GP netto (€)', 'Hinweis'].entries()) zellen[`${'ABCDEFG'[i]}${r}`] = { t: 's', v: h }
  r += 1
  const erste = r
  for (const zeile of z.zeilen) {
    zellen[`A${r}`] = { t: 's', v: zeile.pos }
    zellen[`B${r}`] = { t: 's', v: zeile.titel }
    if (zeile.menge != null) zellen[`C${r}`] = { t: 'n', v: zeile.menge, z: '#,##0.00' }
    zellen[`D${r}`] = { t: 's', v: zeile.einheit }
    if (zeile.ep != null) { zellen[`E${r}`] = { t: 'n', v: zeile.ep, z: euro }; zellen[`F${r}`] = { t: 'n', v: zeile.gp ?? 0, f: `ROUND(C${r}*E${r},2)`, z: euro } }
    zellen[`G${r}`] = { t: 's', v: zeile.hinweis }
    r += 1
  }
  zellen[`B${r}`] = { t: 's', v: 'Summe netto (nur befüllte Positionen)' }
  zellen[`F${r}`] = { t: 'n', v: z.summeNetto, f: `SUM(F${erste}:F${r - 1})`, z: euro }
  const ws: Record<string, unknown> = { ...zellen, '!ref': `A1:G${r}`, '!cols': [{ wch: 8 }, { wch: 70 }, { wch: 10 }, { wch: 9 }, { wch: 14 }, { wch: 14 }, { wch: 90 }] }
  const ws2 = XLSX.utils.aoa_to_sheet([['Hinweise'], ...z.hinweise.map((h) => [h])])
  ws2['!cols'] = [{ wch: 140 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws as never, 'Zuordnung')
  XLSX.utils.book_append_sheet(wb, ws2, 'Hinweise')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
