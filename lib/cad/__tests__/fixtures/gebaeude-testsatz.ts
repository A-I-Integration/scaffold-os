// Testsatz für die Gebäude-Erkennung: fünf Modelle mit BEKANNTEN Maßen (selbst erzeugt, keine echten Kundendaten).
// Koordinaten: x = Länge, y = Tiefe, z = Höhe (Z oben), Meter.
export type P3 = [number, number, number]
export type Tri = [P3, P3, P3]

const q = (a: P3, b: P3, c: P3, d: P3): Tri[] => [[a, b, c], [a, c, d]]
/** Quader ohne Boden, Wände und flaches Dach */
export const kasten = (x0: number, y0: number, x1: number, y1: number, h: number): Tri[] => [
  ...q([x0, y0, 0], [x1, y0, 0], [x1, y0, h], [x0, y0, h]), ...q([x1, y0, 0], [x1, y1, 0], [x1, y1, h], [x1, y0, h]),
  ...q([x1, y1, 0], [x0, y1, 0], [x0, y1, h], [x1, y1, h]), ...q([x0, y1, 0], [x0, y0, 0], [x0, y0, h], [x0, y1, h]),
  ...q([x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]),
]
/** Pyramidenhelm auf einem Turm */
export const helm = (x0: number, y0: number, x1: number, y1: number, h: number, d: number): Tri[] => {
  const s: P3 = [(x0 + x1) / 2, (y0 + y1) / 2, h + d]
  return [[[x0, y0, h], [x1, y0, h], s], [[x1, y0, h], [x1, y1, h], s], [[x1, y1, h], [x0, y1, h], s], [[x0, y1, h], [x0, y0, h], s]]
}
/** Satteldach, First entlang x */
export const sattel = (x0: number, y0: number, x1: number, y1: number, h: number, d: number): Tri[] => {
  const ym = (y0 + y1) / 2
  return [...q([x0, y0, h], [x1, y0, h], [x1, ym, h + d], [x0, ym, h + d]), ...q([x0, ym, h + d], [x1, ym, h + d], [x1, y1, h], [x0, y1, h]),
    [[x0, y0, h], [x0, ym, h + d], [x0, y1, h]], [[x1, y0, h], [x1, y1, h], [x1, ym, h + d]]]
}

export interface SollTeil { laengeM: number; tiefeM: number; hoeheM: number; dachHoeheM: number; dachForm: 'flachdach' | 'satteldach' | 'walmdach'; versatzBetragM: number }
export interface Testgebaeude { name: string; dreiecke: Tri[]; soll: SollTeil[] }

const kircheA = (): Testgebaeude => ({
  name: 'Kirche mit Turm, Schiff und Chor',
  dreiecke: [...kasten(0, 1.5, 9, 10.5, 45), ...helm(0, 1.5, 9, 10.5, 45, 13), ...kasten(9, 0, 39, 12, 12), ...sattel(9, 0, 39, 12, 12, 8), ...kasten(39, 1.5, 46, 10.5, 9), ...sattel(39, 1.5, 46, 10.5, 9, 6)],
  soll: [
    { laengeM: 9, tiefeM: 9, hoeheM: 45, dachHoeheM: 13, dachForm: 'walmdach', versatzBetragM: 0 },
    { laengeM: 30, tiefeM: 12, hoeheM: 12, dachHoeheM: 8, dachForm: 'satteldach', versatzBetragM: 0 },
    { laengeM: 7, tiefeM: 9, hoeheM: 9, dachHoeheM: 6, dachForm: 'satteldach', versatzBetragM: 0 },
  ],
})
const kircheB = (): Testgebaeude => ({
  name: 'Kirche mit schlankem Turm am Ende',
  dreiecke: [...kasten(0, 0, 24, 14, 10), ...sattel(0, 0, 24, 14, 10, 9), ...kasten(24, 3.5, 31, 10.5, 38), ...helm(24, 3.5, 31, 10.5, 38, 16)],
  soll: [
    { laengeM: 24, tiefeM: 14, hoeheM: 10, dachHoeheM: 9, dachForm: 'satteldach', versatzBetragM: 0 },
    { laengeM: 7, tiefeM: 7, hoeheM: 38, dachHoeheM: 16, dachForm: 'walmdach', versatzBetragM: 0 },
  ],
})
const lForm = (): Testgebaeude => ({
  name: 'L-förmiges Haus',
  dreiecke: [...kasten(0, 0, 10, 30, 9), ...kasten(10, 0, 30, 10, 9)],
  soll: [
    { laengeM: 10, tiefeM: 30, hoeheM: 9, dachHoeheM: 0, dachForm: 'flachdach', versatzBetragM: 0 },
    { laengeM: 20, tiefeM: 10, hoeheM: 9, dachHoeheM: 0, dachForm: 'flachdach', versatzBetragM: 10 },
  ],
})
const gestuft = (): Testgebaeude => ({
  name: 'Gestuftes Gebäude (9, 12, 15 m)',
  dreiecke: [...kasten(0, 0, 12, 11, 9), ...kasten(12, 0, 24, 11, 12), ...kasten(24, 0, 36, 11, 15)],
  soll: [9, 12, 15].map((h) => ({ laengeM: 12, tiefeM: 11, hoeheM: h, dachHoeheM: 0, dachForm: 'flachdach' as const, versatzBetragM: 0 })),
})
const halle = (): Testgebaeude => ({
  name: 'Halle mit Bürotrakt',
  dreiecke: [...kasten(0, 0, 50, 25, 8), ...kasten(50, 7.5, 62, 17.5, 4)],
  soll: [
    { laengeM: 50, tiefeM: 25, hoeheM: 8, dachHoeheM: 0, dachForm: 'flachdach', versatzBetragM: 0 },
    { laengeM: 12, tiefeM: 10, hoeheM: 4, dachHoeheM: 0, dachForm: 'flachdach', versatzBetragM: 0 },
  ],
})

export const TESTSATZ: Testgebaeude[] = [kircheA(), kircheB(), lForm(), gestuft(), halle()]

export interface Transform { drehungGrad?: number; skala?: number; verschiebung?: P3 }
/** Dreht um die senkrechte Achse, skaliert (z. B. 100 = Zentimeter) und verschiebt. */
export function transformiere(tris: Tri[], t: Transform): Tri[] {
  const w = ((t.drehungGrad ?? 0) * Math.PI) / 180, c = Math.cos(w), s = Math.sin(w), k = t.skala ?? 1, v = t.verschiebung ?? [0, 0, 0]
  const f = ([x, y, z]: P3): P3 => [(x * c - y * s) * k + v[0], (x * s + y * c) * k + v[1], z * k + v[2]]
  return tris.map(([a, b, d]) => [f(a), f(b), f(d)])
}

/** OBJ-Text; `oben` = welche Achse in der Datei nach oben zeigt. */
export function alsObj(tris: Tri[], oben: 'y' | 'z'): string {
  const zeile = (p: P3) => (oben === 'z' ? `v ${p[0]} ${p[1]} ${p[2]}` : `v ${p[0]} ${p[2]} ${-p[1]}`)
  return tris.map((t) => t.map(zeile).join('\n')).join('\n') + '\n' + tris.map((_, i) => `f ${i * 3 + 1} ${i * 3 + 2} ${i * 3 + 3}`).join('\n')
}
