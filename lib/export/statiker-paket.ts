// ============================================================
// SCAFFOLD OS – Statiker-Paket
//
// Bündelt die Unterlagen für den externen Statiker in EINE ZIP-Datei:
//   0 Inhalt.txt
//   1 Geruestplan.pdf          Vorderansicht + Grundriss, Maßketten (Vektor)
//   2 Geruestplan.dxf          dieselben Zeichnungen, Layer GERUEST / MASSE / TEXTE
//   3 Lastannahmen-Pruefprotokoll.pdf  Lastannahmen-Blatt + Prüfprotokoll (DIN EN 12811-1)
//   4 Stueckliste.csv          ohne Preise
//   5 Geometriedaten.json
//   6 Geruest.ifc              nur wenn der IFC-Export gelungen ist
// Die vorhandene Dokumentation liegt bewusst NICHT bei (Platzhalter-Zeichnungen,
// Preise, "verbindlich"). Es wird nichts berechnet und kein Nachweis erstellt.
// Der Plan ist schematisch (siehe Hinweis in Inhalt.txt).
// ============================================================

import { generateStatikExport, type CADModel } from '@/lib/calculations/cad-engine'
import type { StatikDaten } from '@/lib/statik-daten'
import type { MaterialItem } from '@/types/scaffold'
import { erzeugeZeichnungen } from '@/lib/geruest/plan-zeichnung'
import { pruefeGeruest } from '@/lib/geruest/regelpruefung'
import { erzeugePlanPdf } from './plan-pdf'
import { erzeugeDxf } from './dxf-export'
import { erzeugeLastannahmenPdf } from './lastannahmen-pdf'
import { erzeugeZip, type ZipDatei } from './zip'

export interface StatikerPaketEingabe {
  model: CADModel
  materials: MaterialItem[]
  statik: StatikDaten
  projektName: string
  firma: string
  /** Deutsches Datum für die Anzeige, z. B. 19.10.2026 */
  datum: string
  ifc?: Uint8Array | null
}

/** Stückliste ohne Preise (Semikolon, Dezimalkomma, UTF-8 mit BOM für Excel). */
export function stuecklisteOhnePreiseCsv(materials: MaterialItem[]): string {
  const sep = ';'
  const dez = (n: number) => String(n).replace('.', ',')
  const feld = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const zeilen = [
    ['Artikelnummer', 'Bezeichnung', 'Kategorie', 'Menge', 'Einheit', 'Gewicht je Stk (kg)', 'Gewicht gesamt (kg)'].join(sep),
    ...materials.map((m) => [
      feld(m.articleNumber), feld(m.name), feld(m.category), m.quantity, feld(m.unit),
      dez(m.weightKg), dez(Math.round(m.weightKg * m.quantity * 10) / 10),
    ].join(sep)),
  ]
  const gesamt = materials.reduce((s, m) => s + m.weightKg * m.quantity, 0)
  zeilen.push('', ['GESAMT', '', '', '', '', '', dez(Math.round(gesamt))].join(sep))
  return '﻿' + zeilen.join('\n')
}

export function paketDateien(e: StatikerPaketEingabe): ZipDatei[] {
  const dateien: ZipDatei[] = []
  const hatIfc = !!e.ifc && e.ifc.length > 0
  const opt = { projektName: e.projektName, firma: e.firma, datum: e.datum }
  const zeichnungen = erzeugeZeichnungen(e.model)
  const protokoll = pruefeGeruest(e.model, e.statik)

  dateien.push({
    name: '0-Inhalt.txt',
    data: [
      `Statiker-Paket – ${e.projektName}`,
      `Stand ${e.datum} · ${e.firma}`,
      '',
      '1-Geruestplan.pdf                 Vorderansicht und Grundriss mit Maßketten (Vektor-PDF)',
      '2-Geruestplan.dxf                 dieselben Zeichnungen für CAD (Layer GERUEST, MASSE, TEXTE; Einheit mm)',
      '3-Lastannahmen-Pruefprotokoll.pdf Eingangsdaten für die Statik (Angaben des Planers) und Prüfprotokoll nach DIN EN 12811-1',
      '4-Stueckliste.csv                 Stückliste mit Gewichten, ohne Preise',
      '5-Geometriedaten.json             Positionen und Abmessungen der Bauteile und Anker',
      hatIfc ? '6-Geruest.ifc                    Gerüst-Modell (IFC)' : '(IFC-Modell konnte nicht erzeugt werden und liegt nicht bei)',
      '',
      `Regelprüfung: ${protokoll.anzahl.ok} OK, ${protokoll.anzahl.warnung} Warnungen, ${protokoll.anzahl.fehler} Fehler (siehe Prüfprotokoll).`,
      '',
      'HINWEISE:',
      '- Der Plan ist schematisch aus dem Modell erzeugt (Gerüst im Abstand der Wandabstand-Einstellung, Dächer vereinfacht). Er ersetzt keinen Aufbau- und Verwendungsplan.',
      '- Das Paket enthält Angaben und Geometrie, keinen Standsicherheitsnachweis und keine Berechnung.',
      '- Zulassungsdaten (Querschnitte, Werkstoffe) des Systems fehlen bewusst und sind vom Statiker zu ergänzen.',
    ].join('\n'),
  })
  dateien.push({ name: '1-Geruestplan.pdf', data: erzeugePlanPdf(zeichnungen, opt) })
  dateien.push({ name: '2-Geruestplan.dxf', data: erzeugeDxf(zeichnungen) })
  dateien.push({ name: '3-Lastannahmen-Pruefprotokoll.pdf', data: erzeugeLastannahmenPdf(e.model, e.statik, opt, protokoll) })
  dateien.push({ name: '4-Stueckliste.csv', data: stuecklisteOhnePreiseCsv(e.materials) })
  dateien.push({ name: '5-Geometriedaten.json', data: JSON.stringify(generateStatikExport(e.model), null, 2) })
  if (hatIfc) dateien.push({ name: '6-Geruest.ifc', data: e.ifc as Uint8Array })
  return dateien
}

export function erzeugeStatikerPaket(e: StatikerPaketEingabe): Uint8Array {
  return erzeugeZip(paketDateien(e))
}
