// Einrasten beim Setzen neuer Katalogteile (Art B: Klick + Einrasten, Art C: genaue Koordinaten):
// das Teil wird probeweise mit der normalen Platzierungslogik gebaut und an verträgliche Anschlusspunkte vorhandener Bauteile gelegt.
// Die Anschlusspunkte sind abgeleitet (siehe anschluesse.ts), keine Herstellerdaten. Ohne Treffer bleibt die Platzierung unverändert.
import { addManualPlacement, type CADModel, type ManualPlacement } from '@/lib/calculations/cad-engine'
import { rasteBauteilAnAnschluesse, EINRAST_RADIUS_M } from '@/lib/cad/einrasten'

export function rastePlatzierung(model: CADModel, placement: ManualPlacement, radiusM = EINRAST_RADIUS_M): ManualPlacement {
  // Treppe und Gerüstfeld folgen ihrer eigenen Feldlogik
  if (placement.type === 'stair' || placement.type === 'geruestfeld') return placement
  const probe = addManualPlacement(model, placement)
  const teil = probe.components3D.find((c) => c.id === placement.id)
  if (!teil) return placement
  const r = rasteBauteilAnAnschluesse(probe.components3D, placement.id, teil.position as [number, number, number], radiusM)
  if (!r.vorschlag) return placement
  return { ...placement, positionX: placement.positionX + (r.position[0] - teil.position[0]), positionY: placement.positionY + (r.position[1] - teil.position[1]), positionZ: placement.positionZ + (r.position[2] - teil.position[2]) }
}
