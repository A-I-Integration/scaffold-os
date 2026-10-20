// ============================================================
// SCAFFOLD OS – Feldtest: Datei einlesen und mit der BESTEHENDEN Erkennung auswerten
//
// Läuft komplett im Browser (nichts wird hochgeladen). Es werden dieselben Funktionen benutzt wie im CAD:
//   DXF      → leseDxfUmriss            (lib/cad/dxf-umriss.ts)
//   OBJ/STL  → analysiereDreiecke        (lib/cad/modell-analyse.ts)
//   PLY      → analysierePunkte          (lib/cad/modell-analyse.ts, dieselbe Teile-Erkennung wie im KI-Worker)
// Dieses Modul erkennt selbst nichts. Es liest nur die Datei in das Format, das die Erkennung braucht, und
// übersetzt das Ergebnis in Ist-Werte. Nicht abgebildet: Gerüst-Seiten und „Maße ohne Gerüstschicht“, die der
// Worker für PLY zusätzlich liefert (sie liegen im Worker, nicht in lib/cad) – dazu steht ein Hinweis im Ergebnis.
// ============================================================

import { leseDxfUmriss } from '@/lib/cad/dxf-umriss'
import { analysiereDreiecke, analysierePunkte, vorgabeAchseEinheit, type GebaeudeTeil, type ModellAnalyse } from '@/lib/cad/modell-analyse'
import { dreieckeAusObj, dreieckeAusStl, type Achse, type Einheit } from '@/lib/cad/modell-import'
import type { Eingangstyp, IstTeil, IstWerte } from '@/lib/cad/feldtest'

export const FELDTEST_ENDUNGEN: Record<string, Eingangstyp> = { dxf: 'dxf', ply: 'ply', obj: 'obj', stl: 'stl' }

export function eingangstypAusName(name: string): Eingangstyp | null {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim())
  return m ? (FELDTEST_ENDUNGEN[m[1].toLowerCase()] ?? null) : null
}

export interface AnalyseOptionen {
  /** OBJ/STL: Einheit und „oben“ – ohne Angabe schätzt die Erkennung beides wie im CAD */
  einheit?: Einheit
  oben?: Achse
  /** DXF: Einheit der Zeichnung (überschreibt $INSUNITS) */
  dxfEinheit?: Einheit
}

export interface FeldtestAnalyse {
  eingangstyp: Eingangstyp
  /** false = die Erkennung hat nichts geliefert (Ist-Werte leer) */
  erkannt: boolean
  ist: IstWerte
  hinweise: string[]
  /** Einstellungen, die tatsächlich benutzt wurden (für das Protokoll) */
  einstellungen: Record<string, string | number | null>
  punkteOderDreiecke: number | null
  dauerMs: number
}

const LEER: IstWerte = { laengeM: null, breiteM: null, gesamtHoeheM: null, ecken: null, teile: [] }
const r2 = (n: number) => Math.round(n * 100) / 100

function teilName(t: GebaeudeTeil, i: number, anzahl: number): string {
  if (t.typ === 'turm') return `Teil ${i + 1} (Turm)`
  if (t.typ === 'schiff') return `Teil ${i + 1} (${anzahl > 1 ? 'Schiff/Hauptbau' : 'Hauptbau'})`
  if (t.typ === 'anbau') return `Teil ${i + 1} (Anbau)`
  return `Teil ${i + 1}`
}

function istTeile(teile: GebaeudeTeil[], hoeheNurWennBelegt: boolean): IstTeil[] {
  return teile.map((t, i) => ({
    bezeichnung: teilName(t, i, teile.length),
    laengeM: r2(t.laengeM),
    tiefeM: r2(t.tiefeM),
    // DXF: eine Höhe, die nicht aus der Zeichnung stammt („… ergänzen“), zählt als nicht erkannt
    hoeheM: hoeheNurWennBelegt && (!(t.hoeheM > 0) || /ergänzen/i.test(t.hinweis ?? '')) ? null : r2(t.hoeheM),
  }))
}

