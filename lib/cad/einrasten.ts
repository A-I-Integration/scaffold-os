// ============================================================
// SCAFFOLD OS – Einrasten beim Platzieren (reine Funktionen, ändern das Modell nicht)
//
// Ein Bauteil wird an einer Wunschposition gehalten; gesucht wird die kleinste Verschiebung, mit der möglichst viele seiner
// Anschlusspunkte auf verträgliche Anschlusspunkte vorhandener Bauteile fallen. Grundlage sind die ABGELEITETEN Anschlusspunkte
// aus anschluesse.ts (keine Herstellerdaten). Gedreht wird hier nicht; für die Drehung gibt es nur `rasteWinkel`.
// ============================================================
import { ports, kompatibel, ANSCHLUSS_TOLERANZ_M, type Port, type PortBauteil, type V3 } from '@/lib/cad/anschluesse'

export const EINRAST_RADIUS_M = 0.15

/** Raster über Anschlusspunkte (Zellkante = Suchradius) für Abfragen in der Nähe eines Punkts. */
export class PortIndex {
  private readonly zellen = new Map<string, Port[]>()
  readonly zelleM: number
  readonly anzahl: number
  constructor(bauteile: PortBauteil[], zelleM = EINRAST_RADIUS_M) {
    this.zelleM = Math.max(zelleM, 1e-6)
    let n = 0
    for (const c of bauteile) for (const p of ports(c)) {
      const k = this.schluessel(p.pos)
      const l = this.zellen.get(k)
      if (l) l.push(p); else this.zellen.set(k, [p])
      n++
    }
    this.anzahl = n
  }
  private idx(v: number) { return Math.floor(v / this.zelleM) }
  private schluessel(p: V3) { return `${this.idx(p[0])}|${this.idx(p[1])}|${this.idx(p[2])}` }
  /** Alle Anschlusspunkte innerhalb von `radiusM` um `pos` (Radius darf nicht größer als die Zellkante sein). */
  nahe(pos: V3, radiusM: number): Port[] {
    const r = Math.min(radiusM, this.zelleM)
    const ix = this.idx(pos[0]), iy = this.idx(pos[1]), iz = this.idx(pos[2])
    const out: Port[] = []
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const q of this.zellen.get(`${ix + dx}|${iy + dy}|${iz + dz}`) ?? []) {
        if (Math.hypot(q.pos[0] - pos[0], q.pos[1] - pos[1], q.pos[2] - pos[2]) <= r) out.push(q)
      }
    }
    return out
  }
}

export interface EinrastVorschlag {
  /** Verschiebung, die zur Wunschposition addiert wird */
  versatz: V3
  /** Wie viele Anschlusspunkte des Bauteils danach auf verträglichen Punkten liegen */
  anzahl: number
  /** Gewichtete Wertung (Stiel auf Stiel zählt 3, alles andere 1); danach wird gerangt */
  wertung: number
  paare: { eigen: Port; ziel: Port }[]
  /** Länge des Versatzes in m */
  weiteM: number
}

const gewicht = (a: Port, b: Port) => ((a.typ === 'stiel-kopf' && b.typ === 'stiel-fuss') || (a.typ === 'stiel-fuss' && b.typ === 'stiel-kopf') ? 3 : 1)

/**
 * Bestes Einrasten für `bauteil` an seiner aktuellen Position oder null, wenn nichts in Reichweite verträglich ist.
 * Rangfolge: höhere Wertung (Stiel auf Stiel zählt dreifach, weil er tragend ist), dann kleinerer Versatz. Bauteile mit gleicher id wie `bauteil` zählen nicht als Ziel.
 */
export function schlageEinrastenVor(bauteil: PortBauteil, index: PortIndex, radiusM = EINRAST_RADIUS_M, toleranzM = ANSCHLUSS_TOLERANZ_M): EinrastVorschlag | null {
  const eigene = ports(bauteil)
  if (!eigene.length) return null
  const kandidaten = new Map<string, V3>()
  for (const e of eigene) {
    for (const z of index.nahe(e.pos, radiusM)) {
      if (z.bauteilId === bauteil.id || !kompatibel(e, z).ok) continue
      const t: V3 = [z.pos[0] - e.pos[0], z.pos[1] - e.pos[1], z.pos[2] - e.pos[2]]
      kandidaten.set(t.map((x) => Math.round(x * 1000)).join('|'), t)
    }
  }
  let bester: EinrastVorschlag | null = null
  for (const t of kandidaten.values()) {
    const paare: EinrastVorschlag['paare'] = []
    for (const e of eigene) {
      const verschoben: V3 = [e.pos[0] + t[0], e.pos[1] + t[1], e.pos[2] + t[2]]
      const ziel = index.nahe(verschoben, toleranzM).find((z) => z.bauteilId !== bauteil.id && kompatibel({ ...e, pos: verschoben }, z).ok)
      if (ziel) paare.push({ eigen: e, ziel })
    }
    const weite = Math.hypot(t[0], t[1], t[2])
    const wertung = paare.reduce((n, p) => n + gewicht(p.eigen, p.ziel), 0)
    if (!bester || wertung > bester.wertung || (wertung === bester.wertung && weite < bester.weiteM)) bester = { versatz: t, anzahl: paare.length, wertung, paare, weiteM: weite }
  }
  return bester
}

/** Winkel (Grad) auf das nächste Vielfache von `schrittGrad` runden, wenn er höchstens `toleranzGrad` davon entfernt ist; sonst unverändert. */
export function rasteWinkel(grad: number, schrittGrad = 90, toleranzGrad = 5): number {
  const n = Math.round(grad / schrittGrad) * schrittGrad
  return Math.abs(grad - n) <= toleranzGrad ? n : grad
}

export interface BauteilEinrastung { position: V3; vorschlag: EinrastVorschlag | null }

/**
 * Für den Verschiebe-Griff: Position des Bauteils `id` nach dem Loslassen an `zielPosition`, wenn möglich auf Anschlüsse eingerastet.
 * `bauteile` enthält das Bauteil selbst (es wird als Ziel ignoriert). Unbekannte id oder nichts in Reichweite: Zielposition unverändert.
 */
export function rasteBauteilAnAnschluesse(bauteile: PortBauteil[], id: string, zielPosition: V3, radiusM = EINRAST_RADIUS_M): BauteilEinrastung {
  const c = bauteile.find((b) => b.id === id)
  if (!c) return { position: zielPosition, vorschlag: null }
  const index = new PortIndex(bauteile.filter((b) => b.id !== id && Math.hypot(b.position[0] - zielPosition[0], b.position[1] - zielPosition[1], b.position[2] - zielPosition[2]) < 12), radiusM)
  const v = schlageEinrastenVor({ ...c, position: zielPosition }, index, radiusM)
  if (!v) return { position: zielPosition, vorschlag: null }
  return { position: [zielPosition[0] + v.versatz[0], zielPosition[1] + v.versatz[1], zielPosition[2] + v.versatz[2]], vorschlag: v }
}
