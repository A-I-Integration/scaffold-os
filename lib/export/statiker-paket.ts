// ============================================================
// SCAFFOLD OS – Statiker-Paket
//
// Bündelt vorhandene Exporte in EINE ZIP-Datei für den externen Statiker:
//   1 Lastannahmen-Blatt (HTML, druckbar, mit Unterschriftsfeldern)
//   2 Geometriedaten (JSON)
//   3 Stückliste ohne Preise (CSV)
//   4 Gerüst-Modell (IFC) – nur wenn der IFC-Export gelungen ist
//   0 Inhalt.txt
// Die vorhandene Dokumentation liegt bewusst NICHT bei: ihre Zeichnungsseiten sind
// nur Platzhalter, sie enthält Preise und trägt den Satz "verbindlich".
// Ein echter Gerüstplan mit Ansichten und Maßen ist noch nicht gebaut.
// Es wird nichts berechnet und kein Nachweis erstellt. Preise stehen bewusst
// nicht im Paket (der Statiker sieht auch im CAD keine Preise der Firma).
// ============================================================

import { generateStatikExport, type CADModel } from '@/lib/calculations/cad-engine'
import type { StatikDaten } from '@/lib/statik-daten'
import type { MaterialItem } from '@/types/scaffold'
import { generateLastannahmenHTML } from './lastannahmen'
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

  dateien.push({
    name: '0-Inhalt.txt',
    data: [
      `Statiker-Paket – ${e.projektName}`,
      `Stand ${e.datum} · ${e.firma}`,
      '',
      '1-Lastannahmen.html   Eingangsdaten für die Statik (Angaben des Planers, druckbar, mit Unterschriftsfeldern)',
      '2-Geometriedaten.json Positionen und Abmessungen der Bauteile und Anker',
      '3-Stueckliste.csv     Stückliste mit Gewichten, ohne Preise',
      hatIfc ? '4-Geruest.ifc        Gerüst-Modell (IFC)' : '(IFC-Modell konnte nicht erzeugt werden und liegt nicht bei)',
      '',
      'Nicht enthalten: ein Gerüstplan mit Ansichten und Maßketten (noch nicht in SCAFFOLD OS vorhanden).',
      '',
      'WICHTIG: Das Paket enthält Angaben und Geometrie, keinen Standsicherheitsnachweis und keine Berechnung.',
      'Zulassungsdaten (Querschnitte, Werkstoffe) des Systems fehlen bewusst und sind vom Statiker zu ergänzen.',
    ].join('\n'),
  })
  dateien.push({
    name: '1-Lastannahmen.html',
    data: generateLastannahmenHTML(e.model, e.statik, { projektName: e.projektName, firma: e.firma, datum: e.datum }),
  })
  dateien.push({ name: '2-Geometriedaten.json', data: JSON.stringify(generateStatikExport(e.model), null, 2) })
  dateien.push({ name: '3-Stueckliste.csv', data: stuecklisteOhnePreiseCsv(e.materials) })
  if (hatIfc) dateien.push({ name: '4-Geruest.ifc', data: e.ifc as Uint8Array })
  return dateien
}

export function erzeugeStatikerPaket(e: StatikerPaketEingabe): Uint8Array {
  return erzeugeZip(paketDateien(e))
}