// ------------------------------------------------------------ PLY (ASCII und binär, ohne Node-Buffer)

const PLY_GROESSE: Record<string, number> = {
  char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2,
  int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8,
}

function dvWert(dv: DataView, pos: number, typ: string, little: boolean): number {
  switch (typ) {
    case 'char': case 'int8': return dv.getInt8(pos)
    case 'uchar': case 'uint8': return dv.getUint8(pos)
    case 'short': case 'int16': return dv.getInt16(pos, little)
    case 'ushort': case 'uint16': return dv.getUint16(pos, little)
    case 'int': case 'int32': return dv.getInt32(pos, little)
    case 'uint': case 'uint32': return dv.getUint32(pos, little)
    case 'float': case 'float32': return dv.getFloat32(pos, little)
    case 'double': case 'float64': return dv.getFloat64(pos, little)
    default: throw new Error(`PLY: Datentyp „${typ}“ wird nicht unterstützt`)
  }
}

/** Mehr Punkte rechnet die Erkennung im Browser nicht in sinnvoller Zeit: gleichmäßig ausdünnen (Hinweis im Ergebnis). */
export const MAX_PUNKTE_BROWSER = 250_000

export interface PlyPunkte { x: number[]; y: number[]; z: number[]; gesamt: number; verwendet: number }

export function lesePlyPunkte(daten: ArrayBuffer): PlyPunkte {
  const bytes = new Uint8Array(daten)
  const kopfText = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 8192)))
  const endIdx = kopfText.indexOf('end_header')
  if (!/^ply\r?\n/.test(kopfText) || endIdx < 0) throw new Error('Keine gültige PLY-Datei (Kopf fehlt).')
  let start = endIdx + 'end_header'.length
  if (bytes[start] === 0x0d) start++
  if (bytes[start] === 0x0a) start++
  else throw new Error('PLY: Kopf ist nicht korrekt abgeschlossen.')

  let format: 'ascii' | 'little' | 'big' | null = null
  const elemente: { name: string; anzahl: number; eig: { name: string; typ: string; liste: boolean }[] }[] = []
  for (const zeile of kopfText.slice(0, endIdx).split(/\r?\n/)) {
    const t = zeile.trim().split(/\s+/)
    if (t[0] === 'format') format = t[1] === 'ascii' ? 'ascii' : t[1] === 'binary_little_endian' ? 'little' : t[1] === 'binary_big_endian' ? 'big' : null
    else if (t[0] === 'element') elemente.push({ name: t[1], anzahl: parseInt(t[2], 10) || 0, eig: [] })
    else if (t[0] === 'property' && elemente.length) {
      const el = elemente[elemente.length - 1]
      if (t[1] === 'list') el.eig.push({ name: t[4], typ: t[3], liste: true })
      else el.eig.push({ name: t[2], typ: t[1], liste: false })
    }
  }
  if (!format) throw new Error('PLY: Format (ascii/binary) unbekannt.')
  const vertex = elemente.find((e) => e.name === 'vertex')
  if (!vertex) throw new Error('PLY: kein Element „vertex“ gefunden.')
  const ix = vertex.eig.findIndex((p) => p.name === 'x'), iy = vertex.eig.findIndex((p) => p.name === 'y'), iz = vertex.eig.findIndex((p) => p.name === 'z')
  if (ix < 0 || iy < 0 || iz < 0) throw new Error('PLY: Koordinaten x, y, z fehlen.')

  const schritt = Math.max(1, Math.ceil(vertex.anzahl / MAX_PUNKTE_BROWSER))
  const x: number[] = [], y: number[] = [], z: number[] = []
  let gelesen = 0
  const nimm = (a: number, b: number, c: number) => {
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return
    if (gelesen % schritt === 0) { x.push(a); y.push(b); z.push(c) }
    gelesen++
  }

  if (format === 'ascii') {
    if (vertex !== elemente[0]) throw new Error('PLY (ASCII): Aufbau wird nicht unterstützt (Elemente vor den Punkten).')
    const zeilen = new TextDecoder('utf-8').decode(bytes.subarray(start)).split(/\r?\n/)
    for (let i = 0; i < vertex.anzahl && i < zeilen.length; i++) {
      const t = zeilen[i].trim().split(/\s+/)
      nimm(parseFloat(t[ix]), parseFloat(t[iy]), parseFloat(t[iz]))
    }
  } else {
    const little = format === 'little'
    const dv = new DataView(daten)
    let pos = start
    for (const el of elemente) {
      if (el === vertex) break
      if (el.eig.some((p) => p.liste)) throw new Error('PLY: Aufbau wird nicht unterstützt (Listen vor den Punkten).')
      pos += el.anzahl * el.eig.reduce((s, p) => s + (PLY_GROESSE[p.typ] ?? 0), 0)
    }
    if (vertex.eig.some((p) => p.liste)) throw new Error('PLY: Aufbau wird nicht unterstützt (Listen in den Punkten).')
    const offs: number[] = []
    let stride = 0
    for (const p of vertex.eig) {
      const g = PLY_GROESSE[p.typ]
      if (!g) throw new Error(`PLY: Datentyp „${p.typ}“ wird nicht unterstützt.`)
      offs.push(stride); stride += g
    }
    const anzahl = Math.min(vertex.anzahl, Math.floor((daten.byteLength - pos) / stride))
    for (let i = 0; i < anzahl; i++) {
      const b = pos + i * stride
      nimm(dvWert(dv, b + offs[ix], vertex.eig[ix].typ, little), dvWert(dv, b + offs[iy], vertex.eig[iy].typ, little), dvWert(dv, b + offs[iz], vertex.eig[iz].typ, little))
    }
  }
  if (x.length < 3) throw new Error('PLY: zu wenige lesbare Punkte.')
  return { x, y, z, gesamt: gelesen, verwendet: x.length }
}

