import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { leseIfc, IFC_MAX_BYTES, pruefeIfcRahmen, pruefeStepSyntax, type IfcErgebnis } from '@/lib/cad/ifc-einleser'
import {
  ANBAU_MASSE, HAUS_MASSE, L_FORM_MASSE, erzeugeIfc, hausMitAnbau, hausZweiGeschosse, lFormHaus,
} from '@/lib/cad/ifc-testmodelle'
import { abschnitteAusTeileListe } from '@/lib/cad/modell-analyse'
import { mitHoehen } from '@/lib/cad/dxf-umriss'

const bytes = (t: string) => new TextEncoder().encode(t)
const nah = (ist: number, soll: number, anteil = 0.05) => Math.abs(ist - soll) <= Math.abs(soll) * anteil
async function ok(text: string): Promise<IfcErgebnis> {
  const r = await leseIfc(bytes(text))
  if (!r.ok) throw new Error(`Import fehlgeschlagen: ${r.grund} – ${r.meldung}`)
  return r
}

describe('IFC-Einleser – einfaches Haus, 2 Geschosse', () => {
  it('liest Geschosse mit Elevation und Umriss (12 m × 8 m)', async () => {
    const r = await ok(hausZweiGeschosse())
    expect(r.geschosse.map((g) => g.name)).toEqual(['EG', 'OG'])
    HAUS_MASSE.elevationen.forEach((soll, i) => {
      // Elevation 0 lässt sich nicht prozentual vergleichen: dann absolut auf 5 cm
      if (soll === 0) expect(Math.abs(r.geschosse[i].elevationM)).toBeLessThan(0.05)
      else expect(nah(r.geschosse[i].elevationM, soll)).toBe(true)
    })
    expect(r.ecken).toBe(4)
    expect(r.form).toBe('rechteck')
    expect(nah(r.laengeM, HAUS_MASSE.laengeM, 0.02)).toBe(true)
    expect(nah(r.breiteM, HAUS_MASSE.breiteM, 0.02)).toBe(true)
    expect(r.geschosse.every((g) => nah(g.flaecheM2, 96, 0.04))).toBe(true)
  })

  it('macht daraus 1 Teil mit Höhe aus den Geschossen, Quelle ifc, Quelle im Hinweis', async () => {
    const r = await ok(hausZweiGeschosse())
    expect(r.teile).not.toBeNull()
    expect(r.teile).toHaveLength(1)
    const t = r.teile![0]
    expect(t.quelle).toBe('ifc')
    expect(t.id.startsWith('ifc-')).toBe(true)
    expect(nah(t.hoeheM, HAUS_MASSE.traufeM)).toBe(true)
    expect(nah(t.laengeM, 12, 0.02)).toBe(true)
    expect(nah(t.tiefeM, 8, 0.02)).toBe(true)
    expect(t.hinweis).toMatch(/Höhe aus IFC/)
    expect(t.hinweis).toMatch(/OG/)
  })

  it('liest ein in Millimetern angelegtes Modell gleich (Elevation 2800 mm = 2,8 m)', async () => {
    const r = await ok(hausZweiGeschosse({ einheit: 'MILLI' }))
    expect(nah(r.geschosse[1].elevationM, 2.8)).toBe(true)
    expect(nah(r.teile![0].hoeheM, 5.6)).toBe(true)
    expect(nah(r.laengeM, 12, 0.02)).toBe(true)
  })

  it('meldet den Fortschritt aufsteigend bis 1', async () => {
    const stufen: number[] = []
    await leseIfc(bytes(hausZweiGeschosse()), { onFortschritt: (a) => stufen.push(a) })
    expect(stufen.length).toBeGreaterThan(3)
    for (let i = 1; i < stufen.length; i++) expect(stufen[i]).toBeGreaterThanOrEqual(stufen[i - 1])
    expect(stufen[stufen.length - 1]).toBe(1)
  })

  it('Teile laufen unverändert in die Abschnitte und lassen sich überschreiben', async () => {
    const r = await ok(hausZweiGeschosse())
    const abschnitte = abschnitteAusTeileListe(r.teile!)
    expect(abschnitte).toHaveLength(1)
    expect(nah(abschnitte[0].hoeheM, 5.6)).toBe(true)
    const ueber = mitHoehen(r.teile!, [7.5])
    expect(ueber[0].hoeheM).toBe(7.5)
    expect(ueber[0].quelle).toBe('ifc')
  })
})

