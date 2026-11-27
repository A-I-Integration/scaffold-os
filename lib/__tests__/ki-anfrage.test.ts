import { describe, it, expect } from 'vitest'
import { baueAufmassDaten, laengeAusFlaeche, extrahiereAdresse, fehlendeAngaben, findeKunden, pruefeKiAntwort, zahlImText, baueAnfrageDaten, projektName } from '../ki-anfrage'

const TEXT = 'Kunde Müller GmbH benötigt ein Fassadengerüst in Vreden, ungefähr 250 m², Arbeitshöhe 8 Meter, sechs Wochen. Aufbau Anfang Januar. Bahnhofstraße 12, 48691 Vreden'

describe('zahlImText', () => {
  it('Ziffern, Komma und Zahlwörter', () => {
    expect(zahlImText(250, TEXT)).toBe(true)
    expect(zahlImText(8, TEXT)).toBe(true)
    expect(zahlImText(6, TEXT)).toBe(true) // „sechs“
    expect(zahlImText(7, TEXT)).toBe(false)
    expect(zahlImText(12, TEXT, { einheit: /m(?![²2a-zäöüß])|meter/, stichwort: /höhe[^0-9]{0,12}$/ })).toBe(false) // 12 ist die Hausnummer
    expect(zahlImText(8, 'Höhe: 8', { einheit: /m/, stichwort: /höhe[^0-9]{0,12}$/ })).toBe(true)
    expect(zahlImText(2.5, 'Höhe 2,5 m')).toBe(true)
  })
  it('Zahlwort nur als ganzes Wort', () => {
    expect(zahlImText(8, 'achtung baustelle')).toBe(false)
    expect(zahlImText(1, 'keine Angabe')).toBe(false)
  })
})

describe('extrahiereAdresse', () => {
  it('liest Straße und PLZ/Ort lokal', () => {
    expect(extrahiereAdresse(TEXT)).toEqual({ strasse: 'Bahnhofstraße 12', plz: '48691', ort: 'Vreden' })
    expect(extrahiereAdresse('nur in Vreden')).toEqual({ strasse: null, plz: null, ort: null })
  })
})

describe('pruefeKiAntwort', () => {
  const gut = { kunde: 'Müller GmbH', ort: 'Vreden', leistung: 'Fassadengerüst', flaeche_m2: 250, arbeitshoehe_m: 8, standzeit_wochen: 6, wunschtermin: 'Anfang Januar', bemerkung: null }
  it('übernimmt belegte Angaben', () => {
    const r = pruefeKiAntwort(gut, TEXT)
    expect(r.verworfen).toEqual([])
    expect(r.entwurf).toMatchObject({ kunde: 'Müller GmbH', flaeche_m2: 250, arbeitshoehe_m: 8, standzeit_wochen: 6, strasse: 'Bahnhofstraße 12', plz: '48691', ort: 'Vreden' })
    expect(fehlendeAngaben(r.entwurf)).toEqual([])
  })
  it('verwirft Erfundenes und meldet es', () => {
    const r = pruefeKiAntwort({ ...gut, kunde: 'Schmidt AG', flaeche_m2: 400, arbeitshoehe_m: 12, wunschtermin: 'März' }, TEXT)
    expect(r.entwurf.kunde).toBeNull()
    expect(r.entwurf.flaeche_m2).toBeNull()
    expect(r.entwurf.arbeitshoehe_m).toBeNull()
    expect(r.entwurf.wunschtermin).toBeNull()
    expect(r.verworfen).toHaveLength(4)
    expect(fehlendeAngaben(r.entwurf)).toEqual(['Kunde', 'Fläche (m²)', 'Arbeitshöhe (m)'])
  })
  it('Unbrauchbare Antwort ergibt leeren Entwurf', () => {
    const r = pruefeKiAntwort('quatsch', 'Hallo')
    expect(Object.values(r.entwurf).every((v) => v === null)).toBe(true)
    expect(fehlendeAngaben(r.entwurf)).toContain('Kunde')
  })
  it('Zahlen als Text mit Komma', () => {
    const r = pruefeKiAntwort({ flaeche_m2: '120,5' }, 'etwa 120,5 qm')
    expect(r.entwurf.flaeche_m2).toBe(120.5)
    expect(pruefeKiAntwort({ flaeche_m2: 120.5 }, 'etwa 120,5 Meter').entwurf.flaeche_m2).toBeNull()
  })
  it('Ort aus dem Text hat Vorrang vor der KI', () => {
    expect(pruefeKiAntwort({ ort: 'Borken' }, TEXT).entwurf.ort).toBe('Vreden')
    expect(pruefeKiAntwort({ ort: 'Vreden' }, 'Gerüst in Vreden').entwurf.ort).toBe('Vreden')
  })
})

