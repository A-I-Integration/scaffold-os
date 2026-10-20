import { describe, it, expect } from 'vitest'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
import { pruefeGeruest, anzahlText } from '../regelpruefung'
import { richtwertErgebnisse, datumZahl, ECHTER_KATALOG, type RichtwertKatalog } from '../richtwert-regeln'

const bau: BuildingParams = {
  lengthM: 12, widthM: 8, heightM: 14, eavesHeightM: 14, roofHeightM: 0, roofForm: 'flachdach',
  floors: 5, floorHeightsM: Array(5).fill(2.8), windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'], lastklasse: 3,
}
const windOk = { windnorm: 'DIN EN 1991-1-4 mit Nationalem Anhang', vrefMs: 25, gelaende: 'III' as const }
const HEUTE = new Date(2026, 9, 20) // 20.10.2026

// MJ-Plus gehört laut Zuordnung zur Liste 'combi'. Die Katalogdaten unten sind FIXTURES, keine echten Werte.
const model = generateCADModel(bau, 'mj-plus')
const weiten = [...new Set(model.fields.map((f) => Math.round(f.lengthM * 100) / 100))]
const maxWeite = Math.max(...weiten)

function katalog(opt: { maxLk?: number; bisM?: number; bis?: string[]; ohneTabelle?: boolean; ohneZulassung?: boolean } = {}): RichtwertKatalog {
  const bis = opt.bis ?? ['31.12.2030']
  return {
    listen: { combi: { name: 'FIXTURE-Serie', zulassungen: opt.ohneZulassung ? [] : bis.map((b, i) => ({ nummer: `Z-FIX-${i + 1}`, bescheidVom: '01.01.2020', gueltigBis: b, gegenstand: 'Fixture' })) } },
    lastklassen: opt.ohneTabelle ? {} : {
      combi: {
        liste: 'combi', zulassung: 'Z-FIX-1', tabelle: 'Tabelle FIX', stand: 'Fixture-Stand',
        belaege: [{ belag: 'Fixture-Belag A', anlage: 'A1', stufen: [{ bisM: opt.bisM ?? maxWeite, lk: opt.maxLk ?? 6 }] }],
      },
    },
  }
}
const ids = (r: { id: string }[]) => r.map((x) => x.id)

describe('Richtwert: Belag und Lastklasse (Katalog-Tabelle der Zulassung)', () => {
  it('Einhaltung: grün mit Quelle (Katalog, Serie, Feldname)', () => {
    const r = richtwertErgebnisse(model, { katalog: katalog({ maxLk: 6 }), heute: HEUTE }).find((x) => x.id === 'RICHTWERT_BELAG_LASTKLASSE')!
    expect(r.status).toBe('ok')
    expect(r.art).toBe('geprueft')
    expect(r.quelle).toContain('FIXTURE-Serie (combi)')
    expect(r.quelle).toContain('Z-FIX-1')
    expect(r.quelle).toContain("LASTKLASSEN_TABELLEN['combi']")
    expect(r.begruendung).toContain('Fixture-Belag A')
  })
  it('Grenzwert genau erreicht (höchste Lastklasse = geplante) zählt als eingehalten', () => {
    const r = richtwertErgebnisse(model, { katalog: katalog({ maxLk: 3 }), heute: HEUTE }).find((x) => x.id === 'RICHTWERT_BELAG_LASTKLASSE')!
    expect(r.status).toBe('ok')
  })
  it('Verletzung: Tabelle erlaubt nur Lastklasse 2, geplant 3 → verletzt mit Quelle', () => {
    const r = richtwertErgebnisse(model, { katalog: katalog({ maxLk: 2 }), heute: HEUTE }).find((x) => x.id === 'RICHTWERT_BELAG_LASTKLASSE')!
    expect(r.status).toBe('verletzt')
    expect(r.art).toBe('geprueft')
    expect(r.quelle).toContain('Z-FIX-1')
    expect(r.begruendung).toContain('keine der 1 Belagarten')
  })
  it('Feldweite außerhalb der Tabelle (kein Belag deckt sie ab) → verletzt', () => {
    const r = richtwertErgebnisse(model, { katalog: katalog({ bisM: maxWeite - 1 }), heute: HEUTE }).find((x) => x.id === 'RICHTWERT_BELAG_LASTKLASSE')!
    expect(r.status).toBe('verletzt')
    expect(r.begruendung).toContain('außerhalb der Tabelle')
  })
})

