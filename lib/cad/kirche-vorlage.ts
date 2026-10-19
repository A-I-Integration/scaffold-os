import type { BuildingParams, BuildingSection } from '@/lib/calculations/cad-engine'

/** Eingaben für die Vorlage „Kirche mit Turm": Turm links am Kirchenschiff, optional ein Chor am anderen Ende. */
export interface KircheMasse {
  breiteM: number          // Tiefe des Kirchenschiffs
  turmBreiteM: number      // Tiefe des Turms (mittig am Schiff); gleich breiteM = gleich tief
  chorBreiteM: number      // Tiefe des Chors (mittig)
  schiffLaengeM: number
  schiffTraufeM: number
  schiffDachM: number      // Höhe des Satteldachs (Traufe bis First)
  turmLaengeM: number
  turmSchaftM: number      // Höhe bis zum Helmansatz
  helmM: number            // Höhe des spitzen Helms (Pyramide); 0 = flaches Turmdach
  helmEinruesten: boolean
  chorLaengeM: number      // 0 = kein Chor
  chorTraufeM: number
  chorDachM: number
}

export const KIRCHE_STANDARD: KircheMasse = {
  breiteM: 12, turmBreiteM: 9, chorBreiteM: 9, schiffLaengeM: 30, schiffTraufeM: 12, schiffDachM: 8,
  turmLaengeM: 9, turmSchaftM: 45, helmM: 13, helmEinruesten: true,
  chorLaengeM: 0, chorTraufeM: 9, chorDachM: 6,
}

const ok = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max

/** Prüft die Maße; gibt eine Fehlermeldung oder null zurück. */
export function pruefeKircheMasse(m: KircheMasse): string | null {
  if (!ok(m.breiteM, 3, 60)) return 'Breite: 3 bis 60 m'
  if (!ok(m.turmBreiteM, 3, 60)) return 'Turm-Tiefe: 3 bis 60 m'
  if (m.chorLaengeM > 0 && !ok(m.chorBreiteM, 3, 60)) return 'Chor-Tiefe: 3 bis 60 m'
  if (!ok(m.schiffLaengeM, 5, 150)) return 'Schiff-Länge: 5 bis 150 m'
  if (!ok(m.schiffTraufeM, 3, 60)) return 'Schiff-Traufe: 3 bis 60 m'
  if (!ok(m.schiffDachM, 0, 40)) return 'Schiff-Dachhöhe: 0 bis 40 m'
  if (!ok(m.turmLaengeM, 3, 40)) return 'Turm-Länge: 3 bis 40 m'
  if (!ok(m.turmSchaftM, 5, 200)) return 'Turm-Schafthöhe: 5 bis 200 m'
  if (!ok(m.helmM, 0, 100)) return 'Helmhöhe: 0 bis 100 m'
  if (!ok(m.chorLaengeM, 0, 60)) return 'Chor-Länge: 0 bis 60 m'
  if (m.chorLaengeM > 0 && (!ok(m.chorTraufeM, 3, 60) || !ok(m.chorDachM, 0, 40))) return 'Chor: Traufe 3 bis 60 m, Dachhöhe 0 bis 40 m'
  if (m.turmSchaftM <= m.schiffTraufeM + m.schiffDachM) return 'Der Turm muss höher sein als das Schiff (Traufe + Dach)'
  return null
}

const tiefe = (t: number, basis: number): { tiefeM?: number } => (Number.isFinite(t) && Math.abs(t - basis) > 0.005 ? { tiefeM: t } : {})

/** Baut aus den Kirchenmaßen die Gebäudedaten: Turm eingerüstet (links), Schiff und Chor nur dargestellt. */
export function kircheAlsGebaeude(m: KircheMasse): BuildingParams {
  const abschnitte: BuildingSection[] = [
    { bezeichnung: 'Turm', laengeM: m.turmLaengeM, hoeheM: m.turmSchaftM, ...tiefe(m.turmBreiteM, m.breiteM), roofForm: m.helmM > 0 ? 'walmdach' : 'flachdach', roofHoeheM: m.helmM, ...(m.helmM > 0 && m.helmEinruesten ? { helmGeruest: true } : {}) },
    { bezeichnung: 'Kirchenschiff', laengeM: m.schiffLaengeM, hoeheM: m.schiffTraufeM, roofForm: 'satteldach', roofHoeheM: m.schiffDachM, geruest: false },
  ]
  if (m.chorLaengeM > 0) abschnitte.push({ bezeichnung: 'Chor', laengeM: m.chorLaengeM, hoeheM: m.chorTraufeM, roofForm: 'satteldach', roofHoeheM: m.chorDachM, geruest: false, ...tiefe(m.chorBreiteM, m.breiteM) })
  const laenge = abschnitte.reduce((s, a) => s + a.laengeM, 0)
  const gesamtH = m.turmSchaftM + m.helmM
  const geschosse = Math.max(1, Math.round(m.turmSchaftM / 3.5))
  return {
    lengthM: laenge, widthM: m.breiteM, heightM: gesamtH, eavesHeightM: m.turmSchaftM, roofHeightM: m.helmM, roofForm: 'flachdach',
    floors: geschosse, floorHeightsM: Array(geschosse).fill(m.turmSchaftM / geschosse),
    windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0,
    sides: ['front', 'back', 'left', 'right'],
    sections: abschnitte,
  }
}

/** Übernimmt die Kirche in vorhandene Gebäudedaten. Ein früher gesetzter Umriss (z. B. aus einer Punktwolke) wird entfernt,
 *  weil im Umriss-Modus die Abschnitte ignoriert würden und das ganze Gebäude eingerüstet würde. */
export function kircheUebernehmen(bisher: BuildingParams, m: KircheMasse): BuildingParams {
  return { ...bisher, ...kircheAlsGebaeude(m), umriss: undefined }
}
