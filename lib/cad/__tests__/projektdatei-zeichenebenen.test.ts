import { describe, it, expect } from 'vitest'
import { erzeugeProjektdatei, liesProjektdatei } from '../projektdatei'
import { bereinigeStatikDaten } from '@/lib/statik-daten'
import { standardZeichenebenen, ebeneHinzufuegen, setzeSichtbar, objektZuordnen, type Zeichenebenen } from '../zeichenebenen'

const gebaeude = { lengthM: 14, widthM: 6, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'] } as never
const basis = { building: gebaeude, systemId: 'x', statikDaten: bereinigeStatikDaten({}), notizen: [] }
const ok = (e: { ok: boolean }) => (e as unknown as { zustand: Zeichenebenen }).zustand

describe('Projektdatei: Zeichenebenen', () => {
  it('Ausgangszustand und ältere Dateien: Feld fehlt, Laden unverändert möglich', () => {
    const d = erzeugeProjektdatei({ ...basis, zeichenebenen: standardZeichenebenen() })
    expect('zeichenebenen' in d).toBe(false)
    const e = liesProjektdatei(JSON.stringify(d))
    expect(e.ok && e.daten.zeichenebenen).toBeUndefined()
    expect(e.ok && e.verworfen.filter((v) => v.startsWith('Zeichenebenen'))).toEqual([])
  })
  it('geänderte Ebenen überstehen Speichern und Laden', () => {
    let z = ok(ebeneHinzufuegen(standardZeichenebenen(), 'Kran', 'e1'))
    z = ok(setzeSichtbar(z, 'std-notizen', false))
    z = ok(objektZuordnen(z, 'mass:1', 'std-bemassungen', 'e1'))
    const e = liesProjektdatei(JSON.stringify(erzeugeProjektdatei({ ...basis, zeichenebenen: z })))
    expect(e.ok && e.daten.zeichenebenen).toEqual(z)
  })
  it('Zeichenebenen berühren Gerüstlagen/Gebäude nicht', () => {
    const z = ok(setzeSichtbar(standardZeichenebenen(), 'std-geruest', false))
    const d = erzeugeProjektdatei({ ...basis, zeichenebenen: z })
    const ohne = erzeugeProjektdatei({ ...basis })
    expect(d.building).toEqual(ohne.building)
    expect(d.systemId).toBe(ohne.systemId)
    expect(d.statikDaten).toEqual(ohne.statikDaten)
  })
  it('beschädigtes Feld bricht das Laden nicht ab', () => {
    const d = JSON.parse(JSON.stringify(erzeugeProjektdatei({ ...basis })))
    d.zeichenebenen = { ebenen: 'kaputt', zuordnung: 7 }
    const e = liesProjektdatei(JSON.stringify(d))
    expect(e.ok).toBe(true)
  })
})
