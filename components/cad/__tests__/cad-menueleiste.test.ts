import { describe, it, expect } from 'vitest'
import { sichtbareGruppen } from '../CadMenueleiste'
describe('Menüleiste', () => {
  it('lässt leere Gruppen weg', () => {
    const g = sichtbareGruppen([{ titel: 'Datei', eintraege: [{ label: 'Speichern', onClick: () => {} }] }, { titel: 'Ausgabe', eintraege: [] }])
    expect(g.map((x) => x.titel)).toEqual(['Datei'])
  })
})