describe('Richtwert: Zulassung gültig (Feld gueltigBis)', () => {
  const finde = (k: RichtwertKatalog, heute = HEUTE) => richtwertErgebnisse(model, { katalog: k, heute }).find((x) => x.id === 'RICHTWERT_ZULASSUNG_GUELTIG')
  it('gültig: grün mit Quelle und Prüfdatum', () => {
    const r = finde(katalog({ bis: ['31.12.2030'] }))!
    expect(r.status).toBe('ok')
    expect(r.quelle).toContain("MJ_LISTEN['combi'].zulassungen[].gueltigBis")
    expect(r.quelle).toContain('20.10.2026')
  })
  it('letzter Gültigkeitstag selbst ist noch gültig, der Tag danach nicht', () => {
    expect(finde(katalog({ bis: ['20.10.2026'] }))!.status).toBe('ok')
    expect(finde(katalog({ bis: ['19.10.2026'] }))!.status).toBe('verletzt')
  })
  it('alle abgelaufen → verletzt', () => {
    const r = finde(katalog({ bis: ['01.01.2020', '02.02.2021'] }))!
    expect(r.status).toBe('verletzt')
    expect(r.begruendung).toContain('Z-FIX-1')
    expect(r.begruendung).toContain('Z-FIX-2')
  })
  it('teils abgelaufen: nur Hinweis (Katalog ordnet Zulassungen keiner Variante zu), zählt nicht für die Ampel', () => {
    const r = finde(katalog({ bis: ['01.01.2020', '31.12.2030'] }))!
    expect(r.art).toBe('hinweis')
    expect(r.status).toBe('warnung')
  })
  it('datumZahl: gültige und ungültige Formate', () => {
    expect(datumZahl('04.09.2030')).toBe(20300904)
    for (const x of ['2030-09-04', '4.9.2030', '', '31.13.2030', '00.01.2030']) expect(datumZahl(x)).toBeNull()
  })
})

describe('Richtwert: fehlender Katalogwert → Regel schweigt (nichts erfunden)', () => {
  it('Serie ohne Tabelle: keine Belag-Regel, Zulassungs-Regel bleibt', () => {
    expect(ids(richtwertErgebnisse(model, { katalog: katalog({ ohneTabelle: true }), heute: HEUTE }))).toEqual(['RICHTWERT_ZULASSUNG_GUELTIG'])
  })
  it('Serie ohne Zulassungseintrag: keine Gültigkeits-Regel, Belag-Regel bleibt', () => {
    expect(ids(richtwertErgebnisse(model, { katalog: katalog({ ohneZulassung: true }), heute: HEUTE }))).toEqual(['RICHTWERT_BELAG_LASTKLASSE'])
  })
  it('weder Tabelle noch Zulassung: gar kein Ergebnis', () => {
    expect(richtwertErgebnisse(model, { katalog: katalog({ ohneTabelle: true, ohneZulassung: true }), heute: HEUTE })).toEqual([])
    expect(richtwertErgebnisse(model, { katalog: { listen: {}, lastklassen: {} }, heute: HEUTE })).toEqual([])
  })
  it('keine Lastklasse im Modell: Belag-Regel schweigt (die Regel „Lastklasse angegeben“ meldet das bereits)', () => {
    const m2 = generateCADModel({ ...bau, lastklasse: undefined }, 'mj-plus')
    const r = richtwertErgebnisse(m2, { katalog: katalog(), heute: HEUTE })
    expect(ids(r)).toEqual(['RICHTWERT_ZULASSUNG_GUELTIG'])
  })
  it('unlesbares Datum in gueltigBis: wird nicht bewertet', () => {
    expect(ids(richtwertErgebnisse(model, { katalog: katalog({ bis: ['irgendwann'] }), heute: HEUTE }))).toEqual(['RICHTWERT_BELAG_LASTKLASSE'])
  })
  it('System ohne Katalogserie (z. B. kein Gerüstsystem): kein Ergebnis', () => {
    const ohne = { ...model, system: null }
    expect(richtwertErgebnisse(ohne, { katalog: katalog(), heute: HEUTE })).toEqual([])
  })
  it('Katalog führt KEINE Felder für Höhe/Anker: es gibt keine Regel dafür', () => {
    const alle = ids(richtwertErgebnisse(model, { katalog: katalog(), heute: HEUTE }))
    expect(alle.filter((i) => /HOEHE|ANKER/.test(i))).toEqual([])
  })
})

