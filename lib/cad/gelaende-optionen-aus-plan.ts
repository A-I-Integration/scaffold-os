// ============================================================
// SCAFFOLD OS – Gelände aus dem Plan-Import in die Gerüst-Optionen übertragen.
// Quelle (Vorrang): vier Eckkoten im Grundriss → Geländelinie je Ansicht (aus dem Bild gelesen) → Talseite der Ansichten (Vorschlag)
// → Koten je Kante. Gelesene Linien haben Vorrang vor den groben Rückfällen, damit an einer Ecke nicht zwei verschiedene Höhen gelten.
// Rein rechnerisch; BuildingForm ruft es beim Plan-Upload auf.
// ============================================================

import type { GeruestOptionen } from '@/lib/calculations/cad-engine'
import type { PlanImport } from './plan-import'
import { gelaendeProfilAusLinien, seiteVonKante, seiteVonHimmelsrichtung, type PlanKante } from './plan-oeffnungen-modell'
import { eckenAusTalseite } from './koten-je-ansicht'

export function gelaendeOptionenAusPlan(
  pl: PlanImport, vorne: PlanKante | null, vorhanden: GeruestOptionen | undefined, roofForm: string | undefined,
): { geruestOptionen: GeruestOptionen | undefined; hinweis: string } {
  let opt: GeruestOptionen | undefined
  let hinweis = ''
  const mitLinie = !!(vorne && pl.gelaendeLinien?.length)
  let eckenAusPlanGesetzt = false // vier Eckkoten stammen aus diesem Plan (nicht aus einer früheren Eingabe)
  // Hang: Geländehöhe an den vier Ecken aus dem Plan → Eckhöhen (Gerüst und Gelände folgen dem Hang)
  if (vorne && pl.gelaendeEckenPlan && Object.keys(pl.gelaendeEckenPlan).length === 4) {
    // Plan-Ecke (tl/tr/bl/br) → Modell-Ecke (fl/fr/bl/br) über die Vorderseite
    const kantenDerEcke: Record<'tl' | 'tr' | 'bl' | 'br', ['links' | 'rechts', 'oben' | 'unten']> = {
      tl: ['links', 'oben'], tr: ['rechts', 'oben'], bl: ['links', 'unten'], br: ['rechts', 'unten'],
    }
    const modellEcke: Partial<Record<'fl' | 'fr' | 'bl' | 'br', number>> = {}
    for (const [pe, [k1, k2]] of Object.entries(kantenDerEcke) as ['tl' | 'tr' | 'bl' | 'br', ['links' | 'rechts', 'oben' | 'unten']][]) {
      const v = pl.gelaendeEckenPlan[pe]
      if (v === undefined) continue
      const s1 = seiteVonKante(k1, vorne), s2 = seiteVonKante(k2, vorne)
      const fb = [s1, s2].find((s) => s === 'front' || s === 'back')
      const lr = [s1, s2].find((s) => s === 'left' || s === 'right')
      if (!fb || !lr) continue
      modellEcke[`${fb === 'front' ? 'f' : 'b'}${lr === 'left' ? 'l' : 'r'}` as 'fl' | 'fr' | 'bl' | 'br'] = v
    }
    if (Object.keys(modellEcke).length === 4) {
      const ec = { fl: modellEcke.fl!, fr: modellEcke.fr!, bl: modellEcke.bl!, br: modellEcke.br! }
      opt = { ...(vorhanden ?? {}), gelaendeEckenM: ec }
      eckenAusPlanGesetzt = true
      hinweis += ` Hang: Geländehöhe an den vier Ecken aus dem Plan übernommen (hinten ${String(ec.bl).replace(".",",")}/${String(ec.br).replace(".",",")}, vorne ${String(ec.fl).replace(".",",")}/${String(ec.fr).replace(".",",")} m) – bitte prüfen und ggf. drehen.`
    }
  }
  // Weniger als vier Eckkoten im Grundriss: Talseite aus den Ansichten (tiefste Kote) → vier Eckhöhen vorschlagen
  if (vorne && !mitLinie && !opt?.gelaendeEckenM && pl.gelaendeTiefe?.length) {
    const tal = pl.gelaendeTiefe[0]
    const plan = tal.art !== 'schnitt' ? eckenAusTalseite(tal.art, tal.tiefsteM) : null
    if (plan) {
      const kantenDerEcke: Record<'tl' | 'tr' | 'bl' | 'br', ['links' | 'rechts', 'oben' | 'unten']> = {
        tl: ['links', 'oben'], tr: ['rechts', 'oben'], bl: ['links', 'unten'], br: ['rechts', 'unten'],
      }
      const m: Partial<Record<'fl' | 'fr' | 'bl' | 'br', number>> = {}
      for (const [pe, [k1, k2]] of Object.entries(kantenDerEcke) as ['tl' | 'tr' | 'bl' | 'br', ['links' | 'rechts', 'oben' | 'unten']][]) {
        const s1 = seiteVonKante(k1, vorne), s2 = seiteVonKante(k2, vorne)
        const fb = [s1, s2].find((x) => x === 'front' || x === 'back')
        const lr = [s1, s2].find((x) => x === 'left' || x === 'right')
        if (fb && lr) m[`${fb === 'front' ? 'f' : 'b'}${lr === 'left' ? 'l' : 'r'}` as 'fl' | 'fr' | 'bl' | 'br'] = plan[pe]
      }
      if (Object.keys(m).length === 4) {
        const ec = { fl: m.fl!, fr: m.fr!, bl: m.bl!, br: m.br! }
        opt = { ...(vorhanden ?? {}), gelaendeEckenM: ec }
        const nm = ({ nord: 'Norden', ost: 'Osten', sued: 'Süden', west: 'Westen' } as Record<string, string>)[tal.art]
        hinweis += ` Hang als Vorschlag: Talseite ${nm} (tiefste Kote ${String(tal.tiefsteM).replace('.', ',')} m laut Ansicht), gegenüberliegende Seite auf ±0,00 angenommen, dazwischen gleichmäßiger Verlauf. Ggf. in „Hang über vier Eckhöhen“ nachstellen; Annahme: Plan oben = Norden.`
      }
    }
  }
  // Pultdach: Seite mit der niedrigen Traufe aus den Ansichten (Dach fällt nach …) – sonst gälte die Traufe nur „vorsichtig für alle Seiten“
  if (vorne && pl.pultNiedrigeRichtung && roofForm === 'pultdach') {
    const sd = seiteVonHimmelsrichtung(pl.pultNiedrigeRichtung, vorne)
    opt = { ...(opt ?? vorhanden ?? {}), pultNiedrigeSeite: sd }
    const nm = ({ nord: 'Norden', ost: 'Osten', sued: 'Süden', west: 'Westen' } as Record<string, string>)[pl.pultNiedrigeRichtung]
    hinweis += ` Pultdach: niedrige Traufe im ${nm} laut Ansichten (Annahme: Plan oben = Norden) – im Tab Gebäude „Seite mit der niedrigen Traufe“ prüfen.`
  }
  // Geländelinie je Ansicht (aus dem Bild gelesen) → Geländeprofil je Seite; die Nullhöhe ist der Fußboden des Erdgeschosses wie in den Koten
  if (vorne && pl.gelaendeLinien?.length) {
    const gp = gelaendeProfilAusLinien(pl.gelaendeLinien, vorne)
    opt = { ...(opt ?? vorhanden ?? {}), gelaendeProfilM: gp }
    // Eckhöhen einer früheren Eingabe oder eines Rückfalls stünden sonst gegen die gelesene Linie (andere Ecke an derselben Stelle)
    if (!eckenAusPlanGesetzt) delete opt.gelaendeEckenM
    const unsicher = pl.gelaendeLinien.some((l) => !l.sicher)
    hinweis += ` Hang: Geländelinie aus ${pl.gelaendeLinien.length} Ansicht${pl.gelaendeLinien.length === 1 ? '' : 'en'} gelesen (Höhen über die Koten-Dreiecke, ±0,00 = Erdgeschoss-Fußboden)${unsicher ? '; bei mindestens einer Ansicht ist die Lage der Hausecken geschätzt' : ''} – im Tab Gerüst unter „Geländeprofil je Seite“ prüfen.`
  }
  // Rückfall: Geländekoten je Kante → tiefster Wert je Seite (nur bei deutlichem Gefälle, wenn keine Eckhöhen)
  if (vorne && !mitLinie && !opt?.gelaendeEckenM && pl.gelaendeJeKante?.length && pl.gelaende && pl.gelaende.unterschiedM >= 1) {
    const gm: Partial<Record<'front' | 'back' | 'left' | 'right', number>> = {}
    for (const k of pl.gelaendeJeKante) { const sd = seiteVonKante(k.kante, vorne); if (Math.abs(k.minM) >= 0.01) gm[sd] = k.minM }
    if (Object.keys(gm).length) {
      opt = { ...(vorhanden ?? {}), gelaendeSeiteM: gm }
      hinweis += ` Hang: Gelände je Seite aus den Koten im Plan übernommen (${(Object.entries(gm) as [string, number][]).map(([sd, v]) => `${({ front: 'vorne', back: 'hinten', left: 'links', right: 'rechts' } as Record<string, string>)[sd]} ${String(v).replace('.', ',')} m`).join(', ')}; jeweils der tiefste Wert der Seite) – bitte unter Gerüst-Optionen prüfen.`
    }
  }

  return { geruestOptionen: opt, hinweis }
}
