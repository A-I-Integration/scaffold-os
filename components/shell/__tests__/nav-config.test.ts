import { describe, it, expect } from 'vitest'
import { NAV_GRUPPEN, NAV_UEBERSICHT, sichtbareGruppen, findeAktuell, istAktiverPfad, type Rolle } from '../nav-config'

const ROLLEN: Rolle[] = ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager']
const alleLinks = (r: Rolle) => sichtbareGruppen(r).flatMap((g) => g.eintraege.map((e) => e.href))

describe('Menüstruktur', () => {
  it('jede Seite steht genau einmal im Menü', () => {
    const alle = NAV_GRUPPEN.flatMap((g) => g.eintraege.map((e) => e.href))
    expect(new Set(alle).size).toBe(alle.length)
  })

  it('Aufmaß ist für Chef, Bauleitung und Mitarbeiter sichtbar, nicht für Lager', () => {
    expect(alleLinks('mitarbeiter')).toContain('/aufmass/schritt1')
    expect(alleLinks('bauleiter')).toContain('/aufmass/schritt1')
    expect(alleLinks('admin')).toContain('/aufmass/schritt1')
    expect(alleLinks('lager')).not.toContain('/aufmass/schritt1')
  })

  it('Einstellungen und Datenpflege nur für den Chef', () => {
    for (const r of ROLLEN.filter((x) => x !== 'admin')) {
      expect(alleLinks(r)).not.toContain('/einstellungen')
      expect(alleLinks(r)).not.toContain('/datenpflege')
    }
    expect(alleLinks('admin')).toContain('/einstellungen')
  })

  it('jede Rolle hat mindestens einen Menüpunkt, Hilfe und Meine Touren/E-Mail sind für alle da', () => {
    for (const r of ROLLEN) {
      expect(alleLinks(r).length).toBeGreaterThan(0)
      expect(alleLinks(r)).toContain('/hilfe')
      expect(alleLinks(r)).toContain('/meine-email')
    }
  })

  it('Übersicht nur für Chef und Disposition', () => {
    expect(NAV_UEBERSICHT.roles).toEqual(['admin', 'disponent'])
  })
})

describe('Rubrik Personal', () => {
  const personal = (r: Rolle) => sichtbareGruppen(r).find((g) => g.key === 'personal')?.eintraege.map((e) => e.href) ?? []
  it('bündelt Mitarbeiter, Touren, Zeiterfassung, Stundenzettel und Arbeitsschutz', () => {
    expect(personal('admin')).toEqual(['/mitarbeiter', '/meine-touren', '/zeiterfassung', '/stundenzettel', '/arbeitsschutz'])
  })
  it('Rollen sehen nur ihre Punkte; Meine Touren bleibt für alle da', () => {
    expect(personal('mitarbeiter')).toEqual(['/meine-touren', '/stundenzettel'])
    expect(personal('lager')).toEqual(['/meine-touren', '/stundenzettel'])
    expect(personal('bauleiter')).toEqual(['/meine-touren', '/zeiterfassung', '/stundenzettel'])
    expect(personal('disponent')).toEqual(['/mitarbeiter', '/meine-touren', '/zeiterfassung', '/stundenzettel', '/arbeitsschutz'])
  })
  it('die Punkte stehen nicht mehr unter Ausführung oder Betrieb, Kolonnen bleibt bei der Einsatzplanung in Ausführung', () => {
    for (const k of ['ausfuehrung', 'betrieb']) {
      const h = NAV_GRUPPEN.find((g) => g.key === k)!.eintraege.map((e) => e.href)
      for (const x of ['/mitarbeiter', '/meine-touren', '/zeiterfassung', '/stundenzettel', '/arbeitsschutz']) expect(h).not.toContain(x)
    }
    expect(NAV_GRUPPEN.find((g) => g.key === 'ausfuehrung')!.eintraege.map((e) => e.href)).toContain('/kolonnen')
    expect(NAV_GRUPPEN.find((g) => g.key === 'personal')!.nummer).toBeUndefined()
  })
})

describe('aktive Seite', () => {
  it('Unterseiten von /cad markieren den eigenen Punkt, nicht CAD', () => {
    expect(findeAktuell('admin', '/cad/bruecke')?.eintrag.href).toBe('/cad/bruecke')
    expect(findeAktuell('admin', '/cad')?.eintrag.href).toBe('/cad')
  })
  it('alle Aufmaß-Schritte gehören zu Aufmaß', () => {
    expect(findeAktuell('admin', '/aufmass/schritt4')?.eintrag.label).toBe('Aufmaß')
    expect(istAktiverPfad('/aufmass/schritt1', '/aufmass/schritt6')).toBe(true)
  })
  it('Rechnungen und Faktura stehen nicht mehr im Menü (sie liegen im Kundenordner, Reiter Faktura)', () => {
    expect(findeAktuell('admin', '/rechnungen')).toBeNull()
    expect(findeAktuell('admin', '/rechnungen/123')).toBeNull()
  })
  it('unbekannte Seite hat keinen aktiven Punkt', () => {
    expect(findeAktuell('admin', '/gibt-es-nicht')).toBeNull()
  })
})