describe('Serie ohne Eckdaten: Verhalten wie bisher', () => {
  const layher = generateCADModel(bau, 'layher-allround')
  it('echter Katalog: Layher Allround hat keine Zulassungs-Eckdaten und keine Tabelle → keine Richtwert-Ergebnisse', () => {
    const p = pruefeGeruest(layher, windOk, { heute: HEUTE })
    expect(p.ergebnisse.filter((r) => r.id.startsWith('RICHTWERT_'))).toEqual([])
    expect(p.anzahl.verletzt).toBe(0)
    expect(p.ergebnisse.every((r) => (r.art === 'geprueft' || r.art === 'hinweis') && r.status !== 'verletzt')).toBe(true)
  })
  it('Ergebnis ist mit leerem Katalog Zeichen für Zeichen dasselbe wie mit dem echten', () => {
    const a = pruefeGeruest(layher, windOk, { heute: HEUTE })
    const b = pruefeGeruest(layher, windOk, { heute: HEUTE, katalog: { listen: {}, lastklassen: {} } })
    expect(a).toEqual(b)
  })
  it('anzahlText ohne verletzte Richtwerte: unverändertes Format', () => {
    expect(anzahlText({ ok: 5, warnung: 2, fehler: 1, verletzt: 0 })).toBe('5 OK, 2 Warnungen, 1 Fehler')
  })
})

describe('Prüfprotokoll mit verletztem Richtwert', () => {
  it('verletzt ist rot (Ampel), zählt separat und sperrt nichts', () => {
    const p = pruefeGeruest(model, windOk, { katalog: katalog({ maxLk: 2 }), heute: HEUTE })
    expect(p.ampel).toBe('verletzt')
    expect(p.anzahl.verletzt).toBe(1)
    expect(anzahlText(p.anzahl)).toMatch(/1 Richtwert verletzt$/)
    expect(p.ergebnisse.length).toBeGreaterThan(5) // die übrigen Regeln laufen weiter, nichts wird abgebrochen
    expect(p.hinweis).toContain('Kein Standsicherheitsnachweis')
  })
  it('alles eingehalten: grüne Ergebnisse mit Quelle, Ampel nicht schlechter durch die Richtwerte', () => {
    const p = pruefeGeruest(model, windOk, { katalog: katalog({ maxLk: 6 }), heute: HEUTE })
    const rw = p.ergebnisse.filter((r) => r.id.startsWith('RICHTWERT_'))
    expect(rw.map((r) => r.status)).toEqual(['ok', 'ok'])
    expect(rw.every((r) => r.quelle.includes('Katalog'))).toBe(true)
    expect(p.anzahl.verletzt).toBe(0)
  })
})

describe('Echter Katalog (Smoke-Test)', () => {
  it('MJ COMBI: Belag-Regel und Zulassungs-Regel mit Fundstelle Z-8.22-921', () => {
    const r = richtwertErgebnisse(model, { katalog: ECHTER_KATALOG, heute: HEUTE })
    expect(ids(r)).toEqual(['RICHTWERT_BELAG_LASTKLASSE', 'RICHTWERT_ZULASSUNG_GUELTIG'])
    expect(r[0].quelle).toContain('Z-8.22-921')
    expect(r[1].quelle).toContain("MJ_LISTEN['combi']")
    expect(r[1].begruendung).toContain('Z-8.22-921')
    expect(r[1].status).toBe('ok')
  })
})
