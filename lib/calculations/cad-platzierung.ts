// ============================================================
// SCAFFOLD OS – Platzieren und Verschieben von Katalog-Bauteilen im CAD
//
// Eine Stelle für die Regeln, die beim Klick-Platzieren UND beim
// Ziehen gelten: Treppen rasten auf das nächste Feld der Seite/Lage
// ein (Zickzack-Lauf im Feld), alle anderen Bauteile sitzen genau
// am Treffpunkt.
// ============================================================

import type { CADModel, ManualPlacement } from './cad-engine'

type Lage = Pick<ManualPlacement, 'type' | 'positionX' | 'positionY' | 'positionZ' | 'side' | 'levelIndex' | 'fieldId'> & Partial<Pick<ManualPlacement, 'rotationY'>>

type ModellTeil = Pick<CADModel, 'fields'> & Partial<Pick<CADModel, 'levels'>>

/** Nächstes Feld (echter 3D-Abstand zur Feldmitte, Feldmitte = Lagenmitte) zu einem Punkt, im ganzen Gerüst. */
export function naechstesFeld(model: ModellTeil, position: [number, number, number]): ModellTeil['fields'][number] | null {
  let best: ModellTeil['fields'][number] | null = null
  let bestD = Infinity
  for (const f of model.fields) {
    const lage = model.levels?.find((l) => l.index === f.levelIndex)
    const yMitte = f.positionY + (lage ? lage.heightM / 2 : 1)
    const d = (position[0] - f.positionX) ** 2 + (position[1] - yMitte) ** 2 + (position[2] - f.positionZ) ** 2
    if (d < bestD) { bestD = d; best = f }
  }
  return best
}

/** Platzierung (ohne ID) für einen Treffpunkt auf dem Gerüst. */
export function platzierungAusTreffer(
  model: ModellTeil | null,
  type: ManualPlacement['type'],
  position: [number, number, number],
  side: ManualPlacement['side'],
  levelIndex: number,
): Lage {
  const p: Lage = {
    type,
    positionX: position[0],
    positionY: position[1],
    positionZ: position[2],
    side,
    levelIndex,
  }
  // Seite/Lage unbekannt (Klick auf ein Teil ohne Feldbezug, z. B. Fußplatte, Anker): aus dem nächsten Feld ableiten
  if (model && (!side || levelIndex < 0)) {
    const f = naechstesFeld(model, position)
    if (f) { p.side = f.side; p.levelIndex = f.levelIndex }
  }
  // Treppe: rastet auf das nächste Feld im GANZEN Gerüst ein (jede Seite, jede Lage, auch an Umriss-Kanten),
  // nicht nur auf Felder der getroffenen Seite – so lässt sie sich an beliebige Stellen setzen und ziehen.
  if (type === 'stair' && model) {
    const best = naechstesFeld(model, position)
    if (best) {
      p.fieldId = best.id
      p.positionX = best.positionX
      p.positionZ = best.positionZ
      p.side = best.side
      p.levelIndex = best.levelIndex
    }
  }
  // Fangnetz: hängt außen am nächsten Feld der getroffenen Seite/Lage (Geländerhöhe), an der Seitenwand
  // (links/rechts) um 90° gedreht – nicht mitten im Gerüst am Klickpunkt, wo man es nicht sieht.
  if (type === 'net' && model) {
    // Seite/Lage kommen aus dem angeklickten Bauteil – bei Treppen, Ankern u. Ä. fehlen sie
    // (dann 'front'/0). Darum: nächstes Feld im ganzen Gerüst nach echtem Abstand zum Klickpunkt.
    let best: (typeof model.fields)[number] | null = null
    let bestD = Infinity
    for (const f of model.fields) {
      if (f.isCorner) continue
      const d = (position[0] - f.positionX) ** 2 + (position[1] - f.positionY) ** 2 + (position[2] - f.positionZ) ** 2
      if (d < bestD) { bestD = d; best = f }
    }
    if (best) {
      const entlangX = best.side === 'front' || best.side === 'back'
      const aussen = (best.widthM || 0.73) / 2 + 0.03
      p.fieldId = best.id
      p.side = best.side
      p.levelIndex = best.levelIndex
      if (entlangX) {
        p.positionX = best.positionX
        p.positionZ = best.positionZ + (best.side === 'front' ? aussen : -aussen)
      } else {
        p.positionZ = best.positionZ
        p.positionX = best.positionX + (best.side === 'right' ? aussen : -aussen)
        p.rotationY = Math.PI / 2
      }
      const stufe = model.levels?.find((l) => l.index === best.levelIndex && l.id === `level-${best.side}-${best.levelIndex}`) ?? model.levels?.find((l) => l.index === best.levelIndex)
      p.positionY = (stufe ? stufe.bottomY : best.positionY) + 1.0
    }
  }
  // Leiter: steht immer über die ganze Höhe der getroffenen Lage (Mitte der Lage),
  // nicht in Klickhöhe – so hängt sie nie halb in der Luft.
  if (type === 'ladder' && model?.levels) {
    const lage = model.levels.find((l) => l.index === levelIndex)
    if (lage && lage.heightM > 0) p.positionY = lage.bottomY + lage.heightM / 2
  }
  return p
}

/** Verschiebt eine vorhandene Platzierung an einen neuen Treffpunkt; ID und Notizen bleiben. */
export function verschiebePlatzierung(
  model: ModellTeil | null,
  vorher: ManualPlacement,
  position: [number, number, number],
  side: ManualPlacement['side'],
  levelIndex: number,
): ManualPlacement {
  const neu = platzierungAusTreffer(model, vorher.type, position, side, levelIndex)
  // fieldId nur übernehmen, wenn die neue Lage eines liefert (sonst altes Feld nicht mitschleppen)
  return { ...vorher, ...neu, fieldId: neu.fieldId }
}

/** Praktisch dieselbe Lage? Verhindert unnötiges Neuberechnen bei jeder kleinen Mausbewegung. */
export function gleicheLage(a: Lage, b: Lage, toleranzM = 0.03): boolean {
  return (
    a.side === b.side &&
    a.levelIndex === b.levelIndex &&
    (a.fieldId ?? null) === (b.fieldId ?? null) &&
    Math.abs(a.positionX - b.positionX) <= toleranzM &&
    Math.abs(a.positionY - b.positionY) <= toleranzM &&
    Math.abs(a.positionZ - b.positionZ) <= toleranzM
  )
}

/** ID der manuellen Platzierung, zu der ein 3D-Bauteil gehört (Treppen bestehen aus vielen Teilen), sonst null. */
export function platzierungIdVon(componentId: string, placements: { id: string }[]): string | null {
  const pl = placements.find((p) => p.id === componentId || componentId.startsWith(`${p.id}-`))
  return pl ? pl.id : null
}