describe('findeKunden', () => {
  const kunden = [{ id: '1', name: 'Müller GmbH' }, { id: '2', name: 'Müller Bau' }, { id: '3', name: 'Schmidt' }]
  it('exakt ohne Rechtsform, ähnlich per Teilstring', () => {
    expect(findeKunden('Mueller', kunden)).toEqual([])
    expect(findeKunden('Müller', kunden).map((t) => [t.kunde.id, t.art])).toEqual([['1', 'exakt'], ['2', 'aehnlich']])
    expect(findeKunden('müller gmbh', kunden)[0]).toMatchObject({ kunde: { id: '1' }, art: 'exakt' })
  })
  it('zu kurz oder leer: keine Treffer', () => {
    expect(findeKunden(null, kunden)).toEqual([])
    expect(findeKunden('Mü', kunden)).toEqual([])
  })
})

describe('Projektdaten', () => {
  it('Name und Quelle', () => {
    const e = pruefeKiAntwort({ kunde: 'Müller GmbH', ort: 'Vreden', leistung: 'Fassadengerüst' }, TEXT).entwurf
    expect(projektName(e)).toBe('Fassadengerüst Vreden')
    expect(baueAnfrageDaten(e, TEXT, new Date('2026-11-27T12:00:00Z'))).toMatchObject({ quelle: 'ki-chat', erfasst_am: '2026-11-27T12:00:00.000Z', kunde: 'Müller GmbH' })
  })
})

describe('Aufmaß-Vorbefüllung', () => {
  const e = pruefeKiAntwort({ kunde: 'Müller GmbH', ort: 'Vreden', leistung: 'Fassadengerüst', flaeche_m2: 250, arbeitshoehe_m: 8, standzeit_wochen: 6, wunschtermin: 'Anfang Januar' }, TEXT).entwurf
  it('Länge = Fläche ÷ Höhe', () => {
    expect(laengeAusFlaeche(250, 8)).toBe(31.25)
    expect(laengeAusFlaeche(250, null)).toBeNull()
    expect(laengeAusFlaeche(0, 8)).toBeNull()
  })
  it('füllt Schritt 1 und 2, Kundenname bleibt Projektname', () => {
    const d = baueAufmassDaten(e, { id: 'k1', name: 'Müller GmbH' }, TEXT)
    expect(d.step1).toMatchObject({ name: 'Müller GmbH', customerId: 'k1', adresse: 'Bahnhofstraße 12, 48691 Vreden', baustelle: 'Fassadengerüst', dauer: '6', notizen: 'Wunschtermin: Anfang Januar' })
    expect(d.step2).toEqual({ laenge: '31.25', hoehe: '8' })
    expect(d.anfrage.quelle).toBe('ki-chat')
  })
  it('ohne Maße kein Schritt 2, ohne Kunden-Pflicht bei vorgegebenem Kunden', () => {
    const leer = pruefeKiAntwort({}, 'Hallo Welt, bitte Gerüst').entwurf
    expect(baueAufmassDaten(leer, { id: 'k', name: 'X' }, 'x').step2).toBeUndefined()
    expect(fehlendeAngaben(leer, { ohneKunde: true })).not.toContain('Kunde')
    expect(fehlendeAngaben(leer)).toContain('Kunde')
  })
})
