import { describe, it, expect } from 'vitest'
import { KATEGORIEN, KATEGORIE_FRISTEN, FRIST_ARTEN, plusMonate, fristStatus, fristText, erinnerungFuerFrist, richtwertIntervall, pruefeFristEingabe } from '@/lib/fahrzeug-fristen'

describe('Fahrzeug-Fristen', () => {
  it('plusMonate: gleicher Tag, Monatsende und Jahreswechsel', () => {
    expect(plusMonate('2026-03-15', 12)).toBe('2027-03-15')
    expect(plusMonate('2026-01-31', 1)).toBe('2026-02-28')
    expect(plusMonate('2024-01-31', 1)).toBe('2024-02-29')
    expect(plusMonate('2026-11-30', 3)).toBe('2027-02-28')
    expect(plusMonate('2026-08-10', 24)).toBe('2028-08-10')
  })
  it('Status: überfällig, bald (30 Tage), ok', () => {
    expect(fristStatus('2026-11-17', '2026-11-18').status).toBe('ueberfaellig')
    expect(fristStatus('2026-12-18', '2026-11-18').status).toBe('bald')
    expect(fristStatus('2026-12-19', '2026-11-18').status).toBe('ok')
    expect(fristText('2026-11-18', '2026-11-18')).toBe('heute fällig')
    expect(fristText('2026-11-15', '2026-11-18')).toBe('seit 3 Tagen überfällig')
    expect(fristText('2026-11-19', '2026-11-18')).toBe('in 1 Tag')
  })
  it('Erinnerung: 14 Tage vorher, dann 7 Tage vorher, je nur einmal', () => {
    const f = { faelligAm: '2026-12-02' }
    expect(erinnerungFuerFrist(f, '2026-11-17')).toBeNull()
    expect(erinnerungFuerFrist(f, '2026-11-18')).toBe(14)
    expect(erinnerungFuerFrist({ ...f, erinnerungFuer: '2026-12-02', erinnerungT14: '2026-11-18' }, '2026-11-19')).toBeNull()
    expect(erinnerungFuerFrist({ ...f, erinnerungFuer: '2026-12-02', erinnerungT14: '2026-11-18' }, '2026-11-25')).toBe(7)
    expect(erinnerungFuerFrist({ ...f, erinnerungFuer: '2026-12-02', erinnerungT14: '2026-11-18', erinnerungT7: '2026-11-25' }, '2026-11-30')).toBeNull()
  })
  it('Erinnerung: neues Fälligkeitsdatum zählt von vorn, überfällig = keine Erinnerung', () => {
    const alt = { erinnerungFuer: '2026-12-02', erinnerungT14: '2026-11-18', erinnerungT7: '2026-11-25' }
    expect(erinnerungFuerFrist({ ...alt, faelligAm: '2027-12-02' }, '2027-11-20')).toBe(14)
    expect(erinnerungFuerFrist({ faelligAm: '2026-11-01' }, '2026-11-18')).toBeNull()
  })
  it('Richtwerte: HU je nach Gewicht, SP nur schwer, ohne Gewicht keine Zahl', () => {
    expect(richtwertIntervall('hu', { art: 'lkw', gesamtgewichtKg: 7500 }).monate).toBe(12)
    expect(richtwertIntervall('hu', { art: 'lkw', gesamtgewichtKg: 3500 }).monate).toBe(24)
    expect(richtwertIntervall('hu', { art: 'lkw' }).monate).toBeNull()
    expect(richtwertIntervall('hu', { art: 'transporter', gesamtgewichtKg: 3000 }).monate).toBe(24)
    expect(richtwertIntervall('sp', { art: 'lkw', gesamtgewichtKg: 18000 }).monate).toBe(6)
    expect(richtwertIntervall('sp', { art: 'transporter', gesamtgewichtKg: 3000 }).monate).toBeNull()
    expect(richtwertIntervall('uvv', { art: 'lkw' }).monate).toBe(12)
    expect(richtwertIntervall('wartung', { art: 'lkw' }).monate).toBeNull()
  })
  it('Eingabeprüfung', () => {
    expect(pruefeFristEingabe({ art: 'hu', faellig_am: '2026-12-02' })).toBeNull()
    expect(pruefeFristEingabe({ art: 'xx', faellig_am: '2026-12-02' })).not.toBeNull()
    expect(pruefeFristEingabe({ art: 'hu', faellig_am: '02.12.2026' })).not.toBeNull()
    expect(pruefeFristEingabe({ art: 'hu', faellig_am: '2026-12-02', intervall_monate: 0 })).not.toBeNull()
    expect(pruefeFristEingabe({ art: 'hu', faellig_am: '2026-12-02', letzte_pruefung: '2025-12-02', intervall_monate: 12 })).toBeNull()
  })
  it('Kategorien: jede Prüfart ist bekannt, jede Kategorie hat Auswahl', () => {
    for (const k of KATEGORIEN) { expect(KATEGORIE_FRISTEN[k].length).toBeGreaterThan(0); for (const a of KATEGORIE_FRISTEN[k]) expect(FRIST_ARTEN).toContain(a) }
  })
  it('Richtwerte Mitarbeiter/Betrieb: Unterweisung 12, Ersthelfer 24, Führerschein ohne Zahl', () => {
    expect(richtwertIntervall('unterweisung', { art: 'sonstiges' }).monate).toBe(12)
    expect(richtwertIntervall('erste_hilfe', { art: 'sonstiges' }).monate).toBe(24)
    expect(richtwertIntervall('fuehrerschein', { art: 'sonstiges' }).monate).toBeNull()
    expect(richtwertIntervall('dguv_v3', { art: 'sonstiges' }).monate).toBeNull()
  })
})
