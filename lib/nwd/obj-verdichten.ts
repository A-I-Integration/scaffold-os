// ============================================================
// SCAFFOLD OS – OBJ-Ergebnis von Autodesk verdichten (Streaming)
//
// Autodesk liefert die Geometrie sehr fein: aus einer NWD mit 3 MB kann eine OBJ-Datei von mehreren hundert MB
// werden (gemessen: 306 MB beim Kirchturm). Das passt weder in den Speicher des Browsers noch in die Ablage.
// Für die Formerkennung (Außenform, Höhen, Teile) reicht ein Bruchteil der Flächen.
//
// Vorgehen: Die Datei wird als Datenstrom gelesen (nie komplett als Text im Speicher), Eckpunkte und Dreiecke kompakt
// gesammelt. Ist die Dreieckszahl über der Grenze, bleibt je Raumzelle (Gitter über das Modell, `zellen` je Achse)
// nur EIN Dreieck erhalten, die Zellen werden bei Bedarf gröber, bis die Grenze erreicht ist. Koordinaten, Einheit
// und Achsen bleiben unverändert; die Ausgabe ist wieder eine einfache OBJ-Datei, die der bestehende OBJ-Weg liest.
// Bekannte Folge: Die Flächen sind ausgedünnt – Außenmaße und Teile bleiben erhalten, feine Details nicht.
// ============================================================

export const VERDICHTEN_MAX_DREIECKE = 400_000
export const VERDICHTEN_ZELLEN = 500

class Zahlen<T extends Float32Array | Uint32Array> {
  daten: T
  n = 0
  constructor(private bauen: (n: number) => T, start = 1 << 16) { this.daten = bauen(start) }
  push(...w: number[]) {
    if (this.n + w.length > this.daten.length) { const neu = this.bauen(this.daten.length * 2); neu.set(this.daten.subarray(0, this.n)); this.daten = neu }
    for (const x of w) this.daten[this.n++] = x
  }
}

export interface VerdichtErgebnis { obj: string; dreieckeVorher: number; dreieckeNachher: number; eckpunkte: number }

/** Liest einen OBJ-Datenstrom (Zeilen „v x y z“ und „f a b c …“) und liefert eine verdichtete OBJ-Datei. */
export async function verdichteObjStrom(
  strom: ReadableStream<Uint8Array>,
  opt: { maxDreiecke?: number; zellen?: number; maxBytes?: number } = {},
): Promise<VerdichtErgebnis> {
  const maxD = opt.maxDreiecke ?? VERDICHTEN_MAX_DREIECKE
  const v = new Zahlen((n) => new Float32Array(n))
  const f = new Zahlen((n) => new Uint32Array(n))
  const leser = strom.getReader()
  const dec = new TextDecoder()
  let rest = ''
  let bytes = 0
  const zeile = (z: string) => {
    const c = z.charCodeAt(0)
    if (c === 118 /* v */ && z.charCodeAt(1) === 32) {
      const t = z.split(/\s+/)
      const x = +t[1], y = +t[2], zz = +t[3]
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(zz)) v.push(x, y, zz); else v.push(0, 0, 0) // Platzhalter hält die Zählung der Indizes stabil
    } else if (c === 102 /* f */ && z.charCodeAt(1) === 32) {
      const t = z.trim().split(/\s+/)
      const anzahl = v.n / 3
      const idx: number[] = []
      for (let i = 1; i < t.length; i++) {
        const k = parseInt(t[i], 10) // „7/3/2“ → 7
        if (!Number.isFinite(k) || k === 0) return
        const j = k > 0 ? k - 1 : anzahl + k // negative Indizes zählen von hinten
        if (j < 0 || j >= anzahl) return
        idx.push(j)
      }
      for (let i = 1; i + 1 < idx.length; i++) f.push(idx[0], idx[i], idx[i + 1]) // Vielecke als Fächer
    }
  }
  for (;;) {
    const { done, value } = await leser.read()
    if (done) break
    bytes += value.byteLength
    if (opt.maxBytes && bytes > opt.maxBytes) { await leser.cancel(); throw new Error(`Das Ergebnis ist zu groß (über ${Math.round(opt.maxBytes / 1048576)} MB).`) }
    rest += dec.decode(value, { stream: true })
    let p: number, start = 0
    while ((p = rest.indexOf('\n', start)) !== -1) { zeile(rest.slice(start, p)); start = p + 1 }
    rest = rest.slice(start)
  }
  rest += dec.decode()
  if (rest) zeile(rest)

  const nV = v.n / 3, nF = f.n / 3
  if (nF === 0 || nV === 0) return { obj: '', dreieckeVorher: 0, dreieckeNachher: 0, eckpunkte: nV }

  let behalten: number[] | null = null
  if (nF > maxD) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < nV; i++) for (let a = 0; a < 3; a++) { const w = v.daten[i * 3 + a]; if (w < lo[a]) lo[a] = w; if (w > hi[a]) hi[a] = w }
    const spanne = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1
    let zellen = opt.zellen ?? VERDICHTEN_ZELLEN
    for (let versuch = 0; versuch < 8; versuch++) {
      const zelle = spanne / zellen
      const belegt = new Set<number>()
      const k: number[] = []
      const N = zellen + 2
      for (let t = 0; t < nF; t++) {
        const a = f.daten[t * 3] * 3, b = f.daten[t * 3 + 1] * 3, c = f.daten[t * 3 + 2] * 3
        const cx = (v.daten[a] + v.daten[b] + v.daten[c]) / 3, cy = (v.daten[a + 1] + v.daten[b + 1] + v.daten[c + 1]) / 3, cz = (v.daten[a + 2] + v.daten[b + 2] + v.daten[c + 2]) / 3
        const key = Math.floor((cx - lo[0]) / zelle) + N * (Math.floor((cy - lo[1]) / zelle) + N * Math.floor((cz - lo[2]) / zelle))
        if (!belegt.has(key)) { belegt.add(key); k.push(t) }
      }
      behalten = k
      if (k.length <= maxD) break
      zellen = Math.max(8, Math.floor(zellen / 1.5))
    }
  }

  // Ausgabe: nur benutzte Eckpunkte, neu nummeriert
  const dreiecke = behalten ?? Array.from({ length: nF }, (_, i) => i)
  const neu = new Int32Array(nV).fill(-1)
  const zeilen: string[] = [`# verdichtet: ${nF} -> ${dreiecke.length} Dreiecke`]
  let m = 0
  const fs: string[] = []
  for (const t of dreiecke) {
    const ids: number[] = []
    for (let a = 0; a < 3; a++) {
      const j = f.daten[t * 3 + a]
      if (neu[j] < 0) { neu[j] = m++; zeilen.push(`v ${v.daten[j * 3]} ${v.daten[j * 3 + 1]} ${v.daten[j * 3 + 2]}`) }
      ids.push(neu[j] + 1)
    }
    fs.push(`f ${ids[0]} ${ids[1]} ${ids[2]}`)
  }
  return { obj: zeilen.join('\n') + '\n' + fs.join('\n') + '\n', dreieckeVorher: nF, dreieckeNachher: dreiecke.length, eckpunkte: m }
}
