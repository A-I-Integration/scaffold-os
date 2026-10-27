import { describe, it, expect } from 'vitest'
import { leereUebergabe, uebergabeFehlt } from '../uebergabeprotokoll'

describe('uebergabeprotokoll', () => {
  it('leer meldet alles', () => expect(uebergabeFehlt(leereUebergabe('2026-10-27'))).toEqual(['Übergebener Umfang', 'Name Übergeber', 'Name Übernehmer', 'Unterschrift Übergeber', 'Unterschrift Übernehmer']))
  it('vollständig', () => expect(uebergabeFehlt({ ...leereUebergabe('2026-10-27'), umfang: 'Fassade Nord', uebergeber: 'A', uebernehmer: 'B', unterschrift_uebergeber: 'x', unterschrift_uebernehmer: 'y' })).toEqual([]))
  it('Leerzeichen zählen nicht', () => expect(uebergabeFehlt({ ...leereUebergabe('2026-10-27'), umfang: '  ', uebergeber: 'A', uebernehmer: 'B', unterschrift_uebergeber: 'x', unterschrift_uebernehmer: 'y' })).toEqual(['Übergebener Umfang']))
  it('Vorbehalte sind optional', () => expect(uebergabeFehlt({ ...leereUebergabe('2026-10-27'), umfang: 'x', uebergeber: 'A', uebernehmer: 'B', unterschrift_uebergeber: 'x', unterschrift_uebernehmer: 'y', vorbehalte: '' })).toEqual([]))
})
