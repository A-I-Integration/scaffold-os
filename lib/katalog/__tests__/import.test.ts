import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bereiteImportVor, berichtAlsCsv, eindeutigkeitsSchluessel } from '../import'
import { parseDezimal, versionAusDateiname, zerlegeArtikelnummer } from '../normalisieren'
import { schlageKategorieVor } from '../kategorien'
import { zeilenAusTabelle, parseCsv } from '../adapter-tabelle'
import { kontextVonListe, zeilenAusBestand, type BestandArtikel, type QuellenDatei } from '../adapter-bestand'
import type { ImportKontext, RohZeile } from '../typen'

const ctx = (o: Partial<ImportKontext> = {}): ImportKontext => ({
  herstellerSchluessel: 'mj-geruest', systemSchluessel: 'optima', systemart: 'systemkomponente', dokumentSha256: 'abc', ...o,
})
const zeile = (nummer: string, attribute: RohZeile['attribute'] = {}, extra: Partial<RohZeile> = {}): RohZeile =>
  ({ zeile: 1, nummer, attribute, ...extra })
const eins = (z: RohZeile, c = ctx()) => bereiteImportVor([z], c).zeilen[0]

describe('1 Herstellerimport', () => {
  it('übernimmt Nummer, Maße, Gewicht und setzt nie eine Freigabe', () => {
    const r = eins(zeile('000318', { 'Länge (m)': 0.3, 'Gewicht (kg)': 2.4 }, { gruppe: 'BELÄGE', preis: 17.8 }))
    expect(r.ergebnis).toBe('neu')
    expect(r.artikel).toMatchObject({ laenge_m: 0.3, gewicht_referenz_kg: 2.4, pruefstatus: 'ungeprueft', freigabestatus: 'nicht_freigegeben', listenpreis_netto: 17.8 })
  })
  it('Rohwerte bleiben vollständig erhalten', () => {
    const a = { 'Länge (m)': 0.3, 'Gewicht (kg)': 2.4, Info: 'Sonderteil' }
    expect(eins(zeile('1', a)).artikel?.attribute_roh).toEqual(a)
  })
})

describe('2 Artikelnummern mit Suffixen', () => {
  it('trennt Suffix, behält Original', () => {
    expect(zerlegeArtikelnummer('12345U')).toMatchObject({ original: '12345U', basis: '12345', suffix: 'U' })
    expect(zerlegeArtikelnummer('AL1234567L')).toMatchObject({ basis: 'AL1234567', suffix: 'L' })
    expect(zerlegeArtikelnummer('E10RS0123')).toMatchObject({ suffix: null })
  })
  it('Varianten wie _01 oder /99 werden nicht interpretiert', () => {
    expect(zerlegeArtikelnummer('12345_01')).toMatchObject({ basis: '12345_01', suffix: null, kombiniert: false })
    expect(zerlegeArtikelnummer('E10FS1234/99').kombiniert).toBe(false)
  })
  it('kombinierte Nummern werden als unsicher gemeldet, nicht aufgeteilt', () => {
    expect(zerlegeArtikelnummer('12345 / 67890').kombiniert).toBe(true)
    expect(zerlegeArtikelnummer('12345/E10AG1234').kombiniert).toBe(true)
    expect(eins(zeile('12345 / 67890')).ergebnis).toBe('unsicher')
  })
  it('Nummern mit und ohne Suffix sind verschiedene Artikel', () => {
    const b = bereiteImportVor([zeile('12345'), zeile('12345U')], ctx())
    expect(b.neu).toBe(2)
  })
  it('normalisiert zum Suchen', () => {
    expect(zerlegeArtikelnummer('e10 rs-0123').normalisiert).toBe('E10RS0123')
  })
})

