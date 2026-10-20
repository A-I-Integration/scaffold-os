// ============================================================
// SCAFFOLD OS – Synthetische Mini-IFCs mit bekannten Maßen (Testmodelle für den IFC-Import)
//
// Erzeugt IFC4-Text (STEP) aus einer einfachen Beschreibung: Geschosse (Elevation, Wandhöhe) und je Geschoss ein
// Außenumriss. Jede Umrisskante wird zu einer Wand (IfcWall, extrudiertes Rechteck, Dicke nach innen), so wie ein
// Architekt-Modell Außenwände ablegt. Keine echten Projektdaten: die Maße sind frei gewählt und dienen nur dazu,
// dass der Leser gegen bekannte Werte geprüft werden kann.
//
// Datei schreiben: `node scripts/erzeuge-ifc-testmodelle.mjs` (legt die drei Standardmodelle in
// lib/cad/__tests__/fixtures/ ab). Die Tests rufen die Funktionen direkt auf.
// ============================================================

export interface IfcGeschossSpez {
  name: string
  /** Elevation in Metern (Oberkante Fertigfußboden, wie IfcBuildingStorey.Elevation) */
  elevationM: number
  /** Wandhöhe dieses Geschosses in Metern */
  wandHoeheM: number
  /** Außenumriss, gegen den Uhrzeigersinn, in Metern */
  umriss: [number, number][]
}

export interface IfcSpez {
  geschosse: IfcGeschossSpez[]
  wandDickeM?: number
  /** 'MILLI' = Modell in Millimetern angelegt (Elevation und Maße in mm geschrieben) */
  einheit?: 'METRE' | 'MILLI'
  /** Zusätzlich ein Dach-Element (IfcRoof) über dem obersten Geschoss */
  mitDach?: boolean
}

const BASE64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'
function guid(n: number): string {
  // 22 Zeichen, deterministisch (Zähler), gültiger IFC-GUID-Zeichensatz
  let s = ''
  let v = n + 1
  for (let i = 0; i < 22; i++) { s = BASE64[v % 64] + s; v = Math.floor(v / 64) + (i === 20 ? 0 : 0) }
  return s
}

/** Zahl als IFC-REAL (immer mit Dezimalpunkt) */
const r = (v: number): string => {
  const t = Number(v.toFixed(6)).toString()
  return /[.eE]/.test(t) ? t : t + '.'
}

