import { describe, it, expect } from 'vitest'
import { dateiTypErkennen } from '../datei-typ'

describe('dateiTypErkennen', () => {
  it('Ansicht mit Richtung aus Dateiname und Schriftfeld: hoch', () => {
    expect(dateiTypErkennen('UP-04_Kirchturm_Ansicht_West_1-100_A2_.pdf', ['Übersichtsplanung', 'Ansicht West', 'Maßstab 1:100'])).toEqual({ art: 'ansicht', richtung: 'West', sicherheit: 'hoch' })
  })
  it('echte Dateinamen der Kirchen-Pläne', () => {
    expect(dateiTypErkennen('241128_02_-03_Citykirche-Wuppertal-Kirchturm_Ansicht_Ost_1-100_A3_.pdf')).toEqual({ art: 'ansicht', richtung: 'Ost', sicherheit: 'mittel' })
    expect(dateiTypErkennen('241128_02_-04_Citykirche-Wuppertal-Kirchturm_Ansicht_West_1-100_A2_.pdf')).toMatchObject({ art: 'ansicht', richtung: 'West' })
  })
  it('nur aus dem Dateinamen: mittel', () => {
    expect(dateiTypErkennen('Grundriss_EG.pdf')).toEqual({ art: 'grundriss', sicherheit: 'mittel' })
  })
  it('Süd in beiden Schreibweisen', () => {
    expect(dateiTypErkennen('x.pdf', ['Ansicht Sued'])).toMatchObject({ richtung: 'Süd' })
    expect(dateiTypErkennen('x.pdf', ['Ansicht Süd'])).toMatchObject({ richtung: 'Süd' })
  })
  it('Dateiname und Plantext widersprechen sich: unbekannt statt raten', () => {
    expect(dateiTypErkennen('Grundriss.pdf', ['Ansicht Ost'])).toEqual({ art: 'unbekannt', sicherheit: 'niedrig' })
  })
  it('mehrdeutige Stichworte und nichts Erkennbares: unbekannt', () => {
    expect(dateiTypErkennen('Ansicht und Schnitt.pdf')).toEqual({ art: 'unbekannt', sicherheit: 'niedrig' })
    expect(dateiTypErkennen('scan0042.pdf')).toEqual({ art: 'unbekannt', sicherheit: 'niedrig' })
  })
  it('Statik, Leistungsverzeichnis, Scan-Formate', () => {
    expect(dateiTypErkennen('Statik Kirchturm.pdf').art).toBe('statik')
    expect(dateiTypErkennen('Leistungsverzeichnis.xlsx').art).toBe('lv')
    expect(dateiTypErkennen('turm.e57').art).toBe('scan')
  })
})
