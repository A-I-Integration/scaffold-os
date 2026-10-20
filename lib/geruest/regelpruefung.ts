// ============================================================
// SCAFFOLD OS – Regelprüfung (Report-Modus) nach DIN EN 12811-1
//
// Reine Funktionen, keine Oberfläche. Prüft das fertige CAD-Modell und
// liefert ein Prüfprotokoll. Das ist eine ordnende Plausibilitätsprüfung,
// KEIN Standsicherheitsnachweis und KEINE Abnahme.
//
// Zwei Arten von Ergebnissen:
//   art 'geprueft' = SCAFFOLD OS kann es eindeutig aus dem Modell prüfen
//                    (z. B. fehlende Anker, fehlende Geländer, Grenzen der
//                    Regelausführung aus den hinterlegten Zulassungen).
//   art 'hinweis'  = nicht eindeutig regelbar oder kein belegter Grenzwert
//                    hinterlegt. Der gemessene Wert steht im Text, der
//                    Mensch prüft ihn gegen die Zulassung. Nie eine Sperre.
//
// BEWUSST NICHT ENTHALTEN: Richtwert-Tabellen für Höhen-/Breiten-Verhältnis,
// Diagonal-Raster oder Ankerabstände. Diese Werte stehen je System in der
// Zulassung bzw. Aufbau- und Verwendungsanleitung; sie sind hier nicht
// hinterlegt und werden nicht erfunden. Kommt ein geprüfter Grenzwert hinzu
// (mit Quelle), wird er als eigene Regel ergänzt.
//
// Richtwert-Regeln (lib/geruest/richtwert-regeln.ts): Grenzen, die als Zahl oder Datum im Katalog stehen
// (Zulassungs-Eckdaten der gewählten Serie). Status 'verletzt' = Richtwert aus dem Katalog überschritten:
// rot, aber KEINE Sperre. Fehlt der Wert im Katalog, gibt es kein Ergebnis (Regel schweigt).
//
// Die Ampel zählt nur Ergebnisse mit art 'geprueft'.
// ============================================================

import { berechneGebaeudeSegmente, type CADModel } from '@/lib/calculations/cad-engine'
import { checkRules } from '@/lib/calculations/cad-rules'
import { fehlendeStatikAngaben, type StatikDaten } from '@/lib/statik-daten'
import { TYPENSTATIK_HOEHE_HINWEIS_M } from '@/lib/statik-pruefpunkte'
import { richtwertErgebnisse, type RichtwertOptionen } from '@/lib/geruest/richtwert-regeln'

/** 'verletzt' = Richtwert aus den Zulassungs-Eckdaten des Katalogs überschritten (rot, keine Sperre) */
export type PruefStatus = 'ok' | 'warnung' | 'fehler' | 'verletzt'

export interface Pruefergebnis {
  id: string
  regel: string
  status: PruefStatus
  art: 'geprueft' | 'hinweis'
  /** z. B. "Abschnitt 1 (9,5 m × 45 m)"; leer = gilt für das ganze Gerüst */
  abschnitt?: string
  begruendung: string
  /** Woher die Regel stammt bzw. welche Annahme dahinter steht */
  quelle: string
}

export interface Pruefprotokoll {
  ergebnisse: Pruefergebnis[]
  /** schlechtester Status aller Ergebnisse mit art 'geprueft' */
  ampel: PruefStatus
  anzahl: { ok: number; warnung: number; fehler: number; verletzt: number }
  hinweis: string
}

export const PRUEF_HINWEIS =
  'Plausibilitätsprüfung aus den Modelldaten. Kein Standsicherheitsnachweis und keine Abnahme. ' +
  'Die fachliche Verantwortung bleibt beim Gerüstbau-Fachbetrieb bzw. beim Statiker.'

/** Systeme, für die in cad-rules.ts Grenzen der Regelausführung mit Zulassungsnummer hinterlegt sind. */
export const SYSTEME_MIT_REGELAUSFUEHRUNG = ['layher-allround', 'peri-up-flex'] as const

const SCHLECHTER: Record<PruefStatus, number> = { ok: 0, warnung: 1, fehler: 2, verletzt: 3 }

