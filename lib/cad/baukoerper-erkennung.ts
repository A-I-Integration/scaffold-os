// ============================================================
// SCAFFOLD OS – Gebäudeteile automatisch erkennen (Schiff, Turm, Chor, Anbau …)
//
// Eingabe: Dreiecke eines 3D-Modells mit Höhe (Meter, x = Ost, z = App-z, h = Höhe).
// Ablauf (reine Geometrie, ohne KI, im Browser):
//   1. Hauptrichtung finden und das Modell dazu gerade ausrichten.
//   2. Höhenkarte (höchster Punkt je Rasterzelle) und Grundfläche bilden.
//   3. Entlang der Länge in Streifen schneiden: Wo sich Tiefe, Lage oder Traufhöhe
//      deutlich ändern, beginnt ein neuer Gebäudeteil.
//   4. Je Teil: Länge, Tiefe, Versatz, Traufhöhe, Dachform und Dachhöhe ableiten.
//   5. Ist ein Teil viel höher und schmaler als der Rest, wird er als Turm vorgeschlagen.
// Das Ergebnis ist ein VORSCHLAG; die Person prüft ihn.
// ============================================================
import { hauptrichtung, dilatiere, erodiere, fuelleInneres, groessteInsel, type Maske, type Punkt2 } from '@/lib/cad/grundriss-erkennung'
import type { BuildingSection } from '@/lib/calculations/cad-engine'

export interface ErkannterTeil {
  laengeM: number
  tiefeM: number
  /** Mittellinie gegenüber der Gebäudemitte, + = nach vorne */
  versatzM: number
  /** Traufhöhe (Wandoberkante) */
  hoeheM: number
  dachHoeheM: number
  dachForm: 'flachdach' | 'satteldach' | 'walmdach'
}

export interface BaukoerperErgebnis {
  teile: ErkannterTeil[]
  /** Tiefe des tiefsten Teils */
  tiefeMaxM: number
  laengeM: number
  /** Höchster Punkt über allem */
  gesamtHoeheM: number
  /** Index des als Turm erkannten Teils (viel höher und schmaler als der Rest), sonst null */
  turmIndex: number | null
  /** true, wenn sich Höhe oder Tiefe zwischen den Teilen deutlich unterscheiden (sonst reicht ein einfacher Umriss) */
  mehrteilig: boolean
  /** true: vorbelegen, dass nur der Turm eingerüstet wird (z. B. wenn der Rest schon im Modell steht oder nur der Turm gemeint ist) */
  nurTurmVorgabe?: boolean
  genauigkeitM: number
  hinweise: string[]
}

const MAX_RASTER = 520
const MIN_ZELLE_M = 0.1

function rasterHoehe(tris: number[][], m: Maske, hk: Float32Array, nx: number, ny: number, ox: number, oy: number, c: number) {
  const setze = (ix: number, iy: number, h: number) => {
    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return
    const i = iy * nx + ix
    m[i] = 1
    if (h > hk[i]) hk[i] = h
  }
  for (const t of tris) {
    const px = [(t[0] - ox) / c, (t[3] - ox) / c, (t[6] - ox) / c]
    const py = [(t[1] - oy) / c, (t[4] - oy) / c, (t[7] - oy) / c]
    const ph = [t[2], t[5], t[8]]
    // Kanten (auch senkrechte Wände ohne Fläche in der Draufsicht)
    for (let e = 0; e < 3; e++) {
      const a = e, b = (e + 1) % 3
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(px[b] - px[a]), Math.abs(py[b] - py[a])) * 2))
      for (let k = 0; k <= n; k++) {
        const f = k / n
        setze(Math.floor(px[a] + (px[b] - px[a]) * f), Math.floor(py[a] + (py[b] - py[a]) * f), ph[a] + (ph[b] - ph[a]) * f)
      }
    }
    const det = (py[1] - py[2]) * (px[0] - px[2]) + (px[2] - px[1]) * (py[0] - py[2])
    if (Math.abs(det) < 1e-9) continue
    const x0 = Math.max(0, Math.floor(Math.min(...px))), x1 = Math.min(nx - 1, Math.floor(Math.max(...px)))
    const y0 = Math.max(0, Math.floor(Math.min(...py))), y1 = Math.min(ny - 1, Math.floor(Math.max(...py)))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const qx = x + 0.5, qy = y + 0.5
      const l1 = ((py[1] - py[2]) * (qx - px[2]) + (px[2] - px[1]) * (qy - py[2])) / det
      const l2 = ((py[2] - py[0]) * (qx - px[2]) + (px[0] - px[2]) * (qy - py[2])) / det
      const l3 = 1 - l1 - l2
      if (l1 >= 0 && l2 >= 0 && l3 >= 0) setze(x, y, l1 * ph[0] + l2 * ph[1] + l3 * ph[2])
    }
  }
}

