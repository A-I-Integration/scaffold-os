// ============================================================
// SCAFFOLD OS – Herstellerdatenbank: Import-Engine (reine Logik, schreibt nichts)
//
// bereiteImportVor() prüft jede Zeile und liefert einen Bericht (Trockenlauf). Erst die API schreibt
// "neu"-Zeilen in die Datenbank. Regeln:
//  - Original-Artikelnummer unverändert; Suffix getrennt
//  - Gewichte nur als Herstellerangabe: 'ca. kg' → Art "ca", alles andere → "herstellerangabe_unklar"
//    (keine automatische Einstufung als Nenngewicht), prüfstatus immer "ungeprueft", nie freigegeben
//  - Eindeutigkeit: Hersteller + System + Original-Nummer + Dokument
//  - bereits vorhandene Artikel (Schlüssel in `vorhanden`) werden nicht doppelt importiert
// ============================================================

import { schlageKategorieVor } from './kategorien'
import {
  einheitAusSpaltenname, inKilogramm, inMeter, inMillimeter, parseDezimal, runde, zerlegeArtikelnummer,
} from './normalisieren'
import type {
  ArtikelKandidat, Gewichtsart, ImportBericht, ImportKontext, RohZeile, ZeilenBericht,
} from './typen'

const MAX_PLAUSIBEL_KG = 1000 // schwerer als eine Tonne pro Stück → manuell prüfen
const MAX_PLAUSIBEL_M = 20

export function eindeutigkeitsSchluessel(k: { herstellerSchluessel: string; systemSchluessel: string | null; artikelnummer_original: string; dokumentSha256: string | null }): string {
  return [k.herstellerSchluessel, k.systemSchluessel ?? '', k.artikelnummer_original, k.dokumentSha256 ?? ''].join('|')
}

type Feld = 'laenge' | 'breite' | 'hoehe' | 'durchmesser' | 'gewicht' | 'einheit'

/** Ordnet einen Spaltennamen einem Feld zu (nur eindeutige Namen). */
export function feldAusSpalte(name: string): { feld: Feld; ca: boolean } | null {
  const n = name.toLowerCase().trim()
  if (/^ca\.?\s*kg$/.test(n)) return { feld: 'gewicht', ca: true }
  if (/^gewicht(\s*[(\[].*[)\]])?$/.test(n) || /^gew\.?(\s*[(\[].*[)\]])?$/.test(n)) return { feld: 'gewicht', ca: false }
  if (/^l(ä|ae)nge(\s*[(\[].*[)\]])?$/.test(n)) return { feld: 'laenge', ca: false }
  if (/^breite(\s*[(\[].*[)\]])?$/.test(n)) return { feld: 'breite', ca: false }
  if (/^h(ö|oe)he(\s*[(\[].*[)\]])?$/.test(n)) return { feld: 'hoehe', ca: false }
  if (/^(durchmesser|ø|dm)(\s*[(\[].*[)\]])?$/.test(n)) return { feld: 'durchmesser', ca: false }
  if (/^(vpe|einheit|me)(\s*[(\[].*[)\]])?$/.test(n) && /einheit|^me/.test(n)) return { feld: 'einheit', ca: false }
  return null
}