describe('3 Dublettenerkennung', () => {
  it('erkennt Dublette im selben Dokument, behält die erste Zeile', () => {
    const b = bereiteImportVor([zeile('1', { 'Gewicht (kg)': 1 }), zeile('1', { 'Gewicht (kg)': 1 })], ctx())
    expect(b.zeilen.map((z) => z.ergebnis)).toEqual(['neu', 'dublette'])
  })
  it('Dublette mit abweichenden Werten: erste Zeile wird zur Prüfung markiert, nichts geht still verloren', () => {
    const b = bereiteImportVor([zeile('1', { 'Länge (m)': 4, 'Gewicht (kg)': 40 }), zeile('1', { 'Länge (m)': 5, 'Gewicht (kg)': 50 })], ctx())
    expect(b.zeilen.map((z) => z.ergebnis)).toEqual(['unsicher', 'dublette'])
    expect(b.zeilen[1].meldungen.join()).toMatch(/ABWEICHENDEN.*Gewicht: 40 ↔ 50/)
  })
  it('schützt vor erneutem Import bereits vorhandener Artikel', () => {
    const k = ctx()
    const vorhanden = new Set([eindeutigkeitsSchluessel({ herstellerSchluessel: k.herstellerSchluessel, systemSchluessel: k.systemSchluessel, artikelnummer_original: '1', dokumentSha256: k.dokumentSha256 })])
    expect(bereiteImportVor([zeile('1')], k, vorhanden).dubletten).toBe(1)
  })
  it('dieselbe Nummer in anderem Dokument ist keine Dublette (Gewichte bleiben nachvollziehbar getrennt)', () => {
    const a = bereiteImportVor([zeile('1', { 'Gewicht (kg)': 2.4 })], ctx({ dokumentSha256: 'A' })).zeilen[0].schluessel
    const b = bereiteImportVor([zeile('1', { 'Gewicht (kg)': 2.5 })], ctx({ dokumentSha256: 'B' })).zeilen[0].schluessel
    expect(a).not.toBe(b)
  })
})

describe('4 Gewichtszuordnung', () => {
  it('"Gewicht (kg)" bleibt Herstellerangabe, Art ungeklärt', () => {
    expect(eins(zeile('1', { 'Gewicht (kg)': 2.4 })).artikel?.gewichtsart).toBe('herstellerangabe_unklar')
  })
  it('nur "ca. kg" wird als ca-Gewicht gespeichert, nie als Nenngewicht', () => {
    const a = eins(zeile('1', { 'ca. kg': 4.2 })).artikel
    expect(a?.gewichtsart).toBe('ca')
    expect(a?.gewichtsart).not.toBe('nenn')
  })
  it('widersprüchliche Gewichte → unsicher, kein Wert übernommen', () => {
    const r = eins(zeile('1', { 'Gewicht (kg)': 2, 'ca. kg': 3 }))
    expect(r.ergebnis).toBe('unsicher')
    expect(r.artikel?.gewicht_referenz_kg).toBeNull()
  })
  it('unplausibel hohes Gewicht → unsicher', () => {
    expect(eins(zeile('1', { 'Gewicht (kg)': 5000 })).ergebnis).toBe('unsicher')
  })
  it('Maß 0 → unsicher, Maß nicht übernommen, Artikel bleibt erhalten', () => {
    const r = eins(zeile('1', { 'Breite (m)': 0, 'Gewicht (kg)': 13.3 }))
    expect(r.ergebnis).toBe('unsicher')
    expect(r.artikel).toMatchObject({ breite_m: null, gewicht_referenz_kg: 13.3 })
  })
  it('Gewicht 0 oder negativ → Fehler', () => {
    expect(eins(zeile('1', { 'Gewicht (kg)': 0 })).ergebnis).toBe('fehler')
    expect(eins(zeile('1', { 'Gewicht (kg)': -2 })).ergebnis).toBe('fehler')
  })
})

describe('5 Fehlende Werte', () => {
  it('fehlende Artikelnummer → Fehler', () => {
    expect(eins(zeile('  ')).ergebnis).toBe('fehler')
  })
  it('fehlendes Gewicht ist kein Fehler, wird aber gemeldet und nie geschätzt', () => {
    const r = eins(zeile('1', { 'Länge (m)': 1 }))
    expect(r.ergebnis).toBe('neu')
    expect(r.artikel?.gewicht_referenz_kg).toBeNull()
    expect(r.meldungen.join()).toContain('Kein Gewicht')
  })
})

