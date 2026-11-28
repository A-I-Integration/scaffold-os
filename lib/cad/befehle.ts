// ============================================================
// SCAFFOLD OS – CAD-Befehle per Text oder Sprache (Befehlsschicht)
//
// Die KI übersetzt einen Satz NUR in einen Befehl aus dieser festen Liste. Sie erzeugt keine Geometrie und keine Koordinaten.
// Alles Weitere passiert hier, lokal und prüfbar: Befehl prüfen → gegen das aktuelle Modell planen → Vorschau-Text → erst nach
// Bestätigung ausführen (mit den vorhandenen CAD-Funktionen, also mit Sperren und Rückgängig wie bei der Handarbeit).
// Unklares oder Unzulässiges wird mit einem klaren Satz abgelehnt, nichts wird erraten.
//
// Befehle: verschieben (Auswahl), feld_entfernen, treppe_setzen, hoehe_aendern.
// ============================================================

import type { BuildingParams, CADModel, ScaffoldField } from '@/lib/calculations/cad-engine'
import { treppenReihen, lagenVon } from '@/lib/cad/treppe-setzen'
import { setzeRechteck, type Ergebnis } from '@/lib/cad/gebaeude-bearbeiten'

export type Seite = 'front' | 'back' | 'left' | 'right'
export type Richtung = 'hoch' | 'runter' | Seite

export type CadBefehl =
  | { befehl: 'verschieben'; richtung: Richtung; betragM: number }
  | { befehl: 'feld_entfernen'; seite: Seite; nummer: number; lage: number | null }
  | { befehl: 'treppe_setzen'; seite: Seite; nummer: number }
  | { befehl: 'hoehe_aendern'; hoeheM: number }

export type BefehlPruefung = { ok: true; befehl: CadBefehl } | { ok: false; grund: string }

const SEITEN: Record<string, Seite> = {
  vorne: 'front', vorn: 'front', vorderseite: 'front', front: 'front',
  hinten: 'back', rueckseite: 'back', 'rückseite': 'back', back: 'back',
  links: 'left', left: 'left', rechts: 'right', right: 'right',
}
export const SEITEN_NAME: Record<Seite, string> = { front: 'Vorderseite', back: 'Rückseite', left: 'linke Seite', right: 'rechte Seite' }

const seiteVon = (v: unknown): Seite | null => (typeof v === 'string' ? SEITEN[v.trim().toLowerCase()] ?? null : null)
const zahlVon = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(',', '.')) : NaN
  return Number.isFinite(n) ? n : null
}
const ganz = (v: unknown, min: number, max: number): number | null => { const n = zahlVon(v); return n !== null && Number.isInteger(n) && n >= min && n <= max ? n : null }

/** Rohantwort der KI prüfen. Nur Befehle aus der Liste mit gültigen Werten; alles andere wird abgelehnt (mit Grund oder Rückfrage der KI). */
export function pruefeBefehl(roh: unknown): BefehlPruefung {
  const r = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>
  const name = typeof r.befehl === 'string' ? r.befehl.trim().toLowerCase() : ''
  switch (name) {
    case 'verschieben': {
      const rd = typeof r.richtung === 'string' ? r.richtung.trim().toLowerCase() : ''
      const richtung: Richtung | null = rd === 'hoch' || rd === 'oben' ? 'hoch' : rd === 'runter' || rd === 'unten' ? 'runter' : seiteVon(rd)
      const b = zahlVon(r.betrag_m)
      if (!richtung) return { ok: false, grund: 'Die Richtung ist unklar. Erlaubt: hoch, runter, vorne, hinten, links, rechts.' }
      if (b === null || !(b >= 0.01 && b <= 20)) return { ok: false, grund: 'Der Betrag fehlt oder ist unplausibel (erlaubt: 0,01 bis 20 m).' }
      return { ok: true, befehl: { befehl: 'verschieben', richtung, betragM: Math.round(b * 1000) / 1000 } }
    }
    case 'feld_entfernen': {
      const seite = seiteVon(r.seite); const nummer = ganz(r.nummer, 1, 200)
      if (!seite) return { ok: false, grund: 'Die Seite ist unklar. Erlaubt: vorne, hinten, links, rechts.' }
      if (nummer === null) return { ok: false, grund: 'Die Feldnummer fehlt (zum Beispiel „Feld 3“).' }
      const lage = r.lage === null || r.lage === undefined ? null : ganz(r.lage, 1, 100)
      if (r.lage !== null && r.lage !== undefined && lage === null) return { ok: false, grund: 'Die Lage ist unklar (zum Beispiel „Lage 2“).' }
      return { ok: true, befehl: { befehl: 'feld_entfernen', seite, nummer, lage } }
    }
    case 'treppe_setzen': {
      const seite = seiteVon(r.seite); const nummer = ganz(r.nummer, 1, 200)
      if (!seite) return { ok: false, grund: 'Die Seite ist unklar. Erlaubt: vorne, hinten, links, rechts.' }
      if (nummer === null) return { ok: false, grund: 'Die Feldnummer fehlt (zum Beispiel „auf Feld 2“).' }
      return { ok: true, befehl: { befehl: 'treppe_setzen', seite, nummer } }
    }
    case 'hoehe_aendern': {
      const h = zahlVon(r.hoehe_m)
      if (h === null || !(h >= 1 && h <= 60)) return { ok: false, grund: 'Die Höhe fehlt oder liegt nicht zwischen 1 und 60 m.' }
      return { ok: true, befehl: { befehl: 'hoehe_aendern', hoeheM: Math.round(h * 100) / 100 } }
    }
    case 'unklar':
      return { ok: false, grund: typeof r.frage === 'string' && r.frage.trim() ? r.frage.trim().slice(0, 300) : 'Das habe ich nicht als Befehl verstanden.' }
    default:
      return { ok: false, grund: 'Das habe ich nicht als Befehl verstanden. Mögliche Befehle: Auswahl verschieben, Feld entfernen, Treppe setzen, Höhe ändern.' }
  }
}

