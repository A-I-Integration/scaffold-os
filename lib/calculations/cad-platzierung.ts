// ============================================================
// SCAFFOLD OS – Platzieren und Verschieben von Katalog-Bauteilen im CAD
//
// Eine Stelle für die Regeln, die beim Klick-Platzieren UND beim
// Ziehen gelten: Treppen rasten auf das nächste Feld der Seite/Lage
// ein (Zickzack-Lauf im Feld), alle anderen Bauteile sitzen genau
// am Treffpunkt.
// ============================================================

import type { CADModel, ManualPlacement } from './cad-engine'

type Lage = Pick<ManualPlacement, 'type' | 'positionX' | 'positionY' | 'positionZ' | 'side' | 'levelIndex' | 'fieldId'>

/** Platzierung (ohne ID) für einen Treffpunkt auf dem Gerüst. */
export function platzierungAusTreffer(
  model: Pick<CADModel, 'fields'> | null,
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
  if (type === 'stair' && model) {
    const lage = model.fields.filter((f) => f.side === side && f.levelIndex === levelIndex)
    const entlangX = side === 'front' || side === 'back'
    let best: (typeof lage)[number] | null = null
    let bestD = Infinity
    for (const f of lage) {
      const d = Math.abs(entlangX ? position[0] - f.positionX : position[2] - f.positionZ)
      if (d < bestD) { bestD = d; best = f }
    }
    if (best) {
      p.fieldId = best.id
      p.positionX = best.positionX
      p.positionZ = best.positionZ
    }
  }
  return p
}

/** Verschiebt eine vorhandene Platzierung an einen neuen Treffpunkt; ID und Notizen bleiben. */
export function verschiebePlatzierung(
  model: Pick<CADModel, 'fields'> | null,
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
