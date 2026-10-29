// ============================================================
// SCAFFOLD OS – IFC-Rahmenprüfung (gemeinsam für Browser-Import UND Hetzner-Worker)
//
// Eine einzige Quelle für die Prüfungen VOR web-ifc: STEP-Kopf/-Ende und STEP-Syntax. web-ifc bleibt bei
// unausgeglichenen Klammern in einer Endlosschleife hängen – im Browser fror die Seite ein, im Worker würde der
// Job (und die KI-Queue) blockieren. Deshalb prüft der Worker vor dem Öffnen genauso wie der Browser.
// Reines CommonJS ohne Abhängigkeiten, damit es im Docker-Image und in Next.js/vitest gleichermaßen läuft.
// Rückgabe: null (in Ordnung) oder { grund, meldung } (grund: 'kein-ifc' | 'kaputt').
// ============================================================

const fehler = (grund, meldung) => ({ grund, meldung })

const dekodiere = (b) => new TextDecoder('latin1').decode(b)

/** Kopf und Ende prüfen: STEP-Datei, vollständig. Gibt einen Fehler zurück oder null. */
function pruefeIfcRahmen(daten) {
  const kopf = dekodiere(daten.subarray(0, 256)).replace(/^﻿/, '').trimStart()
  if (daten[0] === 0x50 && daten[1] === 0x4b) return fehler('kein-ifc', 'Das ist eine gepackte Datei (ifcZIP). Bitte die IFC entpacken und die .ifc-Datei hochladen.')
  if (/^\s*</.test(kopf) || /ifcXML/i.test(kopf.slice(0, 200))) return fehler('kein-ifc', 'IFC im XML-Format (ifcXML) wird nicht gelesen. Bitte als normale IFC-Datei (STEP, .ifc) exportieren.')
  if (!kopf.startsWith('ISO-10303-21')) return fehler('kein-ifc', 'Die Datei ist keine IFC-Datei im STEP-Format (sie beginnt nicht mit „ISO-10303-21“).')
  const ende = dekodiere(daten.subarray(Math.max(0, daten.length - 1024)))
  if (!/END-ISO-10303-21/.test(ende)) return fehler('kaputt', 'Die IFC-Datei ist unvollständig oder beschädigt (das Dateiende fehlt, vermutlich ein abgebrochener Export oder Download). Es wurde nichts importiert – bitte die Datei neu exportieren.')
  if (!/\bDATA\s*;/.test(dekodiere(daten.subarray(0, Math.min(daten.length, 65536))))) return fehler('kaputt', 'Die IFC-Datei hat keinen Datenteil (DATA) und ist damit beschädigt. Es wurde nichts importiert.')
  return null
}

/**
 * Syntaxprüfung des STEP-Datenteils VOR web-ifc: Klammern ausgeglichen, Texte geschlossen, jede Anweisung beginnt mit
 * „#Nummer=“ und endet mit „;“. Hintergrund: web-ifc bleibt bei unausgeglichenen Klammern in einer Endlosschleife hängen
 * (im Test gefunden) – im Browser wäre die Seite dann eingefroren. Ein Durchlauf, linear in der Dateigröße.
 */
function pruefeStepSyntax(daten) {
  const n = daten.length
  // Beginn des Datenteils: erstes „DATA;“ (nach dem Kopf)
  let i = 0
  const kopfText = dekodiere(daten.subarray(0, Math.min(n, 65536)))
  const dm = /\bDATA\s*;/.exec(kopfText)
  if (!dm) return null   // pruefeIfcRahmen meldet das
  i = dm.index + dm[0].length
  let tiefe = 0, zeile = 1 + (kopfText.slice(0, i).match(/\n/g)?.length ?? 0)
  let imText = false, imKommentar = false
  let anweisungStart = -1   // Beginn der aktuellen Anweisung
  let kopfPruefung = 0      // 0 = vor '#', 1 = Nummer, 2 = '=' erwartet, 3 = Inhalt
  const fehlerAn = (was) => fehler('kaputt', `Die IFC-Datei hat einen Syntaxfehler in Zeile ${zeile} (${was}). Sie ist beschädigt und wurde nicht importiert – bitte neu exportieren.`)
  for (; i < n; i++) {
    const c = daten[i]
    if (c === 10) zeile++
    if (imKommentar) { if (c === 42 && daten[i + 1] === 47) { imKommentar = false; i++ } continue }
    if (imText) { if (c === 39) { if (daten[i + 1] === 39) i++; else imText = false } continue }
    if (c === 47 && daten[i + 1] === 42) { imKommentar = true; i++; continue }
    if (c === 32 || c === 9 || c === 10 || c === 13) { if (kopfPruefung === 1) kopfPruefung = 2; continue }
    if (anweisungStart < 0) {
      // außerhalb einer Anweisung: nur „#“ (neue Anweisung) oder das Ende des Datenteils „ENDSEC;“
      if (c === 35) { anweisungStart = i; kopfPruefung = 1; tiefe = 0; continue }
      if (c === 69 /* E */) return daten[i + 1] === 78 && daten[i + 2] === 68 && daten[i + 3] === 83 ? null : fehlerAn('unerwartetes Zeichen')
      return fehlerAn('unerwartetes Zeichen')
    }
    if (kopfPruefung === 1) { if (c >= 48 && c <= 57) continue; if (c === 61) { kopfPruefung = 3; continue } return fehlerAn('Anweisung ohne „#Nummer=“') }
    if (kopfPruefung === 2) { if (c === 61) { kopfPruefung = 3; continue } return fehlerAn('Anweisung ohne „=“') }
    if (c === 39) { imText = true; continue }
    if (c === 40) tiefe++
    else if (c === 41) { tiefe--; if (tiefe < 0) return fehlerAn('zu viele schließende Klammern') }
    else if (c === 59) { if (tiefe !== 0) return fehlerAn('Klammern nicht ausgeglichen'); anweisungStart = -1; kopfPruefung = 0 }
  }
  if (anweisungStart >= 0 || imText || imKommentar) return fehlerAn('Anweisung nicht abgeschlossen')
  return null
}

module.exports = { pruefeIfcRahmen, pruefeStepSyntax }
