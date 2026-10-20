import { describe, it, expect } from 'vitest'
import { generateCADModel, generateBillOfMaterials, type BuildingParams } from '../calculations/cad-engine'
import { crc32, erzeugeZip } from '../export/zip'
import { baueLastannahmenDaten } from '../export/lastannahmen'
import { erzeugeLastannahmenPdf } from '../export/lastannahmen-pdf'
import { paketDateien, stuecklisteOhnePreiseCsv, erzeugeStatikerPaket } from '../export/statiker-paket'
import type { MaterialItem } from '@/types/scaffold'

const basis: BuildingParams = {
  lengthM: 12, widthM: 8, heightM: 30, eavesHeightM: 30, roofHeightM: 0, roofForm: 'flachdach',
  floors: 10, floorHeightsM: Array(10).fill(3), windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'], lastklasse: 3,
}
const opt = { projektName: 'Kirche St. Anna', firma: 'Muster GmbH', datum: '19.10.2026' }

/** Kleiner ZIP-Leser nur für den Test: liest das Zentralverzeichnis. */
function liesZip(zip: Uint8Array): { name: string; bytes: Uint8Array; crc: number }[] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  let e = zip.length - 22
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--
  expect(e).toBeGreaterThanOrEqual(0)
  const anzahl = v.getUint16(e + 10, true)
  let pos = v.getUint32(e + 16, true)
  const aus: { name: string; bytes: Uint8Array; crc: number }[] = []
  for (let i = 0; i < anzahl; i++) {
    expect(v.getUint32(pos, true)).toBe(0x02014b50)
    const crc = v.getUint32(pos + 16, true)
    const groesse = v.getUint32(pos + 24, true)
    const nl = v.getUint16(pos + 28, true)
    const lokal = v.getUint32(pos + 42, true)
    const name = new TextDecoder().decode(zip.slice(pos + 46, pos + 46 + nl))
    expect(v.getUint32(lokal, true)).toBe(0x04034b50)
    const ln = v.getUint16(lokal + 26, true)
    const start = lokal + 30 + ln
    aus.push({ name, bytes: zip.slice(start, start + groesse), crc })
    pos += 46 + nl
  }
  return aus
}

