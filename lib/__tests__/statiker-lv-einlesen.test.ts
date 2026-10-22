import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { leseStatikerLv, leseStatikerLvXlsx } from '../statiker-lv-einlesen'

const blatt02 = {
  name: '02 Gerüstarbeiten',
  zeilen: [
    ['02.1', 'Arbeitsgerüste mit integrierten Traggerüsten am Turmschaft bis 32 m Höhe'],
    ['Systemgerüst als Modulgerüst nach DIN EN 12811, entsprechend der Lastklasse 4, Breitenklasse W09 (90 cm), 1. BA montieren'],
    ['02.3', 'Arbeitsgerüste mit int. Tragger. am Turmschaft bis ca. 21,5 m Höhe'],
  ],
}
const daten = { name: 'Daten Projekt', zeilen: [['Vorhaltung', 'Gesamt', 50], ['Gerüst unten', 40]] }

describe('Statiker-LV einlesen', () => {
  it('liest Lastklasse, Breitenklasse, Höhen und Standzeit mit Fundstelle', () => {
    const r = leseStatikerLv([blatt02, daten])
    expect(r.werte).toMatchObject({ stil: 'statiker', lastklasse: 4, breitenklasseManuell: 'W09', geruestHoeheAusschreibungM: 32, hoeheBa2M: 21.5, gesamtStandzeitWochen: 50 })
    expect(r.nichtGefunden).toEqual([])
    expect(r.gefunden.find((g) => g.label === 'Lastklasse')!.fundstelle).toContain('Zeile 2')
  })

  it('was fehlt, wird nicht erfunden und steht unter „nichtGefunden“', () => {
    const r = leseStatikerLv([{ name: 'x', zeilen: [['Gerüst ohne Angaben']] }])
    expect(r.werte).toEqual({ stil: 'statiker' })
    expect(r.nichtGefunden).toEqual(['Lastklasse', 'Breitenklasse', 'Gerüsthöhe laut Ausschreibung', '2. Bauabschnitt: Höhe', 'Standzeit gesamt'])
  })

  it('„SW09“ wird zu W09; unbekannte Lastklasse wird ignoriert', () => {
    const r = leseStatikerLv([{ name: 'x', zeilen: [['Lastklasse 9, Breitenklasse SW09']] }])
    expect(r.werte.breitenklasseManuell).toBe('W09')
    expect(r.werte.lastklasse).toBeUndefined()
  })
})

// Echte Datei (zu groß/privat fürs Repo): nur mit STATIKER_LV_XLSX=<Pfad>
const echt = process.env.STATIKER_LV_XLSX
describe.skipIf(!echt || !existsSync(echt))('Statiker-LV Wuppertal (echte Datei)', () => {
  it('liest die Werte aus dem Excel', async () => {
    const buf = readFileSync(echt!)
    const r = await leseStatikerLvXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
    expect(r.werte).toMatchObject({ lastklasse: 4, breitenklasseManuell: 'W09', geruestHoeheAusschreibungM: 32, hoeheBa2M: 21.5, gesamtStandzeitWochen: 50 })
  })
})