/** Zählzeile für Ausgaben. Ohne verletzte Richtwerte exakt der bisherige Text. */
export function anzahlText(a: Pruefprotokoll['anzahl']): string {
  return `${a.ok} OK, ${a.warnung} Warnungen, ${a.fehler} Fehler` + (a.verletzt > 0 ? `, ${a.verletzt} Richtwert${a.verletzt === 1 ? '' : 'e'} verletzt` : '')
}

function m(n: number, stellen = 1): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: stellen })
}

/** Beschriftung der Abschnitte; ohne mehrteiliges Gebäude gibt es einen einzigen. */
export function abschnittsListe(model: CADModel): { name: string; laengeM: number; hoeheM: number; eingeruestet: boolean }[] {
  const s = model.building.sections
  if (s && s.length >= 2) {
    const seg = berechneGebaeudeSegmente(s)
    return seg.map((x, i) => ({
      name: `Abschnitt ${i + 1} (${m(x.laengeM)} m × ${m(x.hoeheM)} m)`,
      laengeM: x.laengeM, hoeheM: x.hoeheM, eingeruestet: s[i].geruest !== false,
    }))
  }
  return [{ name: `Gebäude (${m(model.building.lengthM)} m × ${m(model.building.heightM)} m)`, laengeM: model.building.lengthM, hoeheM: model.building.heightM, eingeruestet: true }]
}