describe('6 Dezimaltrennzeichen und Maßeinheiten', () => {
  it('deutsche und englische Formate', () => {
    expect(parseDezimal('1,5').wert).toBe(1.5)
    expect(parseDezimal('1.5').wert).toBe(1.5)
    expect(parseDezimal('1.234,5').wert).toBe(1234.5)
    expect(parseDezimal('1,234.5').wert).toBe(1234.5)
  })
  it('mehrdeutige Tausender/Dezimal-Schreibweise wird als unsicher markiert', () => {
    expect(parseDezimal('2.400').unsicher).toBe(true)
    expect(eins(zeile('1', { 'Gewicht (kg)': '2.400' })).ergebnis).toBe('unsicher')
  })
  it('rechnet mm/cm/m und g/kg um', () => {
    const a = eins(zeile('1', { 'Länge (cm)': '250', 'Breite (mm)': '320', 'Gewicht (g)': '1500', 'Durchmesser (mm)': '48,3' })).artikel
    expect(a).toMatchObject({ laenge_m: 2.5, breite_m: 0.32, gewicht_referenz_kg: 1.5, durchmesser_mm: 48.3 })
  })
  it('Text statt Zahl → unsicher, nichts übernommen', () => {
    const r = eins(zeile('1', { 'Gewicht (kg)': 'schwer' }))
    expect(r.ergebnis).toBe('unsicher')
    expect(r.artikel?.gewicht_referenz_kg).toBeNull()
  })
  it('Dokumentversion nur wenn im Dateinamen, sonst null', () => {
    expect(versionAusDateiname('MJ-Geruest-Preisliste-OPTIMA-V2.4-1.pdf')).toBe('2.4')
    expect(versionAusDateiname('DE_Preisliste_Allround.pdf')).toBeNull()
  })
})

describe('7 Mehrere Hersteller mit gleichen Artikelnummern', () => {
  it('gleiche Nummer bei Layher und MJ ergibt zwei getrennte Schlüssel', () => {
    const a = eins(zeile('100100'), ctx({ herstellerSchluessel: 'layher' })).schluessel
    const b = eins(zeile('100100'), ctx({ herstellerSchluessel: 'mj-geruest' })).schluessel
    expect(a).not.toBe(b)
  })
  it('gleiche Nummer in zwei Systemen desselben Herstellers bleibt getrennt', () => {
    const a = eins(zeile('1'), ctx({ systemSchluessel: 'optima' })).schluessel
    const b = eins(zeile('1'), ctx({ systemSchluessel: 'uni' })).schluessel
    expect(a).not.toBe(b)
  })
})

describe('Kategorien', () => {
  it('erkennt eindeutige Gruppen und kennzeichnet Unklares', () => {
    expect(schlageKategorieVor('KUPPLUNGEN')).toEqual({ schluessel: 'kupplungen', sicherheit: 'sicher' })
    expect(schlageKategorieVor('QUERDIAGONALE').schluessel).toBe('diagonalen')
    expect(schlageKategorieVor('Modulares Fassadengerüstsystem AGS')).toEqual({ schluessel: 'sonstige', sicherheit: 'unbekannt' })
    expect(schlageKategorieVor('')).toEqual({ schluessel: 'sonstige', sicherheit: 'unbekannt' })
  })
})

describe('Tabellen-Adapter (CSV/Excel)', () => {
  it('liest CSV mit Semikolon und deutschen Zahlen', () => {
    const csv = 'Artikelnummer;Bezeichnung;Länge (m);Gewicht (kg)\n"12345U";"Riegel, lang";2,5;"7,9"\n'
    const t = zeilenAusTabelle(parseCsv(csv))
    expect(t.fehler).toBeNull()
    const b = bereiteImportVor(t.zeilen, ctx())
    expect(b.zeilen[0].artikel).toMatchObject({ artikelnummer_original: '12345U', artikelnummer_suffix: 'U', bezeichnung: 'Riegel, lang', laenge_m: 2.5, gewicht_referenz_kg: 7.9 })
  })
  it('ohne Artikelnummer-Spalte wird nichts geraten', () => {
    expect(zeilenAusTabelle([['Foo', 'Bar'], ['1', '2']]).fehler).toMatch(/Artikelnummer/)
  })
  it('Fehlerbericht als CSV enthält nur auffällige Zeilen', () => {
    const b = bereiteImportVor([zeile('1', { 'Gewicht (kg)': 1 }, { bezeichnung: 'Riegel' }), zeile('')], ctx())
    expect(berichtAlsCsv(b).split('\n')).toHaveLength(2)
  })
})

