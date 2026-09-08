// ============================================================
// SCAFFOLD OS – Topologischer Knoten-Graph (Architektur-Dokument
// Punkt 1: "Topologischer Achs-Graph")
//
// WICHTIGER ARCHITEKTUR-ENTSCHEID: Das bestehende Datenmodell
// (flache components3D-Liste, aus Länge/Höhe/Feldern generiert) bleibt
// UNVERÄNDERT – jede bestehende Funktion (Kollisionsprüfung,
// Regelausführung, Belag-Zuordnung, IFC-Export, Statik-Export) baut
// weiter direkt darauf auf. Ein vollständiger Umbau auf eine reine
// Graph-Datenstruktur hätte all das gefährdet, ohne einen im Rahmen
// dieser Sitzung verantwortbaren Nutzen zu bringen.
//
// Stattdessen: der Knoten-Graph wird HIER, additiv, AUS der
// bestehenden Bauteil-Liste abgeleitet (Nodes an den Rahmen-Enden =
// Lochscheiben/Kupplungspunkte, Edges aus Querriegeln/Diagonalen).
// Das ermöglicht neue, knotenbasierte Prüfungen (siehe
// pruefeKnotenIsolation), ohne die bestehende Pipeline anzufassen.
// ============================================================

import { CADModel, ScaffoldComponent3D } from './cad-engine'

export interface GraphNode {
  id: string
  position: [number, number, number]
  fieldId?: string
  levelId?: string
  hoehenlage: 'unten' | 'oben'
}

export interface GraphEdge {
  id: string
  von: string // GraphNode.id
  bis: string // GraphNode.id
  typ: 'querriegel' | 'diagonale' | 'rahmen'
  componentId: string
}

export interface TopologieGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const TOLERANZ_M = 0.15 // Rundungstoleranz beim Zuordnen von Bauteil-Enden zu Knoten

function distanz(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

function findeOderErstelleNode(nodes: GraphNode[], position: [number, number, number], fieldId: string | undefined, levelId: string | undefined, hoehenlage: 'unten' | 'oben'): GraphNode {
  const vorhanden = nodes.find((n) => distanz(n.position, position) < TOLERANZ_M)
  if (vorhanden) return vorhanden
  const neu: GraphNode = { id: `knoten-${nodes.length}`, position, fieldId, levelId, hoehenlage }
  nodes.push(neu)
  return neu
}

/**
 * Baut den Knoten-Graph aus der bestehenden, flachen Bauteil-Liste.
 * Rahmen (vertikale Stiele) definieren die Knoten an ihrem oberen und
 * unteren Ende; Querriegel und Diagonalen werden als Kanten zwischen
 * den jeweils nächstgelegenen Knoten eingehängt.
 */
export function buildTopologyGraph(model: CADModel): TopologieGraph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // 1) Knoten aus Rahmen-Bauteilen (Stiele) – oberes und unteres Ende
  const rahmen = model.components3D.filter((c) => c.type === 'frame' && c.id.startsWith('frame-'))
  const rahmenEnden = new Map<string, { unten: GraphNode; oben: GraphNode }>()
  for (const r of rahmen) {
    const hoeheHalb = r.scale[1] / 2
    const untenPos: [number, number, number] = [r.position[0], r.position[1] - hoeheHalb, r.position[2]]
    const obenPos: [number, number, number] = [r.position[0], r.position[1] + hoeheHalb, r.position[2]]
    const untenNode = findeOderErstelleNode(nodes, untenPos, r.fieldId, r.levelId, 'unten')
    const obenNode = findeOderErstelleNode(nodes, obenPos, r.fieldId, r.levelId, 'oben')
    rahmenEnden.set(r.id, { unten: untenNode, oben: obenNode })
  }

  // 2) Kanten aus Querriegeln (horizontale Verbindung zweier Knoten
  // derselben Höhenlage) und Diagonalen (Verbindung unten↔oben)
  const horizontalBauteile = model.components3D.filter((c) => (c.type === 'frame' && c.id.startsWith('rail-')) || c.type === 'diagonal' || c.type === 'corner_brace')
  for (const c of horizontalBauteile) {
    const laenge = Math.max(c.scale[0], c.scale[1], c.scale[2])
    const halb = laenge / 2
    // Endpunkte grob aus Position + Rotation um die Bauteilmitte herleiten
    const richtungY = Math.cos(c.rotation[2]) // bei Diagonalen (Rotation um Z) grobe Y-Komponente
    const richtungX = c.scale[0] >= c.scale[1] && c.scale[0] >= c.scale[2] ? 1 : 0 // horizontal entlang X (Querriegel)
    let ende1: [number, number, number], ende2: [number, number, number]
    if (c.type === 'diagonal' || c.type === 'corner_brace') {
      ende1 = [c.position[0], c.position[1] - halb * richtungY, c.position[2]]
      ende2 = [c.position[0], c.position[1] + halb * richtungY, c.position[2]]
    } else if (richtungX) {
      ende1 = [c.position[0] - halb, c.position[1], c.position[2]]
      ende2 = [c.position[0] + halb, c.position[1], c.position[2]]
    } else {
      ende1 = [c.position[0], c.position[1], c.position[2] - halb]
      ende2 = [c.position[0], c.position[1], c.position[2] + halb]
    }
    const node1 = nodes.reduce<GraphNode | null>((best, n) => (distanz(n.position, ende1) < TOLERANZ_M && (!best || distanz(n.position, ende1) < distanz(best.position, ende1)) ? n : best), null)
    const node2 = nodes.reduce<GraphNode | null>((best, n) => (distanz(n.position, ende2) < TOLERANZ_M && (!best || distanz(n.position, ende2) < distanz(best.position, ende2)) ? n : best), null)
    if (node1 && node2 && node1.id !== node2.id) {
      edges.push({ id: `kante-${c.id}`, von: node1.id, bis: node2.id, typ: c.type === 'diagonal' || c.type === 'corner_brace' ? 'diagonale' : 'querriegel', componentId: c.id })
    }
  }

  return { nodes, edges }
}

/**
 * Knoten-Validierung (Architektur-Dokument Punkt 2: "Erkennt sofort,
 * ob an einem Knotenpunkt geometrische Konflikte entstehen"). Hier
 * konkret: findet Knoten OHNE jede Kantenverbindung ("isolierte
 * Knoten") – ein Rahmen-Ende, das an keinem Querriegel/keiner
 * Diagonale hängt, deutet auf eine Lücke in der generierten Struktur
 * hin (bei normal generierten Modellen sollte das nicht vorkommen;
 * wird relevant, sobald künftig einzelne Bauteile manuell entfernt/
 * verändert werden können).
 */
export function pruefeKnotenIsolation(graph: TopologieGraph): GraphNode[] {
  const verbundeneIds = new Set<string>()
  graph.edges.forEach((e) => { verbundeneIds.add(e.von); verbundeneIds.add(e.bis) })
  return graph.nodes.filter((n) => !verbundeneIds.has(n.id))
}
