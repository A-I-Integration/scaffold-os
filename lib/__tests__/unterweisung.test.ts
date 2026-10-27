import { describe, it, expect } from 'vitest'
import { leereUnterweisung, unterweisungFehlt } from '../unterweisung'

const ok = () => ({ ...leereUnterweisung('2026-10-27'), thema: 'T', unterweiser: 'U', teilnehmer: [{ name: 'A', unterschrift: 'x' }] })

describe('unterweisung', () => {
  it('leer', () => expect(unterweisungFehlt(leereUnterweisung('2026-10-27'))).toEqual(['Thema', 'Unterweisende Person', 'Teilnehmer 1: Name']))
  it('vollständig', () => expect(unterweisungFehlt(ok())).toEqual([]))
  it('Unterschrift fehlt', () => expect(unterweisungFehlt({ ...ok(), teilnehmer: [{ name: 'A' }] })).toEqual(['Teilnehmer 1 (A): Unterschrift']))
  it('ohne Teilnehmer', () => expect(unterweisungFehlt({ ...ok(), teilnehmer: [] })).toEqual(['mindestens ein Teilnehmer']))
  it('Inhalt optional', () => expect(unterweisungFehlt({ ...ok(), inhalt: '' })).toEqual([]))
})
