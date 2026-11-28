import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { alleEintraege, sucheEintraege, HANDBUCH, KEINE_ANTWORT, sichtbarFuer } from '@/lib/hilfe-wissen'
import { pruefeHilfeAntwort } from '@/lib/hilfe-antwort'
import { NAV_GRUPPEN } from '@/components/shell/nav-config'

describe('Wissensbasis', () => {
  it('enthält jeden Menüpunkt mit seinen Rollen', () => {
    const l = alleEintraege()
    for (const g of NAV_GRUPPEN) for (const e of g.eintraege) {
      const w = l.find((x) => x.id === `m-${e.href.split('?')[0]}`)
      expect(w, e.href).toBeTruthy()
      expect(w!.rollen).toEqual(e.roles)
    }
  })
  it('Handbuch-Titel stehen auch auf der Hilfeseite', () => {
    const seite = readFileSync('app/hilfe/page.tsx', 'utf8')
    for (const h of HANDBUCH) expect(seite.includes(`titel: '${h.titel}'`), h.titel).toBe(true)
  })
})

describe('Suche', () => {
  it('findet Rechnungen und das KI-Angebot', () => {
    expect(sucheEintraege('Wo schreibe ich eine Rechnung?', 'admin')[0].eintrag.titel).toMatch(/Rechnung/)
    expect(sucheEintraege('Wie erstelle ich ein KI Angebot per Mail?', 'admin').map((t) => t.eintrag.id)).toContain('f-ki-angebot')
  })
  it('findet Menüpunkte über Stichwörter', () => {
    expect(sucheEintraege('wo ist die verladeliste', 'lager')[0].eintrag.id).toBe('m-/materialmanager')
  })
  it('ohne Treffer leer', () => {
    expect(sucheEintraege('Wie wird das Wetter morgen auf dem Mond', 'admin')).toEqual([])
    expect(sucheEintraege('???', 'admin')).toEqual([])
  })
  it('Rollen-Sicht', () => {
    const e = alleEintraege().find((x) => x.id === 'f-ki-angebot')!
    expect(sichtbarFuer(e, 'admin')).toBe(true); expect(sichtbarFuer(e, 'mitarbeiter')).toBe(false)
  })
})

describe('pruefeHilfeAntwort', () => {
  const quellen = alleEintraege().filter((e) => ['f-ki-angebot', 'm-/lager'].includes(e.id))
  it('übernimmt Antwort und Links nur aus bekannten Quellen', () => {
    const r = pruefeHilfeAntwort({ gefunden: true, antwort: 'Im Menü …', quellen: [1, 2, 9] }, quellen, 'admin')
    expect(r.gefunden).toBe(true); expect(r.links.map((l) => l.pfad).sort()).toEqual(['/aufmass/ki-angebot', '/lager'])
  })
  it('ohne gültige Quelle oder bei gefunden:false fester Satz', () => {
    expect(pruefeHilfeAntwort({ gefunden: true, antwort: 'x', quellen: [7] }, quellen, 'admin')).toMatchObject({ gefunden: false, antwort: KEINE_ANTWORT })
    expect(pruefeHilfeAntwort({ gefunden: false, antwort: 'x', quellen: [1] }, quellen, 'admin').antwort).toBe(KEINE_ANTWORT)
    expect(pruefeHilfeAntwort(null, quellen, 'admin').gefunden).toBe(false)
  })
  it('Seite, die die Rolle nicht sieht, wird nicht verlinkt und ehrlich benannt', () => {
    const r = pruefeHilfeAntwort({ gefunden: true, antwort: 'Dort.', quellen: [1] }, quellen, 'mitarbeiter')
    expect(r.links).toEqual([]); expect(r.antwort).toMatch(/nicht freigeschaltet/)
  })
})