// ---------- Planen gegen das Modell ----------

export type CadAktion =
  | { art: 'verschieben'; ids: string[]; versatz: [number, number, number] }
  | { art: 'feld_entfernen'; ids: string[] }
  | { art: 'treppe_setzen'; feldId: string }
  | { art: 'hoehe_aendern'; gebaeude: BuildingParams }

export type Plan = { ok: true; aktion: CadAktion; vorschau: string } | { ok: false; grund: string }

type Modell = Pick<CADModel, 'fields'> & { components3D: { id: string; fieldId?: string }[] }

const r4 = (v: number) => Math.round(v * 10000) / 10000
const euro = (m: number) => m.toLocaleString('de-DE', { maximumFractionDigits: 3 })

/** Richtung zu einer Gerüstseite: vom Mittelpunkt aller Felder zum Mittelpunkt der Felder dieser Seite, waagrecht, Länge 1. */
export function richtungZurSeite(model: Pick<CADModel, 'fields'>, seite: Seite): [number, number, number] | null {
  const alle = model.fields
  const seiteF = alle.filter((f) => f.side === seite)
  if (!alle.length || !seiteF.length) return null
  const mittel = (fs: ScaffoldField[]) => [fs.reduce((s, f) => s + f.positionX, 0) / fs.length, fs.reduce((s, f) => s + f.positionZ, 0) / fs.length] as const
  const [cx, cz] = mittel(alle); const [sx, sz] = mittel(seiteF)
  const dx = sx - cx, dz = sz - cz
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return null
  return [r4(dx / len), 0, r4(dz / len)]
}

/** Das n-te Feld (Zählrichtung, ab 1) der Reihe einer Seite. Bei mehreren Reihen je Seite (Gebäude mit Umriss) wird nicht geraten. */
export function findeFeld(model: Pick<CADModel, 'fields'>, seite: Seite, nummer: number): { ok: true; feld: ScaffoldField; reihe: ScaffoldField[] } | { ok: false; grund: string } {
  const reihen = treppenReihen(model).filter((r) => r.felder[0]?.side === seite)
  if (reihen.length === 0) return { ok: false, grund: `An der ${SEITEN_NAME[seite]} gibt es kein Gerüst.` }
  if (reihen.length > 1) return { ok: false, grund: `An der ${SEITEN_NAME[seite]} gibt es mehrere Kanten. Bitte das Feld im 3D anklicken.` }
  const reihe = reihen[0].felder
  const feld = reihe[nummer - 1]
  if (!feld) return { ok: false, grund: `An der ${SEITEN_NAME[seite]} gibt es nur ${reihe.length} Feld${reihe.length === 1 ? '' : 'er'}, nicht ${nummer}.` }
  return { ok: true, feld, reihe }
}

