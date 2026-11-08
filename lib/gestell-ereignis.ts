// ============================================================
// SCAFFOLD OS – Gestell-Waage: Wann darf aus einer Gewichtsänderung eine Materialbewegung werden?
//
// Regel: Eine Gewichtsänderung wird NIE blind gebucht. Sie wird zusammen bewertet mit
//   1. stabilen Messwerten vor und nach der Änderung,
//   2. Fahrzeugerkennung (richtiger LKW in der Nähe),
//   3. Standort (Lager bzw. die Baustelle des Transportauftrags),
//   4. aktivem Transportauftrag (Richtung, Ziel, erwartete Menge),
//   5. Materialzuordnung des Gestells (Artikel mit bekanntem Stückgewicht).
// Ergebnis ist nur eine Einstufung mit Begründung:
//   sicher        alle Prüfungen bestanden → Buchungsvorschlag (Bestätigung durch eine Person bleibt Standard)
//   bestaetigung  mindestens eine Prüfung offen oder widersprüchlich → Person muss entscheiden
//   abwarten      Messung (noch) nicht stabil → nichts auswerten, später erneut messen
//   kein_ereignis Änderung liegt im Rauschen der Waage
// ============================================================

import { stueckAusGewicht } from './gestell-waage'

export interface Messwert { t: number; kg: number }

export interface StabilOptionen {
  /** Länge des Fensters in ms, gerechnet vom letzten Messwert zurück (Standard 3000) */
  fensterMs?: number
  /** Mindestzahl Messwerte im Fenster (Standard 5) */
  minWerte?: number
  /** höchste erlaubte Spanne (max − min) im Fenster in kg */
  maxSpanneKg: number
}

export interface StabilErgebnis { stabil: boolean; kg: number | null; grund: string }

/** Ein Messwert zählt erst, wenn die Waage im Fenster ruhig war (Mittelwert aus dem Fenster). */
export function stabilerWert(reihe: Messwert[], opt: StabilOptionen): StabilErgebnis {
  const fenster = opt.fensterMs ?? 3000
  const minWerte = opt.minWerte ?? 5
  const gueltig = reihe.filter((m) => Number.isFinite(m.t) && Number.isFinite(m.kg)).sort((a, b) => a.t - b.t)
  if (gueltig.length === 0) return { stabil: false, kg: null, grund: 'Keine Messwerte.' }
  const ende = gueltig[gueltig.length - 1].t
  const im = gueltig.filter((m) => m.t >= ende - fenster)
  if (im.length < minWerte) return { stabil: false, kg: null, grund: `Nur ${im.length} Messwerte im Zeitfenster, nötig sind ${minWerte}.` }
  if (ende - im[0].t < fenster * 0.6) return { stabil: false, kg: null, grund: 'Die Messung läuft noch nicht lange genug.' }
  const kgs = im.map((m) => m.kg)
  const spanne = Math.max(...kgs) - Math.min(...kgs)
  if (spanne > opt.maxSpanneKg) return { stabil: false, kg: null, grund: `Die Waage schwankt (${Math.round(spanne * 10) / 10} kg Spanne). Gestell bewegt sich oder wird gerade beladen.` }
  return { stabil: true, kg: Math.round((kgs.reduce((s, v) => s + v, 0) / kgs.length) * 100) / 100, grund: '' }
}

export type Einstufung = 'sicher' | 'bestaetigung' | 'abwarten' | 'kein_ereignis'

export interface Pruefung { name: string; ok: boolean; text: string }

export interface EreignisEingabe {
  vorher: Messwert[]
  nachher: Messwert[]
  maxSpanneKg: number
  toleranzKg: number
  gestell: { leerKg: number; artikelId: string | null; stueckKg: number }
  fahrzeug: { erkanntId: string | null; erwartetId: string | null }
  standort: { ortId: string | null; erlaubteOrtIds: string[] }
  auftrag: {
    aktiv: boolean
    /** 'entnahme' = Material verlässt das Gestell, 'zugabe' = Material kommt dazu */
    richtung: 'entnahme' | 'zugabe' | null
    erlaubteArtikelIds: string[]
    sollStueck: number | null
  }
  /** zuletzt gebuchtes Ereignis dieses Gestells (gegen Doppelbuchung) */
  letzteBuchung?: { t: number; stueckDelta: number } | null
  /** innerhalb dieser Zeit gilt gleiche Menge als mögliche Doppelerkennung (Standard 10 Minuten) */
  doppelFensterMs?: number
}

export interface EreignisErgebnis {
  einstufung: Einstufung
  richtung: 'entnahme' | 'zugabe' | null
  stueck: number
  pruefungen: Pruefung[]
  /** offene Punkte in Klartext für die Bestätigungsmaske */
  offen: string[]
}