export function erzeugeIfc(spez: IfcSpez): string {
  const dicke = spez.wandDickeM ?? 0.2
  const f = spez.einheit === 'MILLI' ? 1000 : 1
  const z: string[] = []
  let id = 100
  const neu = (text: (i: number) => string): number => { const i = id++; z.push(`#${i}=${text(i)};`); return i }
  let g = 0

  const ursprung = neu(() => `IFCCARTESIANPOINT((0.,0.,0.))`)
  const achse0 = neu(() => `IFCAXIS2PLACEMENT3D(#${ursprung},$,$)`)
  const kontext = neu(() => `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${achse0},$)`)
  const koerper = neu(() => `IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${kontext},$,.MODEL_VIEW.,$)`)
  const si = neu(() => (f === 1 ? `IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)` : `IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)`))
  const einheiten = neu(() => `IFCUNITASSIGNMENT((#${si}))`)
  const projekt = neu(() => `IFCPROJECT('${guid(g++)}',$,'Testprojekt',$,$,$,$,(#${kontext}),#${einheiten})`)

  const platz = (rel: number | null, x: number, y: number, zz: number, dir?: [number, number]): number => {
    const p = neu(() => `IFCCARTESIANPOINT((${r(x)},${r(y)},${r(zz)}))`)
    const rd = dir ? neu(() => `IFCDIRECTION((${r(dir[0])},${r(dir[1])},0.))`) : null
    const a = neu(() => `IFCAXIS2PLACEMENT3D(#${p},$,${rd ? '#' + rd : '$'})`)
    return neu(() => `IFCLOCALPLACEMENT(${rel ? '#' + rel : '$'},#${a})`)
  }

  const standort = neu(() => `IFCSITE('${guid(g++)}',$,'Grundstück',$,$,#${platz(null, 0, 0, 0)},$,$,.ELEMENT.,$,$,$,$,$)`)
  const gebPlatz = platz(null, 0, 0, 0)
  const gebaeude = neu(() => `IFCBUILDING('${guid(g++)}',$,'Haus',$,$,#${gebPlatz},$,$,.ELEMENT.,$,$,$)`)
  const kinderStandort: number[] = [gebaeude]
  neu(() => `IFCRELAGGREGATES('${guid(g++)}',$,$,$,#${projekt},(#${standort}))`)
  neu(() => `IFCRELAGGREGATES('${guid(g++)}',$,$,$,#${standort},(#${kinderStandort[0]}))`)

  const geschossIds: number[] = []
  const inGeschoss: number[][] = []
  const roofSpez = spez.mitDach ? spez.geschosse[spez.geschosse.length - 1] : null

  const extrusion = (profilBreite: number, profilTiefe: number, hoehe: number): number => {
    const p2 = neu(() => `IFCCARTESIANPOINT((0.,0.))`)
    const a2 = neu(() => `IFCAXIS2PLACEMENT2D(#${p2},$)`)
    const prof = neu(() => `IFCRECTANGLEPROFILEDEF(.AREA.,$,#${a2},${r(profilBreite)},${r(profilTiefe)})`)
    const dir = neu(() => `IFCDIRECTION((0.,0.,1.))`)
    const sp = neu(() => `IFCCARTESIANPOINT((0.,0.,0.))`)
    const sa = neu(() => `IFCAXIS2PLACEMENT3D(#${sp},$,$)`)
    const solid = neu(() => `IFCEXTRUDEDAREASOLID(#${prof},#${sa},#${dir},${r(hoehe)})`)
    const rep = neu(() => `IFCSHAPEREPRESENTATION(#${koerper},'Body','SweptSolid',(#${solid}))`)
    return neu(() => `IFCPRODUCTDEFINITIONSHAPE($,$,(#${rep}))`)
  }

  spez.geschosse.forEach((gs, si) => {
    const pl = platz(gebPlatz, 0, 0, gs.elevationM * f)
    const ge = neu(() => `IFCBUILDINGSTOREY('${guid(g++)}',$,'${gs.name}',$,$,#${pl},$,$,.ELEMENT.,${r(gs.elevationM * f)})`)
    geschossIds.push(ge)
    const elemente: number[] = []
    const n = gs.umriss.length
    for (let i = 0; i < n; i++) {
      const [ax, ay] = gs.umriss[i], [bx, by] = gs.umriss[(i + 1) % n]
      const len = Math.hypot(bx - ax, by - ay)
      if (len < 1e-9) continue
      const dx = (bx - ax) / len, dy = (by - ay) / len
      // Wie im echten Modell sind Wände an einspringenden Ecken verbunden: die Wand wird dort um die Dicke verlängert
      const [cx2, cy2] = gs.umriss[(i + 2) % n]
      const nx2 = cx2 - bx, ny2 = cy2 - by
      const einspringend = dx * ny2 - dy * nx2 < -1e-9
      const lang = len + (einspringend ? dicke : 0)
      // nach innen (links der Laufrichtung bei Umlauf gegen den Uhrzeigersinn) um halbe Dicke versetzte Mittellinie
      const mx = (ax + bx) / 2 - dy * (dicke / 2) + (einspringend ? (dx * dicke) / 2 : 0), my = (ay + by) / 2 + dx * (dicke / 2) + (einspringend ? (dy * dicke) / 2 : 0)
      const wp = platz(pl, mx * f, my * f, 0, [dx, dy])
      const form = extrusion(lang * f, dicke * f, gs.wandHoeheM * f)
      elemente.push(neu(() => `IFCWALL('${guid(g++)}',$,'Wand ${gs.name} ${i + 1}',$,$,#${wp},#${form},$,.STANDARD.)`))
    }
    if (roofSpez && si === spez.geschosse.length - 1) {
      // Dach als Platte über dem obersten Geschoss (Umrissrechteck der Bounding-Box, 0,3 m dick)
      const xs = gs.umriss.map((p) => p[0]), ys = gs.umriss.map((p) => p[1])
      const w = Math.max(...xs) - Math.min(...xs), d = Math.max(...ys) - Math.min(...ys)
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2
      const rp = platz(pl, cx * f, cy * f, gs.wandHoeheM * f)
      const form = extrusion(w * f, d * f, 0.3 * f)
      elemente.push(neu(() => `IFCROOF('${guid(g++)}',$,'Dach',$,$,#${rp},#${form},$,.FLAT_ROOF.)`))
    }
    inGeschoss.push(elemente)
  })

  neu(() => `IFCRELAGGREGATES('${guid(g++)}',$,$,$,#${gebaeude},(${geschossIds.map((i) => '#' + i).join(',')}))`)
  geschossIds.forEach((ge, i) => {
    if (inGeschoss[i].length) neu(() => `IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(g++)}',$,$,$,(${inGeschoss[i].map((e) => '#' + e).join(',')}),#${ge})`)
  })

  return [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');`,
    `FILE_NAME('testmodell.ifc','2026-01-01T00:00:00',('SCAFFOLD OS Test'),(''),'','','');`,
    `FILE_SCHEMA(('IFC4'));`,
    'ENDSEC;',
    'DATA;',
    ...z,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}

// ---------------------------------------------------------------- Standardmodelle (bekannte Maße)

const rechteck = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

/** Einfaches Haus: 12 m × 8 m, 2 Geschosse (EG 0,00 / OG 2,80), Wandhöhe je 2,80 m → Traufe 5,60 m */
export const HAUS_MASSE = { laengeM: 12, breiteM: 8, elevationen: [0, 2.8], wandHoeheM: 2.8, traufeM: 5.6 }
export function hausZweiGeschosse(opt: Partial<IfcSpez> = {}): string {
  const u = rechteck(0, 0, 12, 8)
  return erzeugeIfc({ geschosse: [
    { name: 'EG', elevationM: 0, wandHoeheM: 2.8, umriss: u },
    { name: 'OG', elevationM: 2.8, wandHoeheM: 2.8, umriss: u },
  ], ...opt })
}

/** L-Form: 14 m × 10 m, rechts oben ein 6 m × 5 m großer Ausschnitt → 6 Ecken, Fläche 110 m² */
export const L_FORM_MASSE = { umriss: [[0, 0], [14, 0], [14, 5], [8, 5], [8, 10], [0, 10]] as [number, number][], flaecheM2: 14 * 10 - 6 * 5, ecken: 6, elevationen: [0, 3], traufeM: 6 }
export function lFormHaus(opt: Partial<IfcSpez> = {}): string {
  return erzeugeIfc({ geschosse: [
    { name: 'EG', elevationM: 0, wandHoeheM: 3, umriss: L_FORM_MASSE.umriss },
    { name: 'OG', elevationM: 3, wandHoeheM: 3, umriss: L_FORM_MASSE.umriss },
  ], ...opt })
}

/** Haus 10 m × 8 m mit 2 Geschossen (Traufe 6,00 m) und eingeschossigem Anbau 5 m × 4 m an der Schmalseite (Traufe 3,00 m) */
export const ANBAU_MASSE = { haus: { laengeM: 10, breiteM: 8, traufeM: 6 }, anbau: { laengeM: 5, breiteM: 4, traufeM: 3 }, elevationen: [0, 3] }
export function hausMitAnbau(opt: Partial<IfcSpez> = {}): string {
  const haus = rechteck(0, 0, 10, 8)
  // Anbau schließt rechts an (x 10 … 15, y 0 … 4); gemeinsame Außenwand liegt auf dem Hausumriss
  const eg: [number, number][] = [[0, 0], [15, 0], [15, 4], [10, 4], [10, 8], [0, 8]]
  return erzeugeIfc({ geschosse: [
    { name: 'EG', elevationM: 0, wandHoeheM: 3, umriss: eg },
    { name: 'OG', elevationM: 3, wandHoeheM: 3, umriss: haus },
  ], ...opt })
}