export function pruefeGeruest(model: CADModel, statik: StatikDaten = {}, richtwert: RichtwertOptionen = {}): Pruefprotokoll {
  const e: Pruefergebnis[] = []
  const sysId = model.system?.id
  const abschnitte = abschnittsListe(model)

  // 1. Regelausführung der Zulassung (aus cad-rules.ts, dort mit Quelle)
  const regelErgebnisse = checkRules({
    building: model.building, system: model.system, fieldCount: model.fieldCount,
    levelCount: model.levelCount, totalHeightM: model.totalHeightM, totalLengthM: model.totalLengthM,
  })
  const regelAusf = regelErgebnisse.filter((r) => r.rule.id.startsWith('REGELAUSFUEHRUNG_GRENZE_'))
  const belag = regelErgebnisse.filter((r) => r.rule.id.startsWith('BELAG_LASTKLASSE_'))
  if (sysId && (SYSTEME_MIT_REGELAUSFUEHRUNG as readonly string[]).includes(sysId)) {
    const ausser = regelAusf.filter((r) => r.triggered)
    if (ausser.length > 0) {
      for (const r of ausser) e.push({ id: r.rule.id, regel: 'Regelausführung der Zulassung', status: 'fehler', art: 'geprueft', begruendung: r.rule.message, quelle: 'cad-rules.ts, Zulassung des Systems' })
    } else {
      e.push({ id: 'REGELAUSFUEHRUNG', regel: 'Regelausführung der Zulassung', status: 'ok', art: 'geprueft', begruendung: 'Höhe, Feldweite, Lastklasse und Systembreite liegen innerhalb der hinterlegten Grenzen der Regelausführung.', quelle: 'cad-rules.ts, Zulassung des Systems' })
    }
    for (const r of belag.filter((x) => x.triggered)) {
      e.push({ id: r.rule.id, regel: 'Belagstyp und Lastklasse', status: 'warnung', art: 'geprueft', begruendung: r.rule.message, quelle: 'cad-rules.ts, Zulassung des Systems' })
    }
  } else {
    e.push({ id: 'REGELAUSFUEHRUNG_UNBEKANNT', regel: 'Regelausführung der Zulassung', status: 'warnung', art: 'hinweis', begruendung: model.system ? `Für ${model.system.hersteller} ${model.system.systemName} sind in SCAFFOLD OS keine Grenzen der Regelausführung hinterlegt. Bitte Höhe, Feldweite, Lastklasse und Breite in der Zulassung prüfen.` : 'Kein Gerüstsystem gewählt: die Grenzen der Regelausführung können nicht geprüft werden.', quelle: 'cad-rules.ts (nur Layher Allround und PERI UP Flex hinterlegt)' })
  }

  // 2. Lastklasse angegeben
  if (model.building.lastklasse === undefined) {
    e.push({ id: 'LASTKLASSE', regel: 'Lastklasse angegeben', status: 'warnung', art: 'geprueft', begruendung: 'Keine Lastklasse nach DIN EN 12811-1 angegeben. Die Regelausführungs-Prüfung nimmt Lastklasse 3 an.', quelle: 'DIN EN 12811-1; Annahme Lastklasse 3 wie in cad-rules.ts' })
  } else {
    e.push({ id: 'LASTKLASSE', regel: 'Lastklasse angegeben', status: 'ok', art: 'geprueft', begruendung: `Lastklasse ${model.building.lastklasse} angegeben.`, quelle: 'DIN EN 12811-1' })
  }

  // 3. Anker vorhanden
  const anker = model.anchors
  if (model.totalHeightM > 0 && anker.length === 0) {
    e.push({ id: 'ANKER_VORHANDEN', regel: 'Verankerung vorhanden', status: 'warnung', art: 'geprueft', begruendung: 'Das Modell enthält keine Anker. Ein Fassadengerüst wird an der Fassade verankert; bitte Verankerung ergänzen oder bewusst begründen.', quelle: 'allgemeine Gerüstbau-Praxis; kein Zahlenwert hinterlegt' })
  } else {
    e.push({ id: 'ANKER_VORHANDEN', regel: 'Verankerung vorhanden', status: 'ok', art: 'geprueft', begruendung: `${anker.length} Anker im Modell.`, quelle: 'allgemeine Gerüstbau-Praxis' })
  }

  // 4. Ankerabstand: nur Messwert, kein Grenzwert hinterlegt
  if (anker.length > 0) {
    const ys = [...new Set(anker.map((a) => Math.round(a.positionY * 100) / 100))].sort((a, b) => a - b)
    const luecken = ys.map((y, i) => (i === 0 ? y : y - ys[i - 1]))
    const oben = model.totalHeightM - ys[ys.length - 1]
    e.push({ id: 'ANKER_ABSTAND', regel: 'Ankerabstand (senkrecht)', status: 'warnung', art: 'hinweis', begruendung: `Gemessen: ${ys.length} Ankerebenen, größter senkrechter Abstand ${m(Math.max(...luecken))} m, Abstand der obersten Ebene zur Gerüstoberkante ${m(oben)} m. Erlaubte Abstände stehen in der Zulassung bzw. Aufbau- und Verwendungsanleitung und sind hier nicht hinterlegt.`, quelle: 'Messwert aus dem Modell, Grenzwert nicht hinterlegt' })
  }

  // 5. Geländer je Lage, 6. Diagonalen
  const lageVonId = new Map(model.levels.map((l) => [l.id, l.index]))
  const lagen = [...new Set(model.levels.map((l) => l.index))].sort((a, b) => a - b)
  const mit = (typ: string) => new Set(model.components3D.filter((c) => c.type === typ && c.levelId && lageVonId.has(c.levelId)).map((c) => lageVonId.get(c.levelId as string) as number))
  const mitBelag = mit('deck')
  const mitGelaender = mit('railing')
  const ohneGelaender = lagen.filter((i) => mitBelag.has(i) && !mitGelaender.has(i))
  if (ohneGelaender.length > 0) {
    e.push({ id: 'GELAENDER', regel: 'Geländer an Arbeitsbühnen', status: 'fehler', art: 'geprueft', begruendung: `Auf ${ohneGelaender.length} Lagen gibt es Beläge, aber kein Geländer (Lage ${ohneGelaender.slice(0, 8).map((i) => i + 1).join(', ')}${ohneGelaender.length > 8 ? ' …' : ''}).`, quelle: 'DIN EN 12811-1, Seitenschutz an Arbeitsbühnen' })
  } else {
    e.push({ id: 'GELAENDER', regel: 'Geländer an Arbeitsbühnen', status: 'ok', art: 'geprueft', begruendung: `Alle ${mitBelag.size} Lagen mit Belag haben Geländer.`, quelle: 'DIN EN 12811-1, Seitenschutz an Arbeitsbühnen' })
  }

  const felderGesamt = model.fields.length
  const felderMitDiag = new Set(model.components3D.filter((c) => c.type === 'diagonal' && c.fieldId).map((c) => c.fieldId as string)).size
  if (felderGesamt > 0 && felderMitDiag === 0) {
    e.push({ id: 'DIAGONALEN', regel: 'Diagonalen vorhanden', status: 'fehler', art: 'geprueft', begruendung: `Auf ${felderGesamt} Feldern gibt es keine einzige Diagonale. Ohne Aussteifung ist das Gerüst nicht standsicher.`, quelle: 'DIN EN 12811-1, Aussteifung; kein Zahlenwert hinterlegt' })
  } else if (felderGesamt > 0) {
    e.push({ id: 'DIAGONALEN', regel: 'Diagonalen vorhanden', status: 'ok', art: 'geprueft', begruendung: `${felderMitDiag} von ${felderGesamt} Feldern haben eine Diagonale.`, quelle: 'DIN EN 12811-1, Aussteifung' })
    if (felderMitDiag < felderGesamt) {
      e.push({ id: 'DIAGONAL_RASTER', regel: 'Diagonal-Raster', status: 'warnung', art: 'hinweis', begruendung: `${felderMitDiag} von ${felderGesamt} Feldern (${m((felderMitDiag / felderGesamt) * 100, 0)} %) sind mit Diagonale ausgesteift. Der erforderliche Raster steht in der Zulassung des Systems und ist hier nicht hinterlegt.`, quelle: 'Messwert aus dem Modell, Grenzwert nicht hinterlegt' })
    }
  }

  // 7. Höhe je Abschnitt gegen den Hinweiswert der Typenstatik
  for (const a of abschnitte) {
    if (!a.eingeruestet) continue
    if (a.hoeheM > TYPENSTATIK_HOEHE_HINWEIS_M) {
      e.push({ id: 'TYPENSTATIK_HOEHE', regel: 'Höhe und Typenstatik', status: 'warnung', art: 'hinweis', abschnitt: a.name, begruendung: `Höhe ${m(a.hoeheM)} m liegt über ${TYPENSTATIK_HOEHE_HINWEIS_M} m. Darüber kann die Typenstatik enden und ein Einzelnachweis nötig sein. Die echte Grenze steht je System in der Aufbau- und Verwendungsanleitung.`, quelle: 'Fachliste (24 m); Grenze je System prüfen' })
    } else {
      e.push({ id: 'TYPENSTATIK_HOEHE', regel: 'Höhe und Typenstatik', status: 'ok', art: 'hinweis', abschnitt: a.name, begruendung: `Höhe ${m(a.hoeheM)} m liegt nicht über ${TYPENSTATIK_HOEHE_HINWEIS_M} m.`, quelle: 'Fachliste (24 m); Grenze je System prüfen' })
    }
  }

  // 8. Wind-Angaben, 9. Mischsysteme
  const fehlend = fehlendeStatikAngaben(statik).filter((x) => ['Windnorm', 'Referenzwindgeschwindigkeit', 'Geländekategorie'].includes(x))
  e.push(fehlend.length > 0
    ? { id: 'WIND_ANGABEN', regel: 'Angaben zum Wind', status: 'warnung', art: 'geprueft', begruendung: `Es fehlen: ${fehlend.join(', ')}. SCAFFOLD OS leitet keine Windwerte aus der Windzone ab.`, quelle: 'statik-daten.ts' }
    : { id: 'WIND_ANGABEN', regel: 'Angaben zum Wind', status: 'ok', art: 'geprueft', begruendung: 'Windnorm, Referenzwindgeschwindigkeit und Geländekategorie sind angegeben.', quelle: 'statik-daten.ts' })
  if (statik.systemmischung) {
    e.push({ id: 'SYSTEMMISCHUNG', regel: 'Mischsysteme', status: 'warnung', art: 'geprueft', begruendung: 'Bauteile verschiedener Hersteller oder Systeme sind gemischt: ein gesonderter Nachweis ist nötig.', quelle: 'statik-pruefpunkte.ts' })
  }

  // 10. Richtwerte aus den Zulassungs-Eckdaten der gewählten Katalogserie (nur befüllte Felder)
  e.push(...richtwertErgebnisse(model, richtwert))

  const anzahl = { ok: 0, warnung: 0, fehler: 0, verletzt: 0 }
  let ampel: PruefStatus = 'ok'
  for (const r of e) {
    anzahl[r.status]++
    if (r.art === 'geprueft' && SCHLECHTER[r.status] > SCHLECHTER[ampel]) ampel = r.status
  }
  return { ergebnisse: e, ampel, anzahl, hinweis: PRUEF_HINWEIS }
}