export function bewerteEreignis(e: EreignisEingabe): EreignisErgebnis {
  const leer: EreignisErgebnis = { einstufung: 'abwarten', richtung: null, stueck: 0, pruefungen: [], offen: [] }
  const p: Pruefung[] = []

  const v = stabilerWert(e.vorher, { maxSpanneKg: e.maxSpanneKg })
  const n = stabilerWert(e.nachher, { maxSpanneKg: e.maxSpanneKg })
  p.push({ name: 'Stabile Messung vorher', ok: v.stabil, text: v.stabil ? 'Ruhig.' : v.grund })
  p.push({ name: 'Stabile Messung nachher', ok: n.stabil, text: n.stabil ? 'Ruhig.' : n.grund })
  if (!v.stabil || !n.stabil || v.kg === null || n.kg === null) {
    return { ...leer, pruefungen: p, offen: p.filter((x) => !x.ok).map((x) => x.text) }
  }

  const delta = Math.round((n.kg - v.kg) * 100) / 100
  if (Math.abs(delta) <= Math.max(0, e.toleranzKg)) {
    return { einstufung: 'kein_ereignis', richtung: null, stueck: 0, pruefungen: p, offen: [] }
  }
  const richtung = delta < 0 ? 'entnahme' : 'zugabe'

  // Materialzuordnung und Stückzahl
  const hatArtikel = !!e.gestell.artikelId && e.gestell.stueckKg > 0
  p.push({ name: 'Materialzuordnung', ok: hatArtikel, text: hatArtikel ? 'Gestell hat einen Artikel mit bekanntem Gewicht.' : 'Dem Gestell ist kein Artikel mit Stückgewicht zugeordnet.' })
  let stueck = 0
  if (hatArtikel) {
    const a = stueckAusGewicht(v.kg, e.gestell.leerKg, e.gestell.stueckKg, e.toleranzKg)
    const b = stueckAusGewicht(n.kg, e.gestell.leerKg, e.gestell.stueckKg, e.toleranzKg)
    stueck = Math.abs(a.stueck - b.stueck)
    const eindeutig = a.sicherheit === 'sicher' && b.sicherheit === 'sicher'
    p.push({ name: 'Stückzahl eindeutig', ok: eindeutig, text: eindeutig ? `${stueck} Stück ${richtung === 'entnahme' ? 'entnommen' : 'dazugekommen'}.` : (a.sicherheit !== 'sicher' ? a.hinweis : b.hinweis) })
    const erlaubt = !e.auftrag.erlaubteArtikelIds.length || e.auftrag.erlaubteArtikelIds.includes(e.gestell.artikelId as string)
    p.push({ name: 'Artikel passt zum Auftrag', ok: erlaubt, text: erlaubt ? 'Artikel gehört zur Materialliste.' : 'Der Artikel steht nicht auf der Materialliste des Auftrags.' })
  }

  // Fahrzeug
  const fahrzeugOk = !!e.fahrzeug.erkanntId && (!e.fahrzeug.erwartetId || e.fahrzeug.erkanntId === e.fahrzeug.erwartetId)
  p.push({ name: 'Fahrzeug erkannt', ok: fahrzeugOk, text: !e.fahrzeug.erkanntId ? 'Kein Fahrzeug in der Nähe erkannt.' : fahrzeugOk ? 'Richtiger LKW erkannt.' : 'Ein anderer LKW als im Auftrag ist in der Nähe.' })

  // Standort
  const ortOk = !!e.standort.ortId && e.standort.erlaubteOrtIds.includes(e.standort.ortId)
  p.push({ name: 'Standort', ok: ortOk, text: !e.standort.ortId ? 'Standort unbekannt.' : ortOk ? 'Gestell steht am erwarteten Ort.' : 'Das Gestell steht nicht an einem Ort, der zum Auftrag gehört.' })

  // Auftrag
  p.push({ name: 'Transportauftrag aktiv', ok: e.auftrag.aktiv, text: e.auftrag.aktiv ? 'Aktiver Auftrag vorhanden.' : 'Es gibt keinen aktiven Transportauftrag.' })
  if (e.auftrag.aktiv && e.auftrag.richtung) {
    const ok = e.auftrag.richtung === richtung
    p.push({ name: 'Richtung passt', ok, text: ok ? 'Richtung entspricht dem Auftrag.' : `Der Auftrag erwartet ${e.auftrag.richtung === 'entnahme' ? 'eine Entnahme' : 'eine Zugabe'}, gemessen wurde ${richtung === 'entnahme' ? 'eine Entnahme' : 'eine Zugabe'}.` })
  }
  if (e.auftrag.aktiv && e.auftrag.sollStueck !== null && hatArtikel) {
    const ok = stueck === e.auftrag.sollStueck
    p.push({ name: 'Menge wie geplant', ok, text: ok ? 'Menge entspricht dem Plan.' : `Geplant sind ${e.auftrag.sollStueck} Stück, gemessen ${stueck}.` })
  }

  // Doppelte Erkennung
  const fenster = e.doppelFensterMs ?? 10 * 60 * 1000
  const l = e.letzteBuchung
  const doppel = !!l && Math.abs(n.kg - v.kg) > 0 && (e.nachher[e.nachher.length - 1]?.t ?? 0) - l.t < fenster && l.stueckDelta === (richtung === 'entnahme' ? -stueck : stueck)
  p.push({ name: 'Keine Doppelbuchung', ok: !doppel, text: doppel ? 'Dieselbe Menge wurde vor kurzem schon für dieses Gestell gebucht.' : 'Keine gleiche Buchung kurz zuvor.' })

  const offen = p.filter((x) => !x.ok).map((x) => x.text)
  return { einstufung: offen.length === 0 ? 'sicher' : 'bestaetigung', richtung, stueck, pruefungen: p, offen }
}