const median = (a: number[]): number => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }

export function erkenneBaukoerper(tris: number[][]): BaukoerperErgebnis | null {
  if (tris.length < 2) return null
  const alle: Punkt2[] = []
  for (const t of tris) alle.push([t[0], t[1]], [t[3], t[4]], [t[6], t[7]])
  let w = hauptrichtung(alle)
  const drehe = (x: number, z: number, wr: number): Punkt2 => [x * Math.cos(wr) + z * Math.sin(wr), -x * Math.sin(wr) + z * Math.cos(wr)]
  const grenzen = (wr: number) => {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity
    for (const [x, z] of alle) { const [u, v] = drehe(x, z, wr); if (u < a) a = u; if (u > b) b = u; if (v < c) c = v; if (v > d) d = v }
    return { a, b, c, d }
  }
  let g = grenzen(w)
  // Länge soll entlang u laufen (längere Achse)
  if (g.d - g.c > g.b - g.a) { w += Math.PI / 2; g = grenzen(w) }
  const bu = g.b - g.a, bv = g.d - g.c
  if (!(bu > 3 && bv > 3)) return null
  const zelle = Math.max(MIN_ZELLE_M, Math.max(bu, bv) / MAX_RASTER)
  const luecke = Math.max(1, Math.round(0.6 / zelle))
  const glatt = Math.max(1, Math.round(0.8 / zelle))
  const rand = luecke + glatt + 3
  const nx = Math.ceil(bu / zelle) + 2 * rand, ny = Math.ceil(bv / zelle) + 2 * rand
  const ox = g.a - rand * zelle, oy = g.c - rand * zelle
  const gedreht = tris.map((t) => {
    const p1 = drehe(t[0], t[1], w), p2 = drehe(t[3], t[4], w), p3 = drehe(t[6], t[7], w)
    return [p1[0], p1[1], t[2], p2[0], p2[1], t[5], p3[0], p3[1], t[8]]
  })
  let m: Maske = new Uint8Array(nx * ny)
  const hk = new Float32Array(nx * ny).fill(-1)
  rasterHoehe(gedreht, m, hk, nx, ny, ox, oy, zelle)
  m = dilatiere(m, nx, ny, luecke)
  m = fuelleInneres(m, nx, ny)
  m = erodiere(m, nx, ny, luecke)
  m = dilatiere(erodiere(m, nx, ny, glatt), nx, ny, glatt)
  m = erodiere(dilatiere(m, nx, ny, glatt), nx, ny, glatt)
  m = groessteInsel(m, nx, ny)
  // Zellen ohne Höhenwert (hohle Modelle, gefüllte Lücken) bekommen die Höhe der nächsten bekannten Nachbarn
  for (let pass = 0; pass < luecke + glatt + 40; pass++) {
    let geaendert = false
    const neu = hk.slice()
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const i = y * nx + x
      if (!m[i] || hk[i] >= 0) continue
      let best = -1
      if (x > 0 && hk[i - 1] > best) best = hk[i - 1]
      if (x < nx - 1 && hk[i + 1] > best) best = hk[i + 1]
      if (y > 0 && hk[i - nx] > best) best = hk[i - nx]
      if (y < ny - 1 && hk[i + nx] > best) best = hk[i + nx]
      if (best >= 0) { neu[i] = best; geaendert = true }
    }
    hk.set(neu)
    if (!geaendert) break
  }
  // Streifen entlang u
  type Spalte = { vmin: number; vmax: number; eave: number; top: number; n: number }
  const spalten: (Spalte | null)[] = []
  for (let x = 0; x < nx; x++) {
    let vmin = -1, vmax = -1, top = 0, n = 0
    for (let y = 0; y < ny; y++) {
      const i = y * nx + x
      if (!m[i]) continue
      if (vmin < 0) vmin = y
      vmax = y; n++
      if (hk[i] > top) top = hk[i]
    }
    if (vmin < 0) { spalten.push(null); continue }
    // Traufe = Höhe an den beiden Außenrändern der Spalte (kleinerer Wert)
    const rd = (y: number) => Math.max(0, hk[y * nx + x])
    // Der Rand kann ein Stück Dachschräge enthalten: der niedrigere der beiden äußersten Werte ist die Wandoberkante
    const a = Math.min(rd(vmin), rd(Math.min(vmax, vmin + 1)))
    const b = Math.min(rd(vmax), rd(Math.max(vmin, vmax - 1)))
    spalten.push({ vmin, vmax, eave: Math.min(a, b), top, n })
  }
  const xs = spalten.map((s, i) => (s ? i : -1)).filter((i) => i >= 0)
  if (xs.length < 4) return null
  const x0 = xs[0], x1 = xs[xs.length - 1]
  const tolV = Math.max(2, Math.round(0.7 / zelle))
  const tolH = 1.5
  type Streifen = { von: number; bis: number }
  let streifen: Streifen[] = []
  let start = x0
  const ref = (a: number, b: number, key: 'vmin' | 'vmax' | 'eave') => median(spalten.slice(a, b + 1).filter((s): s is Spalte => !!s).map((s) => s[key]))
  for (let x = x0 + 1; x <= x1 + 1; x++) {
    const s = x <= x1 ? spalten[x] : null
    let trennen = x > x1 || !s
    if (!trennen && s) {
      // Vergleich mit den letzten (bis zu) 6 Spalten des laufenden Streifens
      const a = Math.max(start, x - 6)
      trennen = Math.abs(s.vmin - ref(a, x - 1, 'vmin')) > tolV || Math.abs(s.vmax - ref(a, x - 1, 'vmax')) > tolV || Math.abs(s.eave - ref(a, x - 1, 'eave')) > tolH
    }
    if (trennen) { streifen.push({ von: start, bis: x - 1 }); start = x }
  }
  // Zu kurze Streifen (< 2 m) dem ähnlicheren Nachbarn zuschlagen
  const minBreite = Math.max(2, Math.round(2 / zelle))
  for (let runde = 0; runde < 50; runde++) {
    const k = streifen.findIndex((s) => s.bis - s.von + 1 < minBreite)
    if (k < 0 || streifen.length < 2) break
    const kandidaten = [k - 1, k + 1].filter((i) => i >= 0 && i < streifen.length)
    const abstand = (i: number) => { const s = streifen[i], t = streifen[k]; return Math.abs(ref(s.von, s.bis, 'eave') - ref(t.von, t.bis, 'eave')) + Math.abs(ref(s.von, s.bis, 'vmin') - ref(t.von, t.bis, 'vmin')) * zelle + Math.abs(ref(s.von, s.bis, 'vmax') - ref(t.von, t.bis, 'vmax')) * zelle }
    const j = kandidaten.sort((p, q) => abstand(p) - abstand(q))[0]
    const a = Math.min(j, k), b = Math.max(j, k)
    streifen.splice(a, 2, { von: streifen[a].von, bis: streifen[b].bis })
  }
  // Benachbarte, gleiche Streifen zusammenfassen
  const gleich = (s: Streifen, t: Streifen) => Math.abs(ref(s.von, s.bis, 'vmin') - ref(t.von, t.bis, 'vmin')) <= tolV && Math.abs(ref(s.von, s.bis, 'vmax') - ref(t.von, t.bis, 'vmax')) <= tolV && Math.abs(ref(s.von, s.bis, 'eave') - ref(t.von, t.bis, 'eave')) <= tolH
  streifen = streifen.reduce<Streifen[]>((acc, s) => { const l = acc[acc.length - 1]; if (l && gleich(l, s)) l.bis = s.bis; else acc.push({ ...s }); return acc }, [])

  // Gesamtmitte quer
  const gv0 = Math.min(...streifen.map((s) => ref(s.von, s.bis, 'vmin')))
  const gv1 = Math.max(...streifen.map((s) => ref(s.von, s.bis, 'vmax')))
  const mitteGesamt = (gv0 + gv1 + 1) / 2
  const hinweise: string[] = []
  const teile: ErkannterTeil[] = streifen.map((s) => {
    const vmin = ref(s.von, s.bis, 'vmin'), vmax = ref(s.von, s.bis, 'vmax')
    const tiefe = (vmax - vmin + 1) * zelle
    const mitte = (vmin + vmax + 1) / 2
    const eave = ref(s.von, s.bis, 'eave')
    let top = 0, anzahl = 0, oben = 0
    const spitzen: number[] = []
    // Die äußersten Spalten grenzen an den Nachbarteil (dessen Wand bleibt im Raster hängen): für Höhe/Dach weglassen
    const trim = s.bis - s.von + 1 >= Math.round(3 / zelle) ? Math.max(2, Math.round(0.5 / zelle)) : 0
    for (let x = s.von + trim; x <= s.bis - trim; x++) for (let y = 0; y < ny; y++) { const i = y * nx + x; if (m[i]) { anzahl++; if (hk[i] > top) top = hk[i]; spitzen.push(hk[i]) } }
    const dach = Math.max(0, top - eave)
    const laenge = (s.bis - s.von + 1) * zelle
    let form: ErkannterTeil['dachForm'] = 'flachdach'
    if (dach >= 1.0) {
      const schwelle = eave + dach * 0.7
      for (const h of spitzen) if (h >= schwelle) oben++
      const anteil = oben / Math.max(1, anzahl)
      // Spitze: nur wenig Fläche liegt hoch, und das Teil ist ungefähr quadratisch (Pyramide/Helm)
      form = anteil < 0.2 && Math.max(laenge, tiefe) / Math.min(laenge, tiefe) <= 1.8 ? 'walmdach' : 'satteldach'
    }
    return {
      laengeM: Math.round(laenge * 10) / 10,
      tiefeM: Math.round(tiefe * 10) / 10,
      versatzM: Math.round((mitte - mitteGesamt) * zelle * 10) / 10,
      hoeheM: Math.round((form === 'flachdach' ? Math.max(eave, top) : eave) * 10) / 10,
      dachHoeheM: form === 'flachdach' ? 0 : Math.round(dach * 10) / 10,
      dachForm: form,
    }
  })
  const gesamtH = Math.max(...teile.map((t) => t.hoeheM + t.dachHoeheM))
  const hoeheMin = Math.min(...teile.map((t) => t.hoeheM + t.dachHoeheM))
  const tiefeMax = Math.max(...teile.map((t) => t.tiefeM))
  const mehrteilig = teile.length >= 2 && (gesamtH - hoeheMin > 2 || Math.max(...teile.map((t) => t.tiefeM)) - Math.min(...teile.map((t) => t.tiefeM)) > 1.5)
  // Turm: viel höher als alles andere und nicht der größte Teil
  let turmIndex: number | null = null
  if (teile.length >= 2) {
    const hoehen = teile.map((t) => t.hoeheM + t.dachHoeheM)
    const hi = hoehen.indexOf(Math.max(...hoehen))
    const zweit = Math.max(...hoehen.filter((_, i) => i !== hi))
    const flaeche = (t: ErkannterTeil) => t.laengeM * t.tiefeM
    if (hoehen[hi] >= 1.4 * zweit && flaeche(teile[hi]) < Math.max(...teile.map(flaeche))) turmIndex = hi
  }
  if (zelle > 0.4) hinweise.push(`Raster ${zelle.toFixed(2)} m – Maße sind auf etwa ${(zelle * 100).toFixed(0)} cm genau.`)
  return {
    teile,
    tiefeMaxM: Math.round(tiefeMax * 10) / 10,
    laengeM: Math.round(teile.reduce((t, x) => t + x.laengeM, 0) * 10) / 10,
    gesamtHoeheM: Math.round(gesamtH * 10) / 10,
    turmIndex, mehrteilig,
    genauigkeitM: Math.round(zelle * 100) / 100,
    hinweise,
  }
}

/** Baut aus dem Ergebnis die Abschnitte fürs CAD. Jedes Teil wird eingerüstet, der Turm samt Helm; bei `nurTurm` nur der erkannte Turm. */
export function abschnitteAusBaukoerpern(e: BaukoerperErgebnis, nurTurm: boolean): BuildingSection[] {
  return e.teile.map((t, i) => {
    const istTurm = e.turmIndex === i
    return {
      bezeichnung: istTurm ? 'Turm' : e.teile.length === 2 && e.turmIndex !== null ? 'Kirchenschiff' : `Teil ${i + 1}`,
      laengeM: t.laengeM,
      hoeheM: t.hoeheM,
      ...(Math.abs(t.tiefeM - e.tiefeMaxM) > 0.05 ? { tiefeM: t.tiefeM } : {}),
      ...(Math.abs(t.versatzM) > 0.05 ? { versatzM: t.versatzM } : {}),
      roofForm: t.dachForm,
      roofHoeheM: t.dachHoeheM,
      ...(nurTurm && e.turmIndex !== null && !istTurm ? { geruest: false } : {}),
      ...(istTurm && t.dachForm === 'walmdach' ? { helmGeruest: true } : {}),
    } satisfies BuildingSection
  })
}
