import { describe, it, expect } from 'vitest'
import { speicherStatus } from '../speicherstatus'

const t = (s: number) => new Date(2026, 0, 1, 12, 0, s)
const basis = { online: true, kontoLaeuft: false, fehler: false, gesichertUm: t(10), kontoGespeichertUm: null }

describe('speicherStatus', () => {
  it('ohne Konto-Projekt: gespeichert', () => expect(speicherStatus(basis)).toBe('gespeichert'))
  it('Konto gespeichert nach letzter Änderung: gespeichert', () => expect(speicherStatus({ ...basis, kontoGespeichertUm: t(20) })).toBe('gespeichert'))
  it('Änderung nach Konto-Speichern: Änderungen vorhanden', () => expect(speicherStatus({ ...basis, gesichertUm: t(30), kontoGespeichertUm: t(20) })).toBe('aenderungen'))
  it('Speichern läuft hat Vorrang', () => expect(speicherStatus({ ...basis, kontoLaeuft: true, fehler: true, online: false })).toBe('laeuft'))
  it('Fehler vor Offline', () => expect(speicherStatus({ ...basis, fehler: true, online: false })).toBe('fehler'))
  it('Offline', () => expect(speicherStatus({ ...basis, online: false })).toBe('offline'))
})
