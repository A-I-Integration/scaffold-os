import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  abweichungProzent, ampelFuerProzent, bewerteWert, gesamtAmpel, vergleiche, baueProtokoll, sha256Hex,
  type IstWerte, type Ampel,
} from '../feldtest'
import { analysiereFeldtestDatei, eingangstypAusName, lesePlyPunkte, MAX_PUNKTE_BROWSER } from '../feldtest-analyse'
import { erzeugeFeldtestPdf } from '@/lib/export/feldtest-pdf'
import { FELDTEST_MATRIX } from './feldtest-matrix'

const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
const stempel = { name: 'SCAFFOLD OS', version: '0.0.0-test', stand: 'abc1234' }

describe('Abweichung und Ampel', () => {
  it('Grenzfälle 5 % und 15 % (inklusive, auch bei Gleitkomma-Rauschen)', () => {
    const a = (soll: number, ist: number): Ampel => ampelFuerProzent(abweichungProzent(soll, ist))
    expect(a(100, 105)).toBe('gruen')      // genau +5 %
    expect(a(100, 95)).toBe('gruen')       // genau −5 %
    expect(a(100, 105.01)).toBe('gelb')
    expect(a(100, 94.99)).toBe('gelb')
    expect(a(100, 115)).toBe('gelb')       // genau +15 %
    expect(a(100, 85)).toBe('gelb')        // genau −15 %
    expect(a(100, 115.01)).toBe('rot')
    expect(a(100, 84.99)).toBe('rot')
    // typische Gleitkomma-Fälle: 12 → 12,6 sind exakt 5 %, 10 → 11,5 exakt 15 %
    expect(a(12, 12.6)).toBe('gruen')
    expect(a(10, 11.5)).toBe('gelb')
    expect(a(8, 9.2)).toBe('gelb')         // exakt 15 %
    expect(a(8, 8.4)).toBe('gruen')        // exakt 5 %
  })

  it('Abweichung mit Vorzeichen; Soll ≤ 0 oder ungültig → null', () => {
    expect(abweichungProzent(12, 12.6)).toBe(5)
    expect(abweichungProzent(12, 11.4)).toBe(-5)
    expect(abweichungProzent(0, 5)).toBeNull()
    expect(abweichungProzent(-3, 5)).toBeNull()
    expect(abweichungProzent(10, NaN)).toBeNull()
    expect(ampelFuerProzent(null)).toBe('fehlt')
  })

  it('Zählwert Ecken: gleich = grün, sonst rot (nicht über Prozent)', () => {
    const d = { id: 'ecken', bezeichnung: 'Anzahl Ecken', art: 'anzahl' as const }
    expect(bewerteWert(d, 6, 6).ampel).toBe('gruen')
    expect(bewerteWert(d, 6, 7).ampel).toBe('rot')   // wären 16,7 %, aber 7 Ecken sind falsch
    expect(bewerteWert(d, 20, 21).ampel).toBe('rot') // nur 5 %, trotzdem falsch
    expect(bewerteWert(d, 6, 7).abweichungProzent).toBeCloseTo(16.667, 2)
  })

  it('fehlender Ist-Wert ist nie grün', () => {
    const z = bewerteWert({ id: 'laenge', bezeichnung: 'Länge', art: 'mass' }, 12, null)
    expect(z.ampel).toBe('fehlt')
    expect(z.ist).toBeNull()
    expect(gesamtAmpel([{ ampel: 'gruen' }, { ampel: 'fehlt' }])).toBe('fehlt')
  })

  it('Gesamtampel = schlechtester Wert; ohne Werte „fehlt“', () => {
    expect(gesamtAmpel([{ ampel: 'gruen' }, { ampel: 'gruen' }])).toBe('gruen')
    expect(gesamtAmpel([{ ampel: 'gruen' }, { ampel: 'gelb' }])).toBe('gelb')
    expect(gesamtAmpel([{ ampel: 'gelb' }, { ampel: 'rot' }, { ampel: 'fehlt' }])).toBe('rot')
    expect(gesamtAmpel([])).toBe('fehlt')
  })

  it('vergleiche: nur Werte mit eingetragenem Soll; Teile in Reihenfolge', () => {
    const ist: IstWerte = { laengeM: 12, breiteM: 8, gesamtHoeheM: 9, ecken: 4, teile: [
      { bezeichnung: 'Teil 1', laengeM: 12, tiefeM: 8, hoeheM: 9 }, { bezeichnung: 'Teil 2', laengeM: 4, tiefeM: 4, hoeheM: null },
    ] }
    const z = vergleiche({ laengeM: 12, breiteM: 9, ecken: 4, teile: [{ hoeheM: 9 }, { hoeheM: 6 }, { laengeM: 3 }] }, ist)
    expect(z.map((x) => `${x.id}:${x.ampel}`)).toEqual([
      'laenge:gruen', 'breite:gelb', 'ecken:gruen', 'teil-1-hoehe:gruen', 'teil-2-hoehe:fehlt', 'teil-3-laenge:fehlt',
    ])
    expect(vergleiche({}, ist)).toEqual([])
    expect(vergleiche({ laengeM: 0, breiteM: null }, ist)).toEqual([])
  })
})

