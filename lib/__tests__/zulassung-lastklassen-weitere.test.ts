import { describe, it, expect } from 'vitest'
import { LASTKLASSEN_WEITERE, lastklassenZulassung } from '../data/zulassung-lastklassen-weitere'
import { maxLastklasse, pruefeTabelle } from '../data/zulassung-lastklassen'
import { MJ_LISTEN, MJ_WEITERE_ZULASSUNGEN } from '../mj-katalog'

describe('Lastklassen weiterer MJ-Zulassungen', () => {
  it('Gültigkeit stimmt mit den Zulassungen im Katalog überein', () => {
    const alle = [...Object.values(MJ_LISTEN).flatMap((l) => l.zulassungen), ...MJ_WEITERE_ZULASSUNGEN]
    for (const z of LASTKLASSEN_WEITERE) {
      const k = alle.find((a) => a.nummer === z.zulassung)
      expect(k, z.zulassung).toBeDefined()
      expect(z.gueltigBis, z.zulassung).toBe(k!.gueltigBis)
    }
  })
  it('Stufen aufsteigend in der Feldweite, fallend in der Lastklasse; jede Zeile hat Anlage', () => {
    for (const z of LASTKLASSEN_WEITERE) for (const b of z.belaege) {
      expect(b.anlage.length).toBeGreaterThan(0)
      for (let i = 1; i < b.stufen.length; i++) {
        expect(b.stufen[i].bisM).toBeGreaterThan(b.stufen[i - 1].bisM)
        expect(b.stufen[i].lk).toBeLessThanOrEqual(b.stufen[i - 1].lk)
      }
    }
  })
  it('Z-8.1-303 enthält keine Tabelle, Teil-Bescheide sind als nur-aenderungen markiert', () => {
    expect(lastklassenZulassung('Z-8.1-303')!.belaege).toHaveLength(0)
    for (const n of ['Z-8.22-923', 'Z-8.1-184', 'Z-8.1-922']) expect(lastklassenZulassung(n)!.umfang).toBe('nur-aenderungen')
  })
  it('liest Stichproben wie im Bescheid', () => {
    const duo = lastklassenZulassung('Z-8.22-926')!
    const alu = duo.belaege.find((b) => b.anlage.startsWith('11.01.00'))!
    expect(maxLastklasse(alu, 2.57)).toBe(4)
    expect(maxLastklasse(alu, 3.07)).toBe(3)
    const m = lastklassenZulassung('Z-8.22-960')!.belaege.find((b) => b.anlage === '105')!
    expect(maxLastklasse(m, 2.0)).toBe(4)
    expect(maxLastklasse(m, 2.3)).toBe(3)
    expect(maxLastklasse(m, 2.5)).toBeNull()
    const u = lastklassenZulassung('Z-8.1-872')!.belaege.find((b) => b.anlage === '06.01.00')!
    expect(maxLastklasse(u, 4.14)).toBe(3)
  })
  it('pruefeTabelle meldet zu hohe Lastklasse', () => {
    const r = pruefeTabelle(lastklassenZulassung('Z-8.1-935')!, [3.07], 4)
    expect(r.zeilen.some((z) => z.ergebnis === 'zu-hoch')).toBe(true)
    expect(r.zeilen.find((z) => z.anlage === '06.07.00')!.ergebnis).toBe('ok')
  })
})

import { generateCADModel, type BuildingParams } from '../calculations/cad-engine'
import { baueLastannahmenDaten } from '../export/lastannahmen'
import { statikPruefpunkte } from '../statik-pruefpunkte'
import { zulassungenFuerListe } from '../data/zulassung-lastklassen-weitere'

const basis: BuildingParams = {
  lengthM: 12, widthM: 8, heightM: 12, eavesHeightM: 12, roofHeightM: 0, roofForm: 'flachdach',
  floors: 4, floorHeightsM: Array(4).fill(3), windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front'], lastklasse: 4,
}

describe('Einbindung in Lastannahmen und Prüfpunkte', () => {
  it('nur vollständig vorliegende Zulassungen werden geprüft', () => {
    expect(zulassungenFuerListe('uni-connect').map((z) => z.zulassung).sort()).toEqual(['Z-8.1-872', 'Z-8.1-935'])
    expect(zulassungenFuerListe('combi-metric-top').map((z) => z.zulassung)).toEqual(['Z-8.22-960'])
  })
  it('UNI-CONNECT bekommt je Zulassung einen Abschnitt 6.x und Prüfpunkte, mit Hinweis auf offene Zuordnung', () => {
    const m = generateCADModel({ ...basis }, 'mj-uniconnect')
    const d = baueLastannahmenDaten(m, {}, { projektName: 'T', firma: 'F', datum: '19.11.2026' })
    const s = d.sektionen.filter((x) => x.titel.startsWith('6.'))
    expect(s.length).toBe(2)
    expect(s[0].zeilen.some((z) => z.label === 'Zuordnung')).toBe(true)
    expect(statikPruefpunkte(m, {}).filter((p) => p.id.startsWith('belag-lk-')).length).toBe(2)
  })
})

import { bereinigeStatikDaten } from '../statik-daten'
import { zulassungenFuerProjekt } from '../data/zulassung-lastklassen-weitere'

describe('Gewählte Zulassung', () => {
  it('bereinigt unbekannte Nummern', () => {
    expect(bereinigeStatikDaten({ zulassung: 'Z-8.1-872' }).zulassung).toBe('Z-8.1-872')
    expect(bereinigeStatikDaten({ zulassung: 'Z-0-0' }).zulassung).toBeUndefined()
  })
  it('gewählte Zulassung ersetzt die Kandidatenliste, falsche Liste wird ignoriert', () => {
    expect(zulassungenFuerProjekt('uni-connect', 'Z-8.1-935')).toMatchObject({ gewaehlt: true })
    expect(zulassungenFuerProjekt('uni-connect', 'Z-8.1-935').tabellen).toHaveLength(1)
    expect(zulassungenFuerProjekt('uni-connect', 'Z-8.22-960').gewaehlt).toBe(false)
  })
  it('Abschnitt 6 und Prüfpunkt nennen die gewählte Zulassung', () => {
    const m = generateCADModel({ ...basis }, 'mj-uniconnect')
    const d = baueLastannahmenDaten(m, { zulassung: 'Z-8.1-935' }, { projektName: 'T', firma: 'F', datum: '19.11.2026' })
    const s = d.sektionen.filter((x) => x.titel.startsWith('6'))
    expect(s).toHaveLength(1)
    expect(s[0].zeilen.find((z) => z.label === 'Zuordnung')!.wert).toBe('Vom Planer gewählt.')
    const p = statikPruefpunkte(m, { zulassung: 'Z-8.1-935' }).filter((x) => x.id.startsWith('belag-lk-'))
    expect(p).toHaveLength(1)
    expect(p[0].text).toContain('vom Planer gewählt')
  })
})