// ------------------------------------------------------------ Auswertung

function istAusModell(a: ModellAnalyse): IstWerte {
  return {
    laengeM: r2(a.ergebnis.laengeM),
    breiteM: r2(a.ergebnis.tiefeMaxM),
    gesamtHoeheM: r2(a.ergebnis.gesamtHoeheM),
    // Die Erkennung zählt keine Ecken des Gesamtumrisses: bewusst NICHT aus den Teilen abgeleitet (sonst wäre jedes Rechteck „4“).
    ecken: null,
    teile: istTeile(a.teile, false),
  }
}

/**
 * Liest die Datei und lässt die bestehende Erkennung darüber laufen. Wirft nur bei unlesbarem Dateiformat;
 * findet die Erkennung nichts, kommt erkannt=false mit einem Hinweis zurück (das ist ein Messergebnis, kein Absturz).
 */
export function analysiereFeldtestDatei(name: string, daten: ArrayBuffer, opt: AnalyseOptionen = {}): FeldtestAnalyse {
  const typ = eingangstypAusName(name)
  if (!typ) throw new Error('Dateityp wird nicht unterstützt (erlaubt: DXF, PLY, OBJ, STL).')
  const t0 = Date.now()
  const ende = (r: Omit<FeldtestAnalyse, 'eingangstyp' | 'dauerMs'>): FeldtestAnalyse => ({ eingangstyp: typ, dauerMs: Date.now() - t0, ...r })

  if (typ === 'dxf') {
    const text = new TextDecoder('utf-8').decode(daten)
    const r = leseDxfUmriss(text, opt.dxfEinheit ? { einheit: opt.dxfEinheit } : {})
    const einst = { einheit: opt.dxfEinheit ?? null }
    if (!r.ok) {
      return ende({ erkannt: false, ist: LEER, hinweise: [`Kein brauchbarer Umriss in der DXF (${r.grund}).`, ...r.hinweise], einstellungen: einst, punkteOderDreiecke: null })
    }
    const hinweise = [...r.hinweise]
    const first = r.textAngaben.hoeheM, traufe = r.textAngaben.traufhoeheM
    let gesamtH: number | null = null
    if (typeof first === 'number' && first > 0) gesamtH = r2(first)
    else if (typeof traufe === 'number' && traufe > 0) { gesamtH = r2(traufe); hinweise.push('Im Plantext steht nur eine Traufhöhe: sie ist als Gesamthöhe eingetragen.') }
    const teile: IstTeil[] = r.teile && r.teile.length ? istTeile(r.teile, true) : [{ bezeichnung: 'Gesamtumriss', laengeM: r2(r.laengeM), tiefeM: r2(r.breiteM), hoeheM: gesamtH }]
    return ende({
      erkannt: true,
      ist: { laengeM: r2(r.laengeM), breiteM: r2(r.breiteM), gesamtHoeheM: gesamtH, ecken: r.ecken, teile },
      hinweise: [`Form: ${r.form}, ${r.ecken} Ecken, Einheit ${r.einheit ?? 'unbekannt'} (${r.einheitQuelle}).`, ...hinweise],
      einstellungen: { einheit: r.einheit ?? null },
      punkteOderDreiecke: null,
    })
  }

  if (typ === 'obj' || typ === 'stl') {
    const dreiecke = typ === 'obj' ? dreieckeAusObj(new TextDecoder('utf-8').decode(daten)) : dreieckeAusStl(daten)
    const n = Math.floor(dreiecke.length / 9)
    if (n < 1) return ende({ erkannt: false, ist: LEER, hinweise: ['Keine Dreiecke in der Datei gefunden.'], einstellungen: {}, punkteOderDreiecke: 0 })
    const vorgabe = vorgabeAchseEinheit(dreiecke, typ)
    const einheit = opt.einheit ?? vorgabe.einheit
    const oben = opt.oben ?? vorgabe.oben
    const a = analysiereDreiecke(dreiecke, { format: typ, einheit, oben })
    const einst = { einheit, oben, einheitGeschaetzt: opt.einheit ? 'nein' : 'ja' }
    if (!a) return ende({ erkannt: false, ist: LEER, hinweise: ['Die Erkennung hat in dem Modell keinen Baukörper gefunden.'], einstellungen: einst, punkteOderDreiecke: n })
    return ende({ erkannt: true, ist: istAusModell(a), hinweise: [`Einheit ${einheit}${opt.einheit ? '' : ' (geschätzt)'}, oben = ${oben}.`, ...a.hinweise], einstellungen: einst, punkteOderDreiecke: n })
  }

  // PLY
  const p = lesePlyPunkte(daten)
  const a = analysierePunkte(p.x, p.y, p.z)
  const hinweise: string[] = []
  if (p.verwendet < p.gesamt) hinweise.push(`Aus Rechenzeitgründen wurden ${p.verwendet.toLocaleString('de-DE')} von ${p.gesamt.toLocaleString('de-DE')} Punkten gleichmäßig ausgewählt.`)
  hinweise.push('Gerüst-Seiten und „Maße ohne Gerüstschicht“ (Worker) sind hier nicht enthalten: gemessen wird die Teile-Erkennung des Browsers. Steht in der Punktwolke schon ein Gerüst, beeinflusst es die Maße.')
  if (!a) return ende({ erkannt: false, ist: LEER, hinweise: [...hinweise, 'Die Erkennung hat in der Punktwolke keinen Baukörper gefunden (zu wenige Punkte oder keine Gebäudeform).'], einstellungen: { einheit: 'm', oben: 'z' }, punkteOderDreiecke: p.gesamt })
  return ende({ erkannt: true, ist: istAusModell(a), hinweise: [...hinweise, ...a.hinweise], einstellungen: { einheit: 'm', oben: 'z' }, punkteOderDreiecke: p.gesamt })
}
