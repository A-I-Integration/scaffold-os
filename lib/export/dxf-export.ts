// ============================================================
// SCAFFOLD OS – DXF-Export des Gerüstplans
//
// Schreibt die Zeichnungen (Linien + Text) als ASCII-DXF im Format R12
// (AC1009), das praktisch jedes CAD- und Statik-Programm liest.
// Layer: GEBAEUDE, GERUEST, MASSE, TEXTE. Einheit: Meter.
// Texte werden ohne Sonderzeichen geschrieben (ä→ae, ß→ss), weil R12 keine
// Unicode-Texte kennt.
// ============================================================

import type { Zeichnung, ZLayer } from '@/lib/geruest/plan-zeichnung'

const LAYER: { name: ZLayer; farbe: number }[] = [
  { name: 'GEBAEUDE', farbe: 8 }, { name: 'GERUEST', farbe: 5 }, { name: 'MASSE', farbe: 1 }, { name: 'TEXTE', farbe: 7 },
]

export function dxfText(s: string): string {
  return s
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/²/g, '2').replace(/×/g, 'x').replace(/[·•]/g, '-').replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7e]/g, '?')
}

function zahl(n: number): string {
  return (Math.round(n * 10000) / 10000).toString()
}

/** Zeichnungen untereinander anordnen (Abstand 10 m), jede linksbündig bei x = 0. */
export function ordneUntereinander(zeichnungen: Zeichnung[]): { zeichnung: Zeichnung; dx: number; dy: number }[] {
  let cursor = 0
  return zeichnungen.map((z) => {
    const dx = -z.grenzen.minX
    const dy = cursor - z.grenzen.maxY
    cursor = dy + z.grenzen.minY - 10
    return { zeichnung: z, dx, dy }
  })
}

export function erzeugeDxf(zeichnungen: Zeichnung[]): string {
  const g: (string | number)[] = []
  const add = (code: number, wert: string | number) => { g.push(code, wert) }

  add(0, 'SECTION'); add(2, 'HEADER'); add(9, '$ACADVER'); add(1, 'AC1009'); add(0, 'ENDSEC')

  add(0, 'SECTION'); add(2, 'TABLES')
  add(0, 'TABLE'); add(2, 'LTYPE'); add(70, 2)
  add(0, 'LTYPE'); add(2, 'CONTINUOUS'); add(70, 0); add(3, 'Solid line'); add(72, 65); add(73, 0); add(40, 0)
  add(0, 'LTYPE'); add(2, 'DASHED'); add(70, 0); add(3, '__ __ __'); add(72, 65); add(73, 2); add(40, 0.6); add(49, 0.4); add(49, -0.2)
  add(0, 'ENDTAB')
  add(0, 'TABLE'); add(2, 'LAYER'); add(70, LAYER.length)
  for (const l of LAYER) { add(0, 'LAYER'); add(2, l.name); add(70, 0); add(62, l.farbe); add(6, 'CONTINUOUS') }
  add(0, 'ENDTAB')
  add(0, 'ENDSEC')

  add(0, 'SECTION'); add(2, 'ENTITIES')
  for (const { zeichnung, dx, dy } of ordneUntereinander(zeichnungen)) {
    for (const l of zeichnung.linien) {
      add(0, 'LINE'); add(8, l.layer); if (l.gestrichelt) add(6, 'DASHED')
      add(10, zahl(l.x1 + dx)); add(20, zahl(l.y1 + dy)); add(30, 0)
      add(11, zahl(l.x2 + dx)); add(21, zahl(l.y2 + dy)); add(31, 0)
    }
    for (const t of zeichnung.texte) {
      const h = t.ausrichtung === 'mitte' ? 1 : t.ausrichtung === 'rechts' ? 2 : 0
      // Bei Ausrichtung mittig/rechts steht die Lage im zweiten Punkt (11/21)
      add(0, 'TEXT'); add(8, t.layer)
      add(10, zahl(t.x + dx)); add(20, zahl(t.y + dy)); add(30, 0)
      add(40, zahl(t.hoehe)); add(1, dxfText(t.text))
      if (t.drehungGrad) add(50, t.drehungGrad)
      if (h !== 0) { add(72, h); add(11, zahl(t.x + dx)); add(21, zahl(t.y + dy)); add(31, 0) }
    }
  }
  add(0, 'ENDSEC'); add(0, 'EOF')

  let aus = ''
  for (let i = 0; i < g.length; i += 2) aus += `${g[i]}\r\n${g[i + 1]}\r\n`
  return aus
}