describe('IFC-Einleser – L-Form', () => {
  it('findet 6 Ecken, 1 Innenecke, passende Fläche und Teile', async () => {
    const r = await ok(lFormHaus())
    expect(r.ecken).toBe(L_FORM_MASSE.ecken)
    expect(r.innenecken).toBe(1)
    expect(r.form).toBe('l-form')
    expect(nah(r.flaecheM2, L_FORM_MASSE.flaecheM2, 0.03)).toBe(true)
    expect(r.teile!.length).toBe(2)
    expect(r.teile!.every((t) => t.quelle === 'ifc' && nah(t.hoeheM, L_FORM_MASSE.traufeM))).toBe(true)
  })

  it('erkennt dieselbe L-Form, wenn das Gebäude 30° gedreht im Modell liegt', async () => {
    const w = (30 * Math.PI) / 180
    const dreh = (p: [number, number]): [number, number] => [100 + p[0] * Math.cos(w) - p[1] * Math.sin(w), 50 + p[0] * Math.sin(w) + p[1] * Math.cos(w)]
    const u = L_FORM_MASSE.umriss.map(dreh)
    const r = await ok(erzeugeIfc({ geschosse: [
      { name: 'EG', elevationM: 0, wandHoeheM: 3, umriss: u },
      { name: 'OG', elevationM: 3, wandHoeheM: 3, umriss: u },
    ] }))
    expect(r.ecken).toBe(6)
    expect(r.form).toBe('l-form')
    expect(nah(r.flaecheM2, L_FORM_MASSE.flaecheM2, 0.03)).toBe(true)
    expect(r.rechtwinklig).toBe(true)
  })
})

describe('IFC-Einleser – Haus mit Anbau', () => {
  it('liefert 2 Teile mit eigener Höhe (Haus 6 m, Anbau 3 m)', async () => {
    const r = await ok(hausMitAnbau())
    expect(r.teile).toHaveLength(2)
    const nachLaenge = [...r.teile!].sort((a, b) => b.laengeM * b.tiefeM - a.laengeM * a.tiefeM)
    expect(nah(nachLaenge[0].hoeheM, ANBAU_MASSE.haus.traufeM)).toBe(true)
    expect(nah(nachLaenge[1].hoeheM, ANBAU_MASSE.anbau.traufeM)).toBe(true)
    expect(r.teile!.every((t) => t.quelle === 'ifc')).toBe(true)
    expect(nah(nachLaenge[0].laengeM * nachLaenge[0].tiefeM, 80, 0.04)).toBe(true)
    expect(nah(nachLaenge[1].laengeM * nachLaenge[1].tiefeM, 20, 0.06)).toBe(true)
  })

  it('Geschosse: EG hat die große Grundfläche, OG nur das Haus', async () => {
    const r = await ok(hausMitAnbau())
    expect(nah(r.geschosse[0].flaecheM2, 100, 0.04)).toBe(true)
    expect(nah(r.geschosse[1].flaecheM2, 80, 0.04)).toBe(true)
  })
})

describe('IFC-Einleser – Untergeschoss und Dach', () => {
  it('lässt ein Kellergeschoss (Elevation -2,8 m) außen vor und rechnet Höhen vom Gelände', async () => {
    const haus: [number, number][] = [[0, 0], [10, 0], [10, 8], [0, 8]]
    const keller: [number, number][] = [[-1, -1], [11, -1], [11, 9], [-1, 9]]
    const r = await ok(erzeugeIfc({ geschosse: [
      { name: 'KG', elevationM: -2.8, wandHoeheM: 2.8, umriss: keller },
      { name: 'EG', elevationM: 0, wandHoeheM: 2.8, umriss: haus },
      { name: 'OG', elevationM: 2.8, wandHoeheM: 2.8, umriss: haus },
    ] }))
    expect(r.geschosse[0].unterirdisch).toBe(true)
    expect(nah(r.laengeM, 10, 0.02)).toBe(true)
    expect(nah(r.teile![0].hoeheM, 5.6)).toBe(true)
    expect(r.hinweise.join(' ')).toMatch(/Untergeschosse.*KG/)
  })

  it('weist auf ein Dach hin, ohne eine Dachform zu erfinden', async () => {
    const r = await ok(hausZweiGeschosse({ mitDach: true }))
    expect(r.hinweise.join(' ')).toMatch(/Dachform/)
    expect(r.teile![0].dachForm).toBe('flachdach')
    expect(nah(r.teile![0].hoeheM, 5.6)).toBe(true)
  })
})