export function bereiteZeileVor(roh: RohZeile, ctx: ImportKontext): { artikel: ArtikelKandidat | null; meldungen: string[]; fehler: boolean; unsicher: boolean } {
  const meldungen: string[] = []
  let fehler = false
  let unsicher = false

  const nr = zerlegeArtikelnummer(roh.nummer)
  if (!nr.original) {
    return { artikel: null, meldungen: ['Pflichtfeld Artikelnummer fehlt.'], fehler: true, unsicher: false }
  }
  if (nr.kombiniert) {
    unsicher = true
    meldungen.push(`Mehrere Artikelnummern in einer Zeile ("${nr.original}") – nicht automatisch aufgeteilt, bitte prüfen.`)
  }
  if (!(roh.bezeichnung ?? '').trim() && !(roh.gruppe ?? '').trim() && !(roh.untertitel ?? '').trim()) {
    meldungen.push('Keine Bezeichnung/Gruppe vorhanden.')
  }

  let laenge: number | null = null, breite: number | null = null, hoehe: number | null = null, durchmesser: number | null = null
  const gewichte: { kg: number; ca: boolean; spalte: string }[] = []
  const mengeneinheit = 'Stk'

  for (const [spalte, wert] of Object.entries(roh.attribute)) {
    const f = feldAusSpalte(spalte)
    if (!f || wert === null || wert === '') continue
    if (f.feld === 'einheit') continue
    const z = parseDezimal(wert)
    if (z.unsicher) { unsicher = true; meldungen.push(`${spalte}: ${z.grund ?? 'Wert unklar'}`) }
    if (z.wert === null) continue
    const einheit = einheitAusSpaltenname(spalte) ?? (f.feld === 'gewicht' ? (f.ca ? 'kg' : 'kg') : f.feld === 'durchmesser' ? 'mm' : 'm')
    if (f.feld === 'gewicht') {
      const kg = inKilogramm(z.wert, einheit)
      if (kg === null) { unsicher = true; meldungen.push(`${spalte}: unbekannte Gewichtseinheit "${einheit}"`); continue }
      if (kg <= 0) { fehler = true; meldungen.push(`${spalte}: Gewicht muss größer als 0 sein (${z.wert}).`); continue }
      if (kg > MAX_PLAUSIBEL_KG) { unsicher = true; meldungen.push(`${spalte}: ${kg} kg pro Stück ist ungewöhnlich hoch, bitte prüfen.`) }
      gewichte.push({ kg: runde(kg, 3), ca: f.ca, spalte })
    } else if (f.feld === 'durchmesser') {
      const mm = inMillimeter(z.wert, einheit)
      if (mm === null || mm <= 0) { unsicher = true; meldungen.push(`${spalte}: Durchmesser/Einheit unklar`); continue }
      durchmesser = runde(mm, 2)
    } else {
      const m = inMeter(z.wert, einheit)
      if (m === null) { unsicher = true; meldungen.push(`${spalte}: unbekannte Längeneinheit "${einheit}"`); continue }
      if (m <= 0) { unsicher = true; meldungen.push(`${spalte}: Maß ${z.wert} ist nicht größer als 0 – Maß nicht übernommen (Rohwert bleibt erhalten).`); continue }
      if (m > MAX_PLAUSIBEL_M) { unsicher = true; meldungen.push(`${spalte}: ${m} m ist ungewöhnlich groß, Einheit prüfen.`) }
      const r = runde(m, 3)
      if (f.feld === 'laenge') laenge = r
      else if (f.feld === 'breite') breite = r
      else hoehe = r
    }
  }

  // Gewicht: mehrere Angaben mit abweichendem Wert → nicht entscheiden, manuell prüfen
  let gewicht: number | null = null
  let art: Gewichtsart = 'herstellerangabe_unklar'
  if (gewichte.length > 0) {
    const werte = new Set(gewichte.map((g) => g.kg))
    if (werte.size > 1) {
      unsicher = true
      meldungen.push(`Widersprüchliche Gewichte in einer Zeile (${gewichte.map((g) => `${g.spalte}: ${g.kg}`).join('; ')}) – kein Wert übernommen.`)
    } else {
      gewicht = gewichte[0].kg
      art = gewichte.every((g) => g.ca) ? 'ca' : 'herstellerangabe_unklar'
    }
  } else {
    meldungen.push('Kein Gewicht in der Quelle.')
  }

  const kat = schlageKategorieVor(roh.gruppe, roh.bezeichnung ?? roh.untertitel)

  const artikel: ArtikelKandidat = {
    herstellerSchluessel: ctx.herstellerSchluessel,
    systemSchluessel: ctx.systemSchluessel,
    dokumentSha256: ctx.dokumentSha256,
    artikelnummer_original: nr.original,
    artikelnummer_basis: nr.basis,
    artikelnummer_suffix: nr.suffix,
    artikelnummer_normalisiert: nr.normalisiert,
    bezeichnung: (roh.bezeichnung ?? roh.untertitel ?? '').trim() || null,
    gruppe_original: (roh.gruppe ?? '').trim() || null,
    kategorieSchluessel: kat.schluessel,
    kategorie_sicherheit: kat.sicherheit,
    systemart: ctx.systemart,
    laenge_m: laenge, breite_m: breite, hoehe_m: hoehe, durchmesser_mm: durchmesser,
    gewicht_referenz_kg: gewicht,
    gewichtsart: art,
    mengeneinheit,
    listenpreis_netto: roh.preis ?? null,
    attribute_roh: { ...roh.attribute },
    quelle_seiten: roh.seiten ?? null,
    quelle_seite_status: roh.seitenStatus ?? 'unbekannt',
    pruefstatus: 'ungeprueft',
    freigabestatus: 'nicht_freigegeben',
  }
  return { artikel, meldungen, fehler, unsicher }
}

