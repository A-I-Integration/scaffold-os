import { describe, it, expect, vi } from 'vitest'
import { werkzeugEintraege, type WerkzeugleisteProps } from '../CadWerkzeugleiste'

const basis = (o: Partial<WerkzeugleisteProps> = {}): WerkzeugleisteProps => ({
  hatModell: true, rahmenAktiv: false, onRahmen: vi.fn(), auswahlAnzahl: 0, bereicheOffen: false, bereichWerkzeug: 'entfernen', onBereichWerkzeug: vi.fn(),
  abbauAktiv: false, onAbbau: vi.fn(), measureMode: false, messart: 'abstand', onMessart: vi.fn(), treppePanelAktiv: false, onTreppePanel: vi.fn(), geruestfeldPanelAktiv: false,
  onGeruestfeldPanel: vi.fn(), onAuswahlAufheben: vi.fn(), ...o,
})
describe('CAD-Werkzeugleiste', () => {
  it('ruft die vorhandenen Handler auf', () => {
    const p = basis()
    const e = Object.fromEntries(werkzeugEintraege(p).map((x) => [x.id, x]))
    e.anhaengen.onClick(); expect(p.onBereichWerkzeug).toHaveBeenCalledWith('erweitern')
    e.aufstocken.onClick(); expect(p.onBereichWerkzeug).toHaveBeenCalledWith('aufstocken')
    e['messen-winkel'].onClick(); expect(p.onMessart).toHaveBeenCalledWith('winkel')
    e.treppe.onClick(); expect(p.onTreppePanel).toHaveBeenCalled()
  })
  it('markiert aktive Werkzeuge und sperrt ohne Modell', () => {
    const e = werkzeugEintraege(basis({ bereicheOffen: true, bereichWerkzeug: 'aufstocken', measureMode: true, messart: 'hoehe' }))
    expect(e.find((x) => x.id === 'aufstocken')?.aktiv).toBe(true)
    expect(e.find((x) => x.id === 'anhaengen')?.aktiv).toBe(false)
    expect(e.find((x) => x.id === 'messen-hoehe')?.aktiv).toBe(true)
    expect(e.find((x) => x.id === 'messen-abstand')?.aktiv).toBe(false)
    expect(werkzeugEintraege(basis({ hatModell: false })).filter((x) => x.id !== 'aufheben').every((x) => x.aus)).toBe(true)
  })
  it('bietet kein Werkzeug ohne vorhandene Funktion an', () => {
    const ids = werkzeugEintraege(basis({ onTreppePanel: undefined, onGeruestfeldPanel: undefined })).map((x) => x.id)
    expect(ids).not.toContain('treppe'); expect(ids).not.toContain('feld')
  })
})
