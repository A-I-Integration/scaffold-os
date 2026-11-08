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

describe('aktive Seite', () => {
  it('Unterseiten von /cad markieren den eigenen Punkt, nicht CAD', () => {
    expect(findeAktuell('admin', '/cad/bruecke')?.eintrag.href).toBe('/cad/bruecke')
    expect(findeAktuell('admin', '/cad')?.eintrag.href).toBe('/cad')
  })
  it('alle Aufmaß-Schritte gehören zu Aufmaß', () => {
    expect(findeAktuell('admin', '/aufmass/schritt4')?.eintrag.label).toBe('Aufmaß')
    expect(istAktiverPfad('/aufmass/schritt1', '/aufmass/schritt6')).toBe(true)
  })
  it('Neue Rechnung markiert nie die Seite, Rechnungen schon', () => {
    expect(findeAktuell('admin', '/rechnungen')?.eintrag.label).toBe('Rechnungen')
    expect(findeAktuell('admin', '/rechnungen/123')?.gruppe.key).toBe('abrechnung')
  })
  it('unbekannte Seite hat keinen aktiven Punkt', () => {
    expect(findeAktuell('admin', '/gibt-es-nicht')).toBeNull()
  })
})
