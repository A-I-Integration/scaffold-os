import { describe, it, expect } from 'vitest'
import { gruppiereStopps, routenAdressen, uhrzeitKurz, type StoppLike } from '../touren/stopp-gruppen'

const st = (id: string, order: number, address: string, name: string | null, qty = 1, status = 'pending', project_id: string | null = 'p1'): StoppLike => ({
  id, stop_order: order, address, status, project_id,
  transport_order: name ? { quantity: qty, inventory: { name } } : null,
})

describe('gruppiereStopps', () => {
  it('9 Materialzeilen an einer Adresse = eine Karte mit Materialliste', () => {
    const stops = Array.from({ length: 9 }, (_, i) => st('s' + i, i + 1, 'Ölbachstr. 48', 'Artikel ' + i, 10 + i))
    const g = gruppiereStopps(stops)
    expect(g).toHaveLength(1)
    expect(g[0].stops).toHaveLength(9)
    expect(g[0].offeneStops).toHaveLength(9)
    expect(g[0].material).toHaveLength(9)
    expect(g[0].status).toBe('offen')
    expect(g[0].schluessel).toBe('s0')
  })

  it('gleiche Artikel werden zusammengezählt, Reihenfolge bleibt', () => {
    const g = gruppiereStopps([st('a', 1, 'X 1', 'Rahmen', 50), st('b', 2, 'X 1', 'Bühne', 25), st('c', 3, 'X 1', 'Rahmen', 20)])
    expect(g[0].material).toEqual([{ name: 'Rahmen', quantity: 70 }, { name: 'Bühne', quantity: 25 }])
  })

  it('Schreibweise der Adresse (Leerzeichen, Groß/Klein) spielt keine Rolle', () => {
    expect(gruppiereStopps([st('a', 1, 'Ölbachstr.  48', 'A'), st('b', 2, ' ölbachstr. 48 ', 'B')])).toHaveLength(1)
  })

  it('verschiedene Adressen bleiben getrennte Karten in Tour-Reihenfolge (auch bei unsortierter Eingabe)', () => {
    const g = gruppiereStopps([st('c', 3, 'C 3', 'x'), st('a', 1, 'A 1', 'x'), st('b', 2, 'B 2', 'x')])
    expect(g.map((x) => x.address)).toEqual(['A 1', 'B 2', 'C 3'])
  })

  it('dieselbe Adresse nicht direkt hintereinander wird NICHT zusammengelegt', () => {
    const g = gruppiereStopps([st('a', 1, 'A 1', 'x'), st('b', 2, 'B 2', 'x'), st('c', 3, 'A 1', 'x')])
    expect(g).toHaveLength(3)
  })

  it('gleiche Adresse, aber anderes Projekt: getrennte Karten', () => {
    expect(gruppiereStopps([st('a', 1, 'A 1', 'x', 1, 'pending', 'p1'), st('b', 2, 'A 1', 'x', 1, 'pending', 'p2')])).toHaveLength(2)
    expect(gruppiereStopps([st('a', 1, 'A 1', 'x', 1, 'pending', null), st('b', 2, 'A 1', 'x', 1, 'pending', null)])).toHaveLength(1)
  })

  it('Status: offen solange ein Stopp offen ist, sonst erledigt bzw. übersprungen', () => {
    expect(gruppiereStopps([st('a', 1, 'A', 'x', 1, 'completed'), st('b', 2, 'A', 'x', 1, 'pending')])[0].status).toBe('offen')
    expect(gruppiereStopps([st('a', 1, 'A', 'x', 1, 'completed'), st('b', 2, 'A', 'x', 1, 'completed')])[0].status).toBe('completed')
    expect(gruppiereStopps([st('a', 1, 'A', 'x', 1, 'skipped'), st('b', 2, 'A', 'x', 1, 'skipped')])[0].status).toBe('skipped')
    expect(gruppiereStopps([st('a', 1, 'A', 'x', 1, 'completed'), st('b', 2, 'A', 'x', 1, 'skipped')])[0].status).toBe('skipped')
  })

  it('offeneStops enthält nur noch nicht erledigte (Teil-Fehler beim Abschließen bleiben bedienbar)', () => {
    const g = gruppiereStopps([st('a', 1, 'A', 'x', 1, 'completed'), st('b', 2, 'A', 'x', 1, 'pending')])[0]
    expect(g.offeneStops.map((s) => s.id)).toEqual(['b'])
  })

  it('Stopp ohne Transportauftrag: keine Materialzeile, Karte bleibt', () => {
    const g = gruppiereStopps([st('a', 1, 'A', null)])
    expect(g).toHaveLength(1)
    expect(g[0].material).toEqual([])
  })

  it('leere Liste', () => { expect(gruppiereStopps([])).toEqual([]) })
})

describe('routenAdressen', () => {
  it('aufeinanderfolgende gleiche Adressen nur einmal', () => {
    const stops = [st('a', 1, 'A 1', 'x'), st('b', 2, 'A 1', 'x'), st('c', 3, 'B 2', 'x'), st('d', 4, 'A 1', 'x')]
    expect(routenAdressen(stops)).toEqual(['A 1', 'B 2', 'A 1'])
  })
})

describe('uhrzeitKurz', () => {
  it('schneidet Sekunden ab', () => {
    expect(uhrzeitKurz('07:00:00')).toBe('07:00')
    expect(uhrzeitKurz('7:05:30')).toBe('07:05')
    expect(uhrzeitKurz('07:00')).toBe('07:00')
    expect(uhrzeitKurz('06:30:00.123')).toBe('06:30')
  })
  it('unbekannte Werte bleiben unverändert, leer bleibt leer', () => {
    expect(uhrzeitKurz('früh')).toBe('früh')
    expect(uhrzeitKurz(null)).toBe('')
    expect(uhrzeitKurz(undefined)).toBe('')
  })
})
