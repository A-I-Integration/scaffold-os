import { describe, it, expect } from 'vitest'
import { ABSENCE_TYPES, ABSENCE_TYPE_LABEL, ABSENCE_TYPE_BADGE, istAbsenceType, absenceLabel, planeNachGenehmigungUm } from '../abwesenheit'

describe('Abwesenheitsarten', () => {
  it('jede Art hat Bezeichnung und Farbe', () => {
    for (const t of ABSENCE_TYPES) { expect(ABSENCE_TYPE_LABEL[t]).toBeTruthy(); expect(ABSENCE_TYPE_BADGE[t]).toBeTruthy() }
  })
  it('kennt Schlechtwetter und Gleitzeit, lehnt Unbekanntes ab', () => {
    expect(istAbsenceType('weather')).toBe(true)
    expect(istAbsenceType('flextime')).toBe(true)
    expect(istAbsenceType('xyz')).toBe(false)
    expect(istAbsenceType(undefined)).toBe(false)
    expect(absenceLabel('xyz')).toBe('Sonstiges')
  })
  it('Schlechtwetter wird nicht automatisch umgeplant', () => {
    expect(planeNachGenehmigungUm('weather')).toBe(false)
    expect(planeNachGenehmigungUm('vacation')).toBe(true)
    expect(planeNachGenehmigungUm('flextime')).toBe(true)
  })
})