describe('ZIP-Schreiber', () => {
  it('CRC32 stimmt mit dem bekannten Prüfwert überein', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('schreibt Dateien, die sich wieder auslesen lassen (auch Umlaute und Binärdaten)', () => {
    const bin = new Uint8Array(1000).map((_, i) => (i * 7) % 256)
    const zip = erzeugeZip([{ name: 'Übersicht.txt', data: 'Grüße ✓' }, { name: 'x.bin', data: bin }, { name: 'leer.txt', data: '' }])
    const d = liesZip(zip)
    expect(d.map((x) => x.name)).toEqual(['Übersicht.txt', 'x.bin', 'leer.txt'])
    expect(new TextDecoder().decode(d[0].bytes)).toBe('Grüße ✓')
    expect(Array.from(d[1].bytes)).toEqual(Array.from(bin))
    expect(d[1].crc).toBe(crc32(bin))
    expect(d[2].bytes.length).toBe(0)
  })
})

const alleTexte = (d: ReturnType<typeof baueLastannahmenDaten>) => JSON.stringify(d)
const pdfString = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

describe('Lastannahmen-Blatt (Daten)', () => {
  const model = generateCADModel(basis, 'layher-allround')

  it('enthält Projekt, System, Geometrie und die Angaben des Planers', () => {
    const t = alleTexte(baueLastannahmenDaten(model, {
      windnorm: 'DIN EN 1991-1-4 mit Nationalem Anhang', windzone: '2', vrefMs: 25.5, gelaende: 'III', untergrund: 'Beton / Asphalt',
      aufbau: '2026-11-02', abbau: '2026-12-15', nutzung: 'oeffentlich', bekleidung: 'netz', verankerungsgrund: 'Stahlbeton',
      sonderlasten: ['schnee'],
    }, opt))
    for (const s of ['Kirche St. Anna', 'Layher Allround', '25,5 m/s', 'Zone 2', '02.11.2026', 'Schnee / Eis', 'Stahlbeton', `${model.fieldCount} Felder`]) expect(t).toContain(s)
  })

  it('markiert fehlende Pflichtangaben und rechnet keinen Windwert aus', () => {
    const d = baueLastannahmenDaten(model, { windzone: '3' }, opt)
    expect(d.fehlend.length).toBeGreaterThan(0)
    const vref = d.sektionen.flatMap((s) => s.zeilen).find((z) => z.label === 'Referenzwindgeschwindigkeit')!
    expect(vref.wert).toBeNull()
    expect(alleTexte(d)).not.toMatch(/m\/s/)
  })

  it('hat keine Preise und den Hinweis auf fehlenden Nachweis', () => {
    const d = baueLastannahmenDaten(model, {}, opt)
    expect(alleTexte(d)).not.toContain('€')
    expect(d.wichtig).toContain('kein Standsicherheitsnachweis')
  })

  it('führt Abschnitte eines mehrteiligen Gebäudes auf, auch den nicht eingerüsteten', () => {
    const m = generateCADModel({
      ...basis, sections: [
        { laengeM: 9.5, hoeheM: 45, roofForm: 'flachdach', roofHoeheM: 0 },
        { laengeM: 29.5, hoeheM: 20, roofForm: 'flachdach', roofHoeheM: 0, geruest: false },
      ],
    }, 'layher-allround')
    const tab = baueLastannahmenDaten(m, {}, opt).sektionen.find((s) => s.tabelle)!.tabelle!
    expect(tab.zeilen.length).toBe(2)
    expect(tab.zeilen[0][2]).toContain('45')
    expect(tab.zeilen[1][3]).toBe('nein')
  })
})

describe('Lastannahmen- und Prüfprotokoll-PDF', () => {
  it('erzeugt ein gültiges PDF mit mindestens zwei Seiten', () => {
    const pdf = erzeugeLastannahmenPdf(generateCADModel(basis, 'layher-allround'), {}, opt)
    expect(pdfString(pdf.slice(0, 5))).toBe('%PDF-')
    expect((pdfString(pdf).match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

describe('Statiker-Paket', () => {
  const model = generateCADModel(basis, 'layher-allround')
  const materials = generateBillOfMaterials(model)
  const eingabe = { model, materials, statik: {}, ...opt }

  it('Stückliste enthält Gewichte, aber keine Preise', () => {
    const csv = stuecklisteOhnePreiseCsv(materials)
    expect(csv).toContain('Gewicht gesamt (kg)')
    expect(csv).not.toMatch(/Preis/)
    for (const m of materials.filter((x) => x.unitPrice > 0).slice(0, 5)) {
      expect(csv).not.toContain(`;${String(m.unitPrice).replace('.', ',')};`)
    }
  })

  it('CSV setzt Felder mit Semikolon oder Anführungszeichen in Anführungszeichen', () => {
    const m: MaterialItem[] = [{
      articleNumber: 'A;1', name: 'Rahmen "groß"', category: 'Rahmen', quantity: 2, unit: 'Stk', unitPrice: 99, totalPrice: 198,
      weightKg: 12.5, riskLevel: 'low', aiRecommendation: '',
    }]
    const csv = stuecklisteOhnePreiseCsv(m)
    expect(csv).toContain('"A;1";"Rahmen ""groß""";Rahmen;2;Stk;12,5;25')
    expect(csv).not.toContain('99')
  })

  const namen = ['0-Inhalt.txt', '1-Geruestplan.pdf', '2-Geruestplan.dxf', '3-Lastannahmen-Pruefprotokoll.pdf', '4-Stueckliste.csv', '5-Geometriedaten.json']

  it('enthält die vorgesehenen Dateien in fester Reihenfolge', () => {
    expect(paketDateien({ ...eingabe, ifc: new Uint8Array([1, 2, 3]) }).map((d) => d.name)).toEqual([...namen, '6-Geruest.ifc', '7-Statikdaten.xlsx'])
    const ohneIfc = paketDateien({ ...eingabe, ifc: null })
    expect(ohneIfc.map((d) => d.name)).toEqual([...namen, '7-Statikdaten.xlsx'])
    expect(String(ohneIfc[0].data)).toContain('IFC-Modell konnte nicht erzeugt werden')
  })

  it('kein Textteil im Paket enthält Preise', () => {
    for (const d of paketDateien({ ...eingabe, ifc: null })) if (typeof d.data === 'string') expect(d.data).not.toContain('€')
  })

  it('Plan-PDF und DXF sind echte Dateien', () => {
    const d = paketDateien({ ...eingabe, ifc: null })
    const plan = d.find((x) => x.name === '1-Geruestplan.pdf')!.data as Uint8Array
    expect(pdfString(plan.slice(0, 5))).toBe('%PDF-')
    const dxf = String(d.find((x) => x.name === '2-Geruestplan.dxf')!.data)
    expect(dxf).toContain('GERUEST'); expect(dxf).toContain('MASSE'); expect(dxf).toContain('TEXTE'); expect(dxf).toContain('EOF')
  })

  it('Plan-Modus: Standard schematisch, Komponentenmodus liefert größeres DXF und benennt es im Inhalt', () => {
    const dxf = (d: ReturnType<typeof paketDateien>) => String(d.find((x) => x.name === '2-Geruestplan.dxf')!.data)
    const std = paketDateien({ ...eingabe, ifc: null })
    const komp = paketDateien({ ...eingabe, ifc: null, planModus: 'komponenten' })
    expect(String(std[0].data)).toContain('schematisch')
    expect(String(komp[0].data)).toContain('mit Bauteilen aus dem CAD-Modell')
    expect(dxf(komp).length).toBeGreaterThan(dxf(std).length * 2)
    expect(komp.map((d) => d.name)).toEqual(std.map((d) => d.name))
  })

  it('ZIP lässt sich vollständig auslesen, JSON ist gültig und passt zum Modell', () => {
    const zip = erzeugeStatikerPaket({ ...eingabe, ifc: new Uint8Array([9, 8, 7]) })
    const d = liesZip(zip)
    expect(d.length).toBe(8)
    for (const x of d) expect(crc32(x.bytes)).toBe(x.crc)
    const json = JSON.parse(new TextDecoder().decode(d.find((x) => x.name === '5-Geometriedaten.json')!.bytes))
    expect(json.gesamtmasse.feldanzahl).toBe(model.fieldCount)
    expect(json.bauteile.length).toBe(model.components3D.length)
    expect(Array.from(d.find((x) => x.name === '6-Geruest.ifc')!.bytes)).toEqual([9, 8, 7])
  })
})
