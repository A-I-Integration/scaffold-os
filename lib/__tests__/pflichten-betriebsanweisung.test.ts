import { describe, it, expect } from 'vitest'
import { leerePflichten, pflichtenFehlt } from '../pflichtenuebertragung'
import { leereBetriebsanweisung, betriebsanweisungFehlt } from '../betriebsanweisung'

describe('pflichtenuebertragung', () => {
  it('leer', () => expect(pflichtenFehlt(leerePflichten('2026-10-27'))).toEqual(['Übertragende Person', 'Beauftragte Person', 'Aufgaben', 'Unterschrift Übertragender', 'Unterschrift Beauftragter']))
  it('vollständig, Befugnisse und Bereich optional', () => expect(pflichtenFehlt({ ...leerePflichten('2026-10-27'), uebertragender: 'A', beauftragter: 'B', aufgaben: 'x', unterschrift_uebertragender: 's', unterschrift_beauftragter: 't' })).toEqual([]))
  it('Leerzeichen zählen nicht', () => expect(pflichtenFehlt({ ...leerePflichten('2026-10-27'), uebertragender: ' ', beauftragter: 'B', aufgaben: 'x', unterschrift_uebertragender: 's', unterschrift_beauftragter: 't' })).toEqual(['Übertragende Person']))
})

describe('betriebsanweisung', () => {
  it('leer', () => expect(betriebsanweisungFehlt(leereBetriebsanweisung('2026-10-27'))).toEqual(['Geltungsbereich', 'Gefahren', 'Schutzmaßnahmen', 'Ersteller', 'Unterschrift']))
  it('vollständig, Störung und Erste Hilfe optional', () => expect(betriebsanweisungFehlt({ ...leereBetriebsanweisung('2026-10-27'), geltungsbereich: 'g', gefahren: 'x', schutzmassnahmen: 'y', ersteller: 'E', unterschrift: 's' })).toEqual([]))
})