const TREPPEN_TEIL = /^(stair-|manual-)/

export interface PlanKontext { auswahlIds: readonly string[]; gebaeude: BuildingParams }

/** Befehl gegen das aktuelle Modell planen: Aktion plus Vorschau-Text, oder ein klarer Grund, warum es nicht geht. */
export function planeBefehl(b: CadBefehl, model: Modell | null, ctx: PlanKontext): Plan {
  if (!model || model.fields.length === 0) return { ok: false, grund: 'Es gibt noch kein Gerüstmodell. Bitte zuerst das Gerüst berechnen lassen.' }
  switch (b.befehl) {
    case 'verschieben': {
      if (ctx.auswahlIds.length === 0) return { ok: false, grund: 'Es ist nichts ausgewählt. Wähle ein Bauteil im 3D oder mehrere mit dem Auswahlrahmen.' }
      let v: [number, number, number]
      if (b.richtung === 'hoch') v = [0, b.betragM, 0]
      else if (b.richtung === 'runter') v = [0, -b.betragM, 0]
      else {
        const d = richtungZurSeite(model, b.richtung)
        if (!d) return { ok: false, grund: `Die Richtung „${SEITEN_NAME[b.richtung]}“ lässt sich an diesem Modell nicht bestimmen.` }
        v = [r4(d[0] * b.betragM), 0, r4(d[2] * b.betragM)]
      }
      const wohin = b.richtung === 'hoch' ? 'nach oben' : b.richtung === 'runter' ? 'nach unten' : `Richtung ${SEITEN_NAME[b.richtung]}`
      const n = ctx.auswahlIds.length
      return { ok: true, aktion: { art: 'verschieben', ids: [...ctx.auswahlIds], versatz: v }, vorschau: `${n} ausgewählte${n === 1 ? 's Bauteil' : ' Bauteile'} um ${euro(b.betragM)} m ${wohin} verschieben.` }
    }
    case 'feld_entfernen': {
      const f = findeFeld(model, b.seite, b.nummer)
      if (!f.ok) return f
      let felder = model.fields.filter((x) => x.side === f.feld.side && x.kante === f.feld.kante && x.index === f.feld.index)
      if (b.lage !== null) {
        const lagen = lagenVon(model)
        const li = lagen[b.lage - 1]
        if (li === undefined) return { ok: false, grund: `Es gibt nur ${lagen.length} Lage${lagen.length === 1 ? '' : 'n'}, nicht ${b.lage}.` }
        felder = felder.filter((x) => x.levelIndex === li)
      }
      const feldIds = new Set(felder.map((x) => x.id))
      const ids = model.components3D.filter((c) => c.fieldId && feldIds.has(c.fieldId) && !TREPPEN_TEIL.test(c.id)).map((c) => c.id)
      if (ids.length === 0) return { ok: false, grund: 'In diesem Feld gibt es keine Bauteile zum Entfernen.' }
      const lagenText = b.lage === null ? 'in allen Lagen' : `in Lage ${b.lage}`
      return { ok: true, aktion: { art: 'feld_entfernen', ids }, vorschau: `Feld ${b.nummer} der ${SEITEN_NAME[b.seite]} ${lagenText} entfernen (${ids.length} Bauteile). „Entferntes zurück“ holt sie wieder.` }
    }
    case 'treppe_setzen': {
      const f = findeFeld(model, b.seite, b.nummer)
      if (!f.ok) return f
      return { ok: true, aktion: { art: 'treppe_setzen', feldId: f.feld.id }, vorschau: `Treppe auf Feld ${b.nummer} der ${SEITEN_NAME[b.seite]} setzen (vom Boden bis oben).` }
    }
    case 'hoehe_aendern': {
      const e: Ergebnis<BuildingParams> = setzeRechteck(ctx.gebaeude, ctx.gebaeude.lengthM, ctx.gebaeude.widthM, b.hoeheM)
      if (!e.ok) return { ok: false, grund: e.fehler }
      const alt = ctx.gebaeude.heightM
      return { ok: true, aktion: { art: 'hoehe_aendern', gebaeude: e.wert }, vorschau: `Gebäudehöhe von ${euro(alt)} m auf ${euro(b.hoeheM)} m ändern. Das Gerüst wird neu berechnet, von Hand gesetzte Teile bleiben.` }
    }
  }
}
