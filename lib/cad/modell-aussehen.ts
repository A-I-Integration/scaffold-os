// ============================================================
// SCAFFOLD OS – Aussehen des echten Gebäudes (nur zur Anzeige im 3D-Modell)
//
// Zwei Quellen:
//  • GLB (glTF binär) mit Texturen/Materialien: wird beim Anzeigen vom GLTFLoader gelesen
//  • PLY-Punktwolke mit Farben (ASCII oder binär little-endian): Punkte + RGB, für die Anzeige auf max. 400 000 Punkte ausgedünnt
// Die Datei verändert weder Maße noch Gerüst, sie ist ein Bild des Bestands. Alles läuft im Browser.
// ============================================================

export const PUNKTE_MAX = 400_000
export const AUSSEHEN_MAX_BYTES = 120 * 1024 * 1024

export type Aussehen =
  | { art: 'glb'; name: string; daten: ArrayBuffer }
  | { art: 'punkte'; name: string; positionen: Float32Array; farben: Uint8Array }

export type AussehenErgebnis = { ok: true; aussehen: Aussehen; hinweis?: string } | { ok: false; meldung: string }

const GROESSE: Record<string, number> = { char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2, int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 }

export function istGlb(daten: ArrayBuffer): boolean {
  if (daten.byteLength < 20) return false
  const v = new DataView(daten)
  return v.getUint32(0, true) === 0x46546c67 // "glTF"
}

interface PlyKopf { elemente: { name: string; anzahl: number; felder: { name: string; typ: string }[] }[]; format: string; datenStart: number }

function leseKopf(bytes: Uint8Array): PlyKopf | null {
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 65536)))
  const ende = text.indexOf('end_header')
  if (!text.startsWith('ply') || ende < 0) return null
  let datenStart = ende + 'end_header'.length
  if (text[datenStart] === '\r') datenStart++
  if (text[datenStart] === '\n') datenStart++
  const elemente: PlyKopf['elemente'] = []
  let format = ''
  for (const zeile of text.slice(0, ende).split(/\r?\n/)) {
    const t = zeile.trim().split(/\s+/)
    if (t[0] === 'format') format = t[1]
    else if (t[0] === 'element') elemente.push({ name: t[1], anzahl: Number(t[2]), felder: [] })
    else if (t[0] === 'property' && elemente.length) {
      if (t[1] === 'list') elemente[elemente.length - 1].felder.push({ name: t[4], typ: 'list' })
      else elemente[elemente.length - 1].felder.push({ name: t[2], typ: t[1] })
    }
  }
  return { elemente, format, datenStart }
}

