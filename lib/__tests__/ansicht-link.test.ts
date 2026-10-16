import { describe, it, expect } from 'vitest'
import { ansichtAusProjektdaten, gueltigkeitTage, linkStatus, TOKEN_MUSTER, UUID_MUSTER } from '../ansicht-link'
import { generateCADModel } from '../calculations/cad-engine'

const BAU = { lengthM: 20, widthM: 10, heightM: 10, eavesHeightM: 8, roofHeightM: 3, roofForm: 'satteldach', floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'] }
const daten = (kiResult: unknown) => ({ kiResult })

describe('linkStatus', () => {
  const jetzt = new Date('2026-10-17T12:00:00Z')
  it('aktiv, abgelaufen, widerrufen', () => {
    expect(linkStatus({ expires_at: '2026-10-18T00:00:00Z', revoked_at: null }, jetzt)).toBe('aktiv')
    expect(linkStatus({ expires_at: '2026-10-17T11:59:59Z', revoked_at: null }, jetzt)).toBe('abgelaufen')
    expect(linkStatus({ expires_at: '2026-12-01T00:00:00Z', revoked_at: '2026-10-17T10:00:00Z' }, jetzt)).toBe('widerrufen')
  })
  it('kaputtes Datum zählt als abgelaufen', () => {
    expect(linkStatus({ expires_at: 'kein Datum', revoked_at: null }, jetzt)).toBe('abgelaufen')
  })
})

describe('gueltigkeitTage', () => {
  it('Standard 30, begrenzt auf 1 bis 365', () => {
    expect(gueltigkeitTage(undefined)).toBe(30)
    expect(gueltigkeitTage('abc')).toBe(30)
    expect(gueltigkeitTage(0)).toBe(1)
    expect(gueltigkeitTage(9999)).toBe(365)
    expect(gueltigkeitTage('7')).toBe(7)
  })
})

describe('Token- und ID-Muster', () => {
  it('Token: genau 48 Hex-Zeichen (24 Byte), nichts anderes', () => {
    expect(TOKEN_MUSTER.test('a'.repeat(48))).toBe(true)
    expect(TOKEN_MUSTER.test('a'.repeat(47))).toBe(false)
    expect(TOKEN_MUSTER.test('A'.repeat(48))).toBe(false)
    expect(TOKEN_MUSTER.test(`${'a'.repeat(47)}&select=*`)).toBe(false)
  })
  it('UUID-Muster lehnt Einschleusen von Abfrage-Teilen ab', () => {
    expect(UUID_MUSTER.test('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
    expect(UUID_MUSTER.test('123e4567-e89b-12d3-a456-426614174000&select=*')).toBe(false)
    expect(UUID_MUSTER.test('1 or 1=1')).toBe(false)
  })
})

describe('ansichtAusProjektdaten – nur Gebäude und System, nie Preise', () => {
  it('übernimmt Gebäude + System und lässt alles andere weg', () => {
    const r = ansichtAusProjektdaten(daten({
      building: { ...BAU, geheim: 'x', preis: 123 }, systemId: 'layher-allround',
      suggestedPrice: 99999, materialList: [{ unitPrice: 1 }], totalCost: 5,
    }))
    expect(r).not.toBeNull()
    expect(r!.systemId).toBe('layher-allround')
    expect(JSON.stringify(r)).not.toMatch(/geheim|preis|99999|suggestedPrice|totalCost|unitPrice/)
    expect(Object.keys(r!)).toEqual(['building', 'systemId'])
  })
  it('ergibt ein Gebäude, das das CAD wirklich rechnen kann', () => {
    const r = ansichtAusProjektdaten(daten({ building: BAU, systemId: 'layher-allround' }))!
    const m = generateCADModel(r.building, r.systemId)
    expect(m.fields.length).toBeGreaterThan(0)
  })
  it('Projekt ohne CAD-Daten / ohne System / mit ungültigen Maßen → null', () => {
    expect(ansichtAusProjektdaten(undefined)).toBeNull()
    expect(ansichtAusProjektdaten({})).toBeNull()
    expect(ansichtAusProjektdaten(daten({ building: BAU }))).toBeNull()
    expect(ansichtAusProjektdaten(daten({ building: { ...BAU, lengthM: 0 }, systemId: 's' }))).toBeNull()
    expect(ansichtAusProjektdaten(daten({ building: { ...BAU, widthM: 'zehn' }, systemId: 's' }))).toBeNull()
    expect(ansichtAusProjektdaten(daten({ building: { ...BAU, heightM: NaN }, systemId: 's' }))).toBeNull()
  })
  it('unbekannte Seiten und Dachformen werden bereinigt', () => {
    const r = ansichtAusProjektdaten(daten({ building: { ...BAU, sides: ['front', 'oben', 5], roofForm: 'unfug' }, systemId: 's' }))!
    expect(r.building.sides).toEqual(['front'])
    expect(r.building.roofForm).toBe('satteldach')
    expect(ansichtAusProjektdaten(daten({ building: { ...BAU, sides: [] }, systemId: 's' }))!.building.sides).toEqual(['front'])
  })
  it('Balkone und Abschnitte bleiben erhalten, ungültige fallen weg', () => {
    const r = ansichtAusProjektdaten(daten({
      building: {
        ...BAU,
        balconies: [
          { id: 'a', side: 'front', offsetAlongM: 1, widthM: 3, depthM: 1.2, floorIndex: 1, alleLagen: true, modus: 'ausgespart' },
          { id: 'b', side: 'oben', offsetAlongM: 1, widthM: 3, depthM: 1.2, floorIndex: 1 },
          { id: 'c', side: 'front', offsetAlongM: 'x', widthM: 3, depthM: 1.2, floorIndex: 1 },
        ],
        sections: [{ laengeM: 10, hoeheM: 8, bezeichnung: 'A' }, { laengeM: 5, hoeheM: 6 }, { laengeM: -1, hoeheM: 6 }],
      },
      systemId: 's',
    }))!
    expect(r.building.balconies).toHaveLength(1)
    expect(r.building.balconies![0]).toMatchObject({ id: 'a', modus: 'ausgespart', alleLagen: true })
    expect(r.building.sections).toHaveLength(2)
  })
  it('ein einzelner Abschnitt wird nicht übernommen (wie im CAD: ab 2 Abschnitten)', () => {
    const r = ansichtAusProjektdaten(daten({ building: { ...BAU, sections: [{ laengeM: 10, hoeheM: 8 }] }, systemId: 's' }))!
    expect(r.building.sections).toBeUndefined()
  })
})