describe('IFC-Einleser – Fehler und Grenzen (nie ein halber Import)', () => {
  it('lehnt eine abgeschnittene IFC ab', async () => {
    const t = hausZweiGeschosse()
    const r = await leseIfc(bytes(t.slice(0, Math.floor(t.length * 0.6))))
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.grund).toBe('kaputt'); expect(r.meldung).toMatch(/unvollständig|beschädigt/); expect(r.fallbackKi).toBe(false) }
  })

  it('lehnt Text, der keine IFC ist, mit klarer Meldung ab', async () => {
    const r = await leseIfc(bytes('Das ist keine IFC-Datei.\nNur Text.'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.grund).toBe('kein-ifc')
  })

  it('lehnt eine leere Datei ab', async () => {
    const r = await leseIfc(new Uint8Array(0))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.grund).toBe('kein-ifc')
  })

  it('lehnt unausgeglichene Klammern ab, bevor web-ifc sie sieht (dort hängt es sonst endlos)', async () => {
    const kaputt = hausZweiGeschosse().replace(/IFCWALL\(/g, 'IFCWALL(((')
    const r = await leseIfc(bytes(kaputt))
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.grund).toBe('kaputt'); expect(r.meldung).toMatch(/Syntaxfehler in Zeile \d+/) }
  })

  it('lehnt eine IFC mit ins Leere zeigenden Verweisen ab, ohne zu werfen (kein halber Import)', async () => {
    const kaputt = hausZweiGeschosse().replace(/IFCEXTRUDEDAREASOLID\(#\d+/g, 'IFCEXTRUDEDAREASOLID(#999999')
    const r = await leseIfc(bytes(kaputt))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(['kaputt', 'keine-geometrie', 'umriss-unbrauchbar']).toContain(r.grund)
  })

  it('pruefeStepSyntax nimmt gültige Dateien an und findet Texte mit Klammern und Hochkomma', () => {
    expect(pruefeStepSyntax(bytes(hausZweiGeschosse()))).toBeNull()
    const mitText = hausZweiGeschosse().replace("'Testprojekt'", "'Haus (Nord) ''A'' /* x */'")
    expect(pruefeStepSyntax(bytes(mitText))).toBeNull()
    expect(pruefeStepSyntax(bytes(hausZweiGeschosse().replace('IFCCARTESIANPOINT((0.,0.,0.))', 'IFCCARTESIANPOINT((0.,0.,0.)')))?.grund).toBe('kaputt')
    expect(pruefeStepSyntax(bytes(hausZweiGeschosse().replace('IFCCARTESIANPOINT((0.,0.,0.))', 'IFCCARTESIANPOINT((0.,0.,0.)))')))?.grund).toBe('kaputt')
  })

  it('stoppt vor dem Lesen bei zu großer Datei mit ehrlicher Meldung', async () => {
    const r = await leseIfc(bytes(hausZweiGeschosse()), { maxBytes: 1000 })
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.grund).toBe('zu-gross'); expect(r.meldung).toContain('Datei zu groß für Browser-Import'); expect(r.meldung).toContain('DXF/OBJ') }
  })

  it('hat ein Limit von 200 MB', () => {
    expect(IFC_MAX_BYTES).toBe(200 * 1024 * 1024)
  })

  it('meldet fehlende Geschosse', async () => {
    const r = await leseIfc(bytes(erzeugeIfc({ geschosse: [] })))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.grund).toBe('keine-geschosse')
  })

  it('akzeptiert einen Blob (wie ein File im Browser) und liest ihn in Blöcken', async () => {
    const r = await leseIfc(new Blob([hausZweiGeschosse()]))
    expect(r.ok).toBe(true)
  })

  it('bricht auf Wunsch ab', async () => {
    const c = new AbortController(); c.abort()
    const r = await leseIfc(new Blob([hausZweiGeschosse()]), { signal: c.signal })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.grund).toBe('abgebrochen')
  })

  it('pruefeIfcRahmen erkennt ifcZIP und ifcXML', () => {
    expect(pruefeIfcRahmen(new Uint8Array([0x50, 0x4b, 3, 4]))?.meldung).toMatch(/entpacken/)
    expect(pruefeIfcRahmen(bytes('<?xml version="1.0"?><ifcXML/>'))?.meldung).toMatch(/XML/)
  })
})

describe('IFC-Testdateien im Repo', () => {
  const dir = join(__dirname, 'fixtures', 'ifc')
  const faelle: [string, () => string][] = [['haus-2-geschosse.ifc', hausZweiGeschosse], ['l-form.ifc', lFormHaus], ['haus-mit-anbau.ifc', hausMitAnbau]]
  for (const [datei, erzeuge] of faelle) {
    it(`${datei} stimmt mit dem Generator überein (npm run ifc:testmodelle) und lässt sich lesen`, async () => {
      const text = readFileSync(join(dir, datei), 'utf-8')
      expect(text).toBe(erzeuge())
      const r = await leseIfc(new Uint8Array(readFileSync(join(dir, datei))))
      expect(r.ok).toBe(true)
    })
  }
})
