import { describe, it, expect } from 'vitest'
import { ansprechpartnerAusKunde } from '../kunde-vorbelegung'

const leer = { ansprechpartnerName: '', ansprechpartnerTelefon: '', ansprechpartnerEmail: '', adresse: '' }

describe('ansprechpartnerAusKunde', () => {
  it('füllt leere Felder aus dem Kundenstamm', () => {
    const r = ansprechpartnerAusKunde(leer, { contact_person: ' Anna Beispiel ', phone: '0151 1', email: 'a@b.de' })
    expect(r).toMatchObject({ ansprechpartnerName: 'Anna Beispiel', ansprechpartnerTelefon: '0151 1', ansprechpartnerEmail: 'a@b.de' })
  })
  it('überschreibt Eingetragenes nicht und lässt die Adresse unberührt', () => {
    const r = ansprechpartnerAusKunde({ ...leer, ansprechpartnerName: 'Bernd', adresse: 'Baustelle 1' }, { contact_person: 'Anna', phone: '1' })
    expect(r.ansprechpartnerName).toBe('Bernd')
    expect(r.ansprechpartnerTelefon).toBe('1')
    expect(r.adresse).toBe('Baustelle 1')
  })
  it('fehlende Kundendaten bleiben leer', () => {
    expect(ansprechpartnerAusKunde(leer, {}).ansprechpartnerEmail).toBe('')
  })
})
