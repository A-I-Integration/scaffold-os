// ============================================================
// SCAFFOLD OS – Prüfpunkte für den Statiker
//
// Aus dem CAD-Modell und den Statik-Angaben wird eine Liste von Punkten
// gebildet, auf die der Statiker besonders achten sollte. Das sind HINWEISE
// aus einer Fachliste (A–Z, Normen u. a. DIN EN 12811, DIN EN 1991, DIN 4420),
// keine Nachweise und keine Berechnung. Die Normwerte selbst stehen hier
// bewusst nicht; sie gehören in die Statik.
// ============================================================

import type { CADModel } from './calculations/cad-engine'
import { SONDERLASTEN, windzonenRichtwertMs, type StatikDaten } from './statik-daten'
import { katalogListeFuerSystem } from './cad/katalog-zuordnung'
import { pruefeLastklassen } from './data/zulassung-lastklassen'

export interface Pruefpunkt {
  id: string
  /** Stichwort aus der Fachliste, z. B. "Konsolen" */
  thema: string
  text: string
}

// Höhe, ab der die Typenstatik laut Fachliste enden kann. Quelle: Angabe aus der
// Fachliste (Fassadengerüst); je System steht der echte Wert in der Aufbau- und
// Verwendungsanleitung – bitte dort prüfen.
export const TYPENSTATIK_HOEHE_HINWEIS_M = 24

export function statikPruefpunkte(model: CADModel | null, statik: StatikDaten): Pruefpunkt[] {
  const p: Pruefpunkt[] = []
  const anzahl = (typ: string) => (model?.components3D ?? []).filter((c) => c.type === typ).length

  if (model) {
    const h = model.totalHeightM
    if (h > TYPENSTATIK_HOEHE_HINWEIS_M) {
      p.push({ id: 'hoehe', thema: 'Typenstatik', text: `Gerüsthöhe ${h.toFixed(1)} m: Über der Regelausführung kann die Typenstatik enden, dann ist eine Einzelstatik nötig (Grenze je System in der Aufbau- und Verwendungsanleitung prüfen).` })
    }
    const konsolen = anzahl('console')
    if (konsolen > 0) p.push({ id: 'konsolen', thema: 'Konsolen und Auskragungen', text: `${konsolen} Konsolen im Modell: Zusatzbeanspruchung der Ständer und Kippmomente nachweisen.` })
    const treppen = anzahl('stair')
    if (treppen > 0) p.push({ id: 'treppen', thema: 'Treppen und Zugänge', text: `${treppen} Treppenbauteile: Verkehrslast auf Läufen und Podesten beachten, besonders wenn die Treppe Fluchtweg ist.` })
    const platten = anzahl('load_plate')
    if (platten > 0) p.push({ id: 'fuss', thema: 'Fußpunkte und Bodenpressung', text: `${platten} Lastverteilungsplatten im Modell: Bodenpressung unter den Fußpunkten mit dem angegebenen Untergrund abgleichen.` })
    if (model.building.umriss && model.building.umriss.length >= 3) {
      p.push({ id: 'umriss', thema: 'Gebäude mit Umriss', text: 'Das Gerüst läuft um Ecken (Umriss): Verankerung und Aussteifung an den Ecken sowie schräg einfallender Wind (Kräfte parallel zur Fassade) prüfen.' })
    }
    const lkListe = model.system ? katalogListeFuerSystem(model.system.id) : null
    const lkPr = lkListe && model.building.lastklasse ? pruefeLastklassen(lkListe, model.fields.map((f) => f.lengthM), model.building.lastklasse) : null
    if (lkPr) {
      const ok = lkPr.zeilen.filter((z) => z.ergebnis === 'ok').length
      p.push({ id: 'belag-lk', thema: 'Beläge und Lastklasse', text: `Laut Zulassung ${lkPr.tabelle.zulassung} (${lkPr.tabelle.tabelle}) decken ${ok} von ${lkPr.zeilen.length} Belagarten die Lastklasse ${lkPr.geplanteLk} bei den Feldweiten im Modell ab. Belagwahl gegen die Zulassung prüfen (Abschnitt 6 im Lastannahmen-Blatt).` })
    }
    if (model.building.lastklasse) p.push({ id: 'lastklasse', thema: 'Lastklasse', text: `Gewählte Lastklasse ${model.building.lastklasse}: Lagenbelegung (wie viele Lagen gleichzeitig belastet) festlegen.` })
  }

  if (statik.bekleidung === 'netz') p.push({ id: 'netz', thema: 'Bekleidung', text: 'Netze: Windangriff mit der Luftdurchlässigkeit laut Herstellerangabe ansetzen.' })
  if (statik.bekleidung === 'plane') p.push({ id: 'plane', thema: 'Bekleidung', text: 'Planen / Einhausung: geschlossene Fläche, volle Windangriffsfläche und erhöhte Verankerungskräfte.' })
  if (statik.verankerungsgrund) p.push({ id: 'anker', thema: 'Verankerung', text: `Verankerungsgrund: ${statik.verankerungsgrund}. Auszugskräfte der Anker für diesen Untergrund nachweisen (Zulassung oder Probebelastung).` })
  if (statik.verankerungsgrund === 'Wärmedämmverbundsystem (WDVS)') p.push({ id: 'wdvs', thema: 'Verankerung', text: 'WDVS: Lasteinleitung ohne Biegemoment in die Dämmung, z. B. mit Abstandsankern.' })
  if (statik.systemmischung) p.push({ id: 'misch', thema: 'Mischsysteme', text: 'Bauteile verschiedener Hersteller oder Systeme gemischt: gesonderter Nachweis nötig.' })
  for (const s of SONDERLASTEN) {
    if (statik.sonderlasten?.includes(s.id)) p.push({ id: `sonder-${s.id}`, thema: 'Sonderlast', text: `${s.text}: als zusätzliche Einwirkung in der Statik berücksichtigen.` })
  }
  if (statik.windzone && statik.vrefMs === undefined) p.push({ id: 'wind', thema: 'Wind', text: `Windzone ${statik.windzone} angegeben, aber keine Referenzwindgeschwindigkeit eingetragen.` })
  const richt = windzonenRichtwertMs(statik.windzone)
  if (richt !== null && statik.vrefMs !== undefined && statik.vrefMs < richt) {
    p.push({ id: 'wind-richtwert', thema: 'Wind', text: `Eingetragene Referenzwindgeschwindigkeit ${statik.vrefMs.toLocaleString('de-DE')} m/s liegt unter dem Richtwert ${richt.toLocaleString('de-DE')} m/s der Windzone ${statik.windzone}: Angabe mit dem Statiker abstimmen.` })
  }
  return p
}