// ---- Kompatibilität (8-10): Zusicherungen an die Migration und an die Trennung Referenz/Messung ----
const sql = readFileSync(join(__dirname, '../../../supabase/phase-107-hersteller-katalog.sql'), 'utf8')

describe('8 Materialzuordnung zu Baustellen / 9 bestehendes Lager', () => {
  it('Migration ändert bestehende Lagertabellen nur durch eine neue, optionale Spalte', () => {
    const alter = (sql.match(/alter table[^;]+;/gi) ?? []).filter((a) => !/enable row level security/i.test(a))
    expect(alter).toHaveLength(1)
    expect(alter[0]).toMatch(/public\.inventory add column if not exists katalog_artikel_id uuid references/i)
    expect(sql).not.toMatch(/(update|delete from|drop table|truncate)\s+public\.(inventory|site_stock|inventory_transactions)/i)
    expect(alter[0]).not.toMatch(/not null/i)
  })
  it('Messungen können einer Baustelle zugeordnet werden', () => {
    expect(sql).toMatch(/project_id\s+uuid references public\.projects/)
  })
})

describe('10 Kompatibilität mit SCAFFOLD WM', () => {
  it('Messdaten stehen in eigener Tabelle, verbunden über die Material-ID', () => {
    expect(sql).toMatch(/create table if not exists public\.gewicht_messungen/)
    expect(sql).toMatch(/material_id\s+uuid not null references public\.katalog_artikel\(id\)/)
    expect(sql).toMatch(/gestell_id/); expect(sql).toMatch(/lkw_id/); expect(sql).toMatch(/lagerort/)
  })
  it('keine Gewichts-Ist-Spalte im Katalog, kein Schreibpfad von Messung in Katalog', () => {
    const katalogTabelle = sql.slice(sql.indexOf('create table if not exists public.katalog_artikel ('), sql.indexOf('create unique index if not exists katalog_artikel_eindeutig'))
    expect(katalogTabelle).not.toMatch(/gewicht_ist/)
    expect(sql).not.toMatch(/update public\.katalog_artikel[\s\S]{0,80}gewicht_messungen/)
  })
  it('Freigabe nur durch Admin, Rohwerte unveränderlich, kein Löschrecht', () => {
    expect(sql).toMatch(/nur von einem Admin freigegeben/)
    expect(sql).toMatch(/Rohwerte sind unveränderlich/)
    expect(sql).not.toMatch(/for delete/i)
    expect(sql).toMatch(/gewicht_messungen_anlegen[\s\S]{0,200}freigegeben_fuer_berechnung = false/)
  })
  it('Gewichtsart-Vorgabe ist "ungeklärt", nicht "nenn"', () => {
    expect(sql).toMatch(/gewichtsart\s+text not null default 'herstellerangabe_unklar'/)
  })
})

describe('Bestand-Adapter mit echten Katalogdaten', () => {
  const mj = JSON.parse(readFileSync(join(__dirname, '../../data/mj-katalog.json'), 'utf8')) as BestandArtikel[]
  const layher = JSON.parse(readFileSync(join(__dirname, '../../data/layher-katalog.json'), 'utf8')) as BestandArtikel[]
  const quellen = JSON.parse(readFileSync(join(__dirname, '../../data/katalog-quellen.json'), 'utf8')) as QuellenDatei

  it('jede Liste hat ein Dokument mit SHA-256', () => {
    for (const liste of new Set([...mj, ...layher].map((a) => a.l))) {
      expect(quellen.dokumente[liste]?.sha256, liste).toMatch(/^[0-9a-f]{64}$/)
    }
  })
  it('importiert nichts als freigegeben, nichts doppelt über alle Listen', () => {
    const alle = [...mj, ...layher]
    const gesehen = new Set<string>()
    let gesamt = 0
    for (const liste of new Set(alle.map((a) => a.l))) {
      const b = bereiteImportVor(zeilenAusBestand(alle, liste, quellen), kontextVonListe(liste, quellen), gesehen)
      for (const z of b.zeilen) {
        expect(z.artikel?.freigabestatus ?? 'nicht_freigegeben').toBe('nicht_freigegeben')
        if (z.ergebnis === 'neu' || z.ergebnis === 'unsicher') gesehen.add(z.schluessel!)
      }
      gesamt += b.gesamt
    }
    expect(gesamt).toBe(alle.length)
  })
})