/**
 * Trockenlauf: bewertet alle Zeilen, ändert nichts.
 * @param vorhanden Eindeutigkeitsschlüssel bereits gespeicherter Artikel (Schutz vor doppeltem Import)
 */
export function bereiteImportVor(zeilen: RohZeile[], ctx: ImportKontext, vorhanden: ReadonlySet<string> = new Set()): ImportBericht {
  const gesehen = new Map<string, number>() // Schlüssel → Index im Bericht
  const berichte: ZeilenBericht[] = []
  for (const roh of zeilen) {
    const r = bereiteZeileVor(roh, ctx)
    if (!r.artikel) {
      berichte.push({ zeile: roh.zeile, nummer: roh.nummer, ergebnis: 'fehler', meldungen: r.meldungen, schluessel: null, artikel: null })
      continue
    }
    const schluessel = eindeutigkeitsSchluessel(r.artikel)
    let ergebnis: ZeilenBericht['ergebnis']
    const meldungen = [...r.meldungen]
    if (r.fehler) ergebnis = 'fehler'
    else if (vorhanden.has(schluessel)) { ergebnis = 'dublette'; meldungen.push('Artikel ist bereits in der Datenbank – nicht erneut importiert.') }
    else if (gesehen.has(schluessel)) {
      ergebnis = 'dublette'
      const erste = berichte[gesehen.get(schluessel)!]
      const unterschiede = abweichungen(erste.artikel!, r.artikel)
      if (unterschiede.length > 0) {
        // Die zweite Zeile wird nicht als Artikel angelegt (Eindeutigkeit), ihre Rohdaten bleiben im Protokoll (import_zeilen.roh).
        // Die erste Zeile wird zur manuellen Prüfung markiert, damit der Konflikt nicht untergeht.
        meldungen.push(`Dieselbe Artikelnummer steht im Dokument mehrfach mit ABWEICHENDEN Werten (${unterschiede.join('; ')}) – Zeile ${erste.zeile} bleibt, diese Zeile nur im Protokoll. Bitte klären.`)
        if (erste.ergebnis === 'neu') erste.ergebnis = 'unsicher'
        erste.meldungen.push(`Zeile ${roh.zeile} hat dieselbe Artikelnummer mit abweichenden Werten (${unterschiede.join('; ')}) – bitte klären.`)
      } else meldungen.push('Artikelnummer kommt im selben Dokument mehrfach mit gleichen Werten vor – nur die erste Zeile wird importiert.')
    }
    else ergebnis = r.unsicher ? 'unsicher' : 'neu'
    if (ergebnis !== 'dublette' && ergebnis !== 'fehler') gesehen.set(schluessel, berichte.length)
    berichte.push({ zeile: roh.zeile, nummer: roh.nummer, ergebnis, meldungen, schluessel, artikel: r.artikel })
  }
  const zaehle = (e: ZeilenBericht['ergebnis']) => berichte.filter((b) => b.ergebnis === e).length
  return { zeilen: berichte, gesamt: berichte.length, neu: zaehle('neu'), dubletten: zaehle('dublette'), fehler: zaehle('fehler'), unsicher: zaehle('unsicher') }
}

function abweichungen(a: ArtikelKandidat, b: ArtikelKandidat): string[] {
  const out: string[] = []
  const cmp = (name: string, x: unknown, y: unknown) => { if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${name}: ${x ?? '–'} ↔ ${y ?? '–'}`) }
  cmp('Gewicht', a.gewicht_referenz_kg, b.gewicht_referenz_kg)
  cmp('Länge', a.laenge_m, b.laenge_m)
  cmp('Breite', a.breite_m, b.breite_m)
  cmp('Preis', a.listenpreis_netto, b.listenpreis_netto)
  return out
}

/** Fehlerbericht als CSV (Semikolon, UTF-8) für Download. */
export function berichtAlsCsv(b: ImportBericht): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  const kopf = ['Zeile', 'Artikelnummer', 'Ergebnis', 'Meldungen'].join(';')
  const zeilen = b.zeilen.filter((z) => z.ergebnis !== 'neu' || z.meldungen.length > 0)
    .map((z) => [z.zeile, q(z.nummer), z.ergebnis, q(z.meldungen.join(' | '))].join(';'))
  return [kopf, ...zeilen].join('\n')
}