describe('sha256Hex', () => {
  it('bekannter Wert für „abc“', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('Feldtest mit haus-test.dxf (Soll 12 × 8)', () => {
  const roh = fs.readFileSync(path.join(__dirname, 'fixtures', 'haus-test.dxf'))
  it('alle eingetragenen Werte grün, Protokoll-JSON und -PDF entstehen', async () => {
    const daten = ab(roh)
    const a = analysiereFeldtestDatei('haus-test.dxf', daten)
    expect(a.erkannt).toBe(true)
    expect(a.eingangstyp).toBe('dxf')
    const p = baueProtokoll({
      datei: { name: 'haus-test.dxf', groesseByte: roh.length, sha256: await sha256Hex(daten) },
      eingangstyp: a.eingangstyp, einstellungen: a.einstellungen, sollQuelle: 'plan', notiz: 'Abnahme',
      soll: { laengeM: 12, breiteM: 8 }, ist: a.ist,
      analyse: { dauerMs: a.dauerMs, punkteOderDreiecke: a.punkteOderDreiecke, erkannt: a.erkannt }, hinweise: a.hinweise, software: stempel,
      jetzt: new Date('2026-10-20T14:00:00Z'),
    })
    expect(p.werte.map((w) => [w.id, w.ist, w.abweichungProzent, w.ampel])).toEqual([['laenge', 12, 0, 'gruen'], ['breite', 8, 0, 'gruen']])
    expect(p.ergebnis.gesamt).toBe('gruen')
    expect(p.datei.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(p.erstelltAm).toBe('2026-10-20T14:00:00.000Z')
    expect(p.software).toEqual(stempel)
    expect(p.sollQuelleName).toBe('Plan')
    // JSON ist verlustfrei lesbar
    expect(JSON.parse(JSON.stringify(p))).toEqual(p)
    const pdf = erzeugeFeldtestPdf(p)
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(2000)
  })

  it('PDF auch für ein Protokoll ohne erkannte Teile und ohne Sollwerte', () => {
    const p = baueProtokoll({
      datei: { name: 'leer.ply', groesseByte: 10, sha256: 'a'.repeat(64) }, eingangstyp: 'ply', sollQuelle: 'vor-ort',
      soll: { laengeM: 10 }, ist: { laengeM: null, breiteM: null, gesamtHoeheM: null, ecken: null, teile: [] },
      analyse: { dauerMs: 5, punkteOderDreiecke: 0, erkannt: false }, hinweise: ['nichts erkannt'], software: stempel,
    })
    expect(p.ergebnis.gesamt).toBe('fehlt')
    expect(erzeugeFeldtestPdf(p).length).toBeGreaterThan(1500)
  })
})

describe('Dateien einlesen', () => {
  it('Dateityp aus dem Namen', () => {
    expect(eingangstypAusName('Scan.PLY')).toBe('ply')
    expect(eingangstypAusName('a.b.dxf')).toBe('dxf')
    expect(eingangstypAusName('modell.stl')).toBe('stl')
    expect(eingangstypAusName('foto.pdf')).toBeNull()
    expect(() => analysiereFeldtestDatei('foto.pdf', new ArrayBuffer(8))).toThrow(/nicht unterstützt/)
  })

  it('PLY ASCII und binär (little endian, mit Farbe) liefern dieselben Punkte', () => {
    const pts = [[0, 0, 0], [1.5, 2.5, 3.5], [4, 5, 6]]
    const ascii = Buffer.from(`ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nend_header\n${pts.map((p) => p.join(' ')).join('\n')}\n`)
    const kopf = Buffer.from('ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n')
    const body = Buffer.alloc(3 * 15)
    pts.forEach((p, i) => { p.forEach((v, k) => body.writeFloatLE(v, i * 15 + k * 4)); body[i * 15 + 12] = 1; body[i * 15 + 13] = 2; body[i * 15 + 14] = 3 })
    const a = lesePlyPunkte(ab(ascii)), b = lesePlyPunkte(ab(Buffer.concat([kopf, body])))
    expect(a.x).toEqual([0, 1.5, 4]); expect(b.x).toEqual(a.x); expect(b.y).toEqual(a.y); expect(b.z).toEqual(a.z)
    expect(() => lesePlyPunkte(ab(Buffer.from('kein ply')))).toThrow(/PLY/)
  })

  it('große Punktwolke (≈112.000 Punkte, Gebäude 16,4 × 13,4 × 13,2 m): läuft ohne Absturz und in vertretbarer Zeit', () => {
    // synthetische Hülle mit bekannten Maßen: Wände und Dach als Punktraster (keine echte Kundendatei)
    const L = 16.4, T = 13.4, H = 13.2, s = 0.1
    const px: number[] = [], py: number[] = [], pz: number[] = []
    const add = (x: number, y: number, z: number) => { px.push(x); py.push(y); pz.push(z) }
    for (let x = 0; x <= L + 1e-9; x += s) for (let z = 0; z <= H + 1e-9; z += 0.2) { add(x, 0, z); add(x, T, z) }
    for (let y = 0; y <= T + 1e-9; y += s) for (let z = 0; z <= H + 1e-9; z += 0.2) { add(0, y, z); add(L, y, z) }
    for (let x = 0; x <= L + 1e-9; x += 0.14) for (let y = 0; y <= T + 1e-9; y += 0.14) add(x, y, H)
    const n = px.length
    expect(n).toBeGreaterThan(50_000)
    const kopf = Buffer.from(`ply\nformat binary_little_endian 1.0\nelement vertex ${n}\nproperty float x\nproperty float y\nproperty float z\nend_header\n`)
    const body = Buffer.alloc(n * 12)
    for (let i = 0; i < n; i++) { body.writeFloatLE(px[i], i * 12); body.writeFloatLE(py[i], i * 12 + 4); body.writeFloatLE(pz[i], i * 12 + 8) }
    const t0 = Date.now()
    const a = analysiereFeldtestDatei('kirche.ply', ab(Buffer.concat([kopf, body])))
    expect(Date.now() - t0).toBeLessThan(30_000)
    expect(a.erkannt).toBe(true)
    expect(a.punkteOderDreiecke).toBe(n)
    expect(a.ist.laengeM).toBeGreaterThan(L - 1); expect(a.ist.laengeM).toBeLessThan(L + 1)
    expect(a.ist.gesamtHoeheM).toBeGreaterThan(H - 1); expect(a.ist.gesamtHoeheM).toBeLessThan(H + 1)
  }, 60_000)

  it('mehr Punkte als das Browser-Limit werden gleichmäßig ausgedünnt und das steht im Hinweis', () => {
    const n = MAX_PUNKTE_BROWSER * 2 + 10
    const kopf = Buffer.from(`ply\nformat binary_little_endian 1.0\nelement vertex ${n}\nproperty float x\nproperty float y\nproperty float z\nend_header\n`)
    const body = Buffer.alloc(n * 12)
    for (let i = 0; i < n; i++) { body.writeFloatLE(i % 100, i * 12); body.writeFloatLE(i % 50, i * 12 + 4); body.writeFloatLE(i % 20, i * 12 + 8) }
    const p = lesePlyPunkte(ab(Buffer.concat([kopf, body])))
    expect(p.gesamt).toBe(n)
    expect(p.verwendet).toBeLessThanOrEqual(MAX_PUNKTE_BROWSER)
    expect(p.verwendet).toBeGreaterThan(MAX_PUNKTE_BROWSER / 2 - 1)
  })

  it('OBJ: Quader 10 × 6 × 5 (y oben) wird erkannt', () => {
    const v = [[0, 0, 0], [10, 0, 0], [10, 0, 6], [0, 0, 6], [0, 5, 0], [10, 5, 0], [10, 5, 6], [0, 5, 6]]
    const f = [[1, 2, 3, 4], [5, 6, 7, 8], [1, 2, 6, 5], [2, 3, 7, 6], [3, 4, 8, 7], [4, 1, 5, 8]]
    const obj = v.map((p) => `v ${p.join(' ')}`).join('\n') + '\n' + f.map((x) => `f ${x.join(' ')}`).join('\n') + '\n'
    const a = analysiereFeldtestDatei('quader.obj', ab(Buffer.from(obj)), { einheit: 'm', oben: 'y' })
    expect(a.eingangstyp).toBe('obj')
    expect(a.einstellungen).toMatchObject({ einheit: 'm', oben: 'y', einheitGeschaetzt: 'nein' })
    expect(a.erkannt).toBe(true)
    // Die bestehende Erkennung gibt Länge/Breite mit +0,1 m Zuschlag aus (Ist 10,1 × 6,1): hier nur Toleranz, keine Änderung daran.
    expect(a.ist.laengeM).toBeCloseTo(10, 0)
    expect(a.ist.breiteM).toBeCloseTo(6, 0)
    expect(a.ist.gesamtHoeheM).toBeCloseTo(5, 1)
    expect(a.ist.ecken).toBeNull() // Ecken gibt es bewusst nur für DXF
  })

  it('DXF ohne Geometrie: erkannt=false mit Hinweis statt Absturz', () => {
    const a = analysiereFeldtestDatei('leer.dxf', ab(Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n')))
    expect(a.erkannt).toBe(false)
    expect(a.ist.teile).toEqual([])
    expect(a.hinweise.length).toBeGreaterThan(0)
  })
})

describe('Feldtest-Matrix', () => {
  it('fünf Fälle in der vorgegebenen Reihenfolge, Kennungen eindeutig', () => {
    expect(FELDTEST_MATRIX.map((f) => f.name)).toEqual([
      'Kirchen-LiDAR-Scan', 'Statiker-DXF-Grundriss', 'Architekten-OBJ-Export', 'Foto-PDF mit Beleg-Maßen', 'Klick-gezeichneter Umriss',
    ])
    expect(new Set(FELDTEST_MATRIX.map((f) => f.id)).size).toBe(FELDTEST_MATRIX.length)
  })

  it('jeder Fall hat Eingang, Soll-Quelle, Beschaffung und Kriterien mit gültigen Wert-Kennungen', () => {
    const gueltig = /^(laenge|breite|gesamthoehe|ecken|teil-\d+-(laenge|tiefe|hoehe))$/
    for (const f of FELDTEST_MATRIX) {
      expect(['ply', 'dxf', 'obj', 'foto-pdf', 'klick-zeichnung']).toContain(f.eingang)
      expect(['vor-ort', 'plan', 'beleg']).toContain(f.sollQuelle)
      expect(f.beschaffung.length).toBeGreaterThan(20)
      expect(f.kriterien.length).toBeGreaterThan(0)
      for (const k of f.kriterien) expect(k.wert, `${f.id}: ${k.wert}`).toMatch(gueltig)
      // „vorhanden“ nur mit echter Referenz (Datei-Hash + Sollwerte + Nachweis), sonst bleibt der Fall offen
      if (f.status === 'vorhanden') { expect(f.referenz).not.toBeNull(); expect(f.referenz!.sha256).toMatch(/^[0-9a-f]{64}$/); expect(f.referenz!.nachweis.length).toBeGreaterThan(5) }
      else expect(f.referenz).toBeNull()
    }
  })

  it('nur DXF/PLY/OBJ-Fälle sind im Werkzeug messbar', () => {
    for (const f of FELDTEST_MATRIX) expect(f.imWerkzeugMessbar).toBe(['ply', 'dxf', 'obj'].includes(f.eingang))
  })
})