/** Farbige PLY-Punktwolke lesen. Ohne Farben wird abgelehnt (dann gibt es nichts Schöneres als die Box zu zeigen). */
export function aussehenAusPly(daten: ArrayBuffer, name: string): AussehenErgebnis {
  const bytes = new Uint8Array(daten)
  const kopf = leseKopf(bytes)
  if (!kopf) return { ok: false, meldung: 'Die PLY-Datei hat keinen lesbaren Kopf.' }
  const vert = kopf.elemente[0]
  if (!vert || vert.name !== 'vertex' || !(vert.anzahl > 0)) return { ok: false, meldung: 'In der PLY-Datei wurden keine Punkte gefunden.' }
  if (vert.felder.some((f) => f.typ === 'list')) return { ok: false, meldung: 'Diese PLY-Datei enthält Flächen statt einer Punktwolke. Bitte als GLB oder als PLY-Punktwolke mit Farben exportieren.' }
  const idx = (n: string) => vert.felder.findIndex((f) => f.name === n)
  const ix = idx('x'), iy = idx('y'), iz = idx('z'), ir = idx('red'), ig = idx('green'), ib = idx('blue')
  if (ix < 0 || iy < 0 || iz < 0) return { ok: false, meldung: 'In der PLY-Datei fehlen die Koordinaten x, y, z.' }
  if (ir < 0 || ig < 0 || ib < 0) return { ok: false, meldung: 'Die PLY-Datei hat keine Farben (red, green, blue). Für die Anzeige brauche ich eine Punktwolke mit Farben.' }
  const n = vert.anzahl
  const schritt = Math.max(1, Math.ceil(n / PUNKTE_MAX))
  const aus = Math.ceil(n / schritt)
  const pos = new Float32Array(aus * 3)
  const farb = new Uint8Array(aus * 3)
  let k = 0
  if (kopf.format === 'ascii') {
    const zeilen = new TextDecoder('latin1').decode(bytes.subarray(kopf.datenStart)).split(/\r?\n/)
    for (let i = 0; i < n && k < aus; i += schritt) {
      const t = zeilen[i]?.trim().split(/\s+/)
      if (!t || t.length < vert.felder.length) return { ok: false, meldung: `PLY-Zeile ${i + 1} ist unvollständig.` }
      const w = [Number(t[ix]), Number(t[iy]), Number(t[iz]), Number(t[ir]), Number(t[ig]), Number(t[ib])]
      if (w.some((x) => !Number.isFinite(x))) return { ok: false, meldung: `PLY-Zeile ${i + 1} enthält keine Zahlen.` }
      pos[k * 3] = w[0]; pos[k * 3 + 1] = w[1]; pos[k * 3 + 2] = w[2]
      farb[k * 3] = w[3]; farb[k * 3 + 1] = w[4]; farb[k * 3 + 2] = w[5]
      k++
    }
  } else if (kopf.format === 'binary_little_endian') {
    const offs: number[] = []; let o = 0
    for (const f of vert.felder) { offs.push(o); o += GROESSE[f.typ] ?? 0 }
    const zeile = o
    if (!(zeile > 0) || vert.felder.some((f) => !(f.typ in GROESSE))) return { ok: false, meldung: 'Die PLY-Datei enthält nicht unterstützte Datentypen.' }
    if (kopf.datenStart + n * zeile > daten.byteLength) return { ok: false, meldung: 'Die PLY-Datei ist unvollständig (zu wenig Daten).' }
    const v = new DataView(daten)
    const lies = (p: number, typ: string): number => {
      switch (typ) {
        case 'char': case 'int8': return v.getInt8(p)
        case 'uchar': case 'uint8': return v.getUint8(p)
        case 'short': case 'int16': return v.getInt16(p, true)
        case 'ushort': case 'uint16': return v.getUint16(p, true)
        case 'int': case 'int32': return v.getInt32(p, true)
        case 'uint': case 'uint32': return v.getUint32(p, true)
        case 'float': case 'float32': return v.getFloat32(p, true)
        default: return v.getFloat64(p, true)
      }
    }
    for (let i = 0; i < n && k < aus; i += schritt) {
      const b = kopf.datenStart + i * zeile
      for (let c = 0; c < 3; c++) {
        pos[k * 3 + c] = lies(b + offs[[ix, iy, iz][c]], vert.felder[[ix, iy, iz][c]].typ)
        const fi = [ir, ig, ib][c]
        const w = lies(b + offs[fi], vert.felder[fi].typ)
        farb[k * 3 + c] = vert.felder[fi].typ === 'float' || vert.felder[fi].typ === 'float32' || vert.felder[fi].typ === 'double' ? Math.round(Math.min(1, Math.max(0, w)) * 255) : w
      }
      k++
    }
  } else {
    return { ok: false, meldung: 'Dieses PLY-Format (big endian) wird nicht unterstützt. Bitte ASCII oder binary little endian exportieren.' }
  }
  for (let i = 0; i < k * 3; i++) if (!Number.isFinite(pos[i])) return { ok: false, meldung: 'Die PLY-Datei enthält ungültige Koordinaten.' }
  return {
    ok: true,
    aussehen: { art: 'punkte', name, positionen: pos.subarray(0, k * 3).slice(), farben: farb.subarray(0, k * 3).slice() },
    ...(schritt > 1 ? { hinweis: `Für die Anzeige wurde die Punktwolke von ${n.toLocaleString('de-DE')} auf ${k.toLocaleString('de-DE')} Punkte ausgedünnt.` } : {}),
  }
}

/** Datei (GLB oder farbiges PLY) für die Anzeige vorbereiten. */
export function aussehenAusDatei(daten: ArrayBuffer, name: string): AussehenErgebnis {
  if (daten.byteLength > AUSSEHEN_MAX_BYTES) return { ok: false, meldung: 'Die Datei ist zu groß (max. 120 MB). Bitte das Modell verkleinern.' }
  if (istGlb(daten)) return { ok: true, aussehen: { art: 'glb', name, daten } }
  const bytes = new Uint8Array(daten, 0, Math.min(3, daten.byteLength))
  if (bytes[0] === 0x70 && bytes[1] === 0x6c && bytes[2] === 0x79) return aussehenAusPly(daten, name) // "ply"
  return { ok: false, meldung: 'Bitte eine GLB-Datei (mit Texturen) oder eine PLY-Punktwolke mit Farben wählen.' }
}
