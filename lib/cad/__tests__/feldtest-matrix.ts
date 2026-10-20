// ============================================================
// SCAFFOLD OS – Feldtest-Matrix: Checkliste der Real-Fälle, die noch gesammelt werden
//
// Jeder Eintrag beschreibt EINEN echten Fall: welche Datei (Eingangstyp), woher die Sollwerte kommen und
// woran der Fall gemessen wird (Kriterien). Solange keine echte Datei vorliegt, ist status 'offen'.
// Sobald die Datei da ist: im Feldtest (/cad/feldtest) durchspielen, Protokoll ablegen, hier `referenz`
// eintragen. Dann läuft der Fall als Regressionstest (feldtest-matrix.test.ts liest `referenz`).
//
// Die Matrix ändert nichts an der Erkennung. Sie ist nur die Liste dessen, was wir belegen wollen.
// ============================================================

import type { SollQuelle, SollWerte } from '@/lib/cad/feldtest'

/** Womit der Fall hineinkommt. 'foto-pdf' und 'klick-zeichnung' laufen im CAD über die KI bzw. den Zeichner und sind im Feldtest-Werkzeug noch nicht als Datei messbar. */
export type FallEingang = 'ply' | 'dxf' | 'obj' | 'foto-pdf' | 'klick-zeichnung'

/** Woher die Sollwerte stammen. 'beleg' = Maße stehen als Zahlen im Dokument (z. B. Foto-PDF mit Beleg-Maßen). */
export type FallSollQuelle = SollQuelle | 'beleg'

export interface FeldtestKriterium {
  /** Wert-Kennung wie im Protokoll (lib/cad/feldtest.ts): laenge, breite, gesamthoehe, ecken, teil-N-laenge, teil-N-tiefe, teil-N-hoehe */
  wert: string
  /** Muss grün sein, damit der Fall besteht? false = nur beobachten */
  muss: 'gruen' | 'hoechstens-gelb' | 'beobachten'
  text: string
}

export interface FeldtestReferenz {
  /** Dateiname der echten Datei (Speicherort außerhalb des Repos, nie echte Kundendaten einchecken) */
  datei: string
  sha256: string
  soll: SollWerte
  sollQuelle: SollQuelle
  /** Wer hat wann nachgemessen / welcher Plan */
  nachweis: string
}

export interface FeldtestFall {
  id: string
  name: string
  eingang: FallEingang
  /** true = im Feldtest-Werkzeug als Datei messbar (DXF, PLY, OBJ, STL) */
  imWerkzeugMessbar: boolean
  sollQuelle: FallSollQuelle
  /** Was für den Fall zu beschaffen ist */
  beschaffung: string
  kriterien: FeldtestKriterium[]
  status: 'offen' | 'vorhanden'
  /** Erst gesetzt, wenn eine echte Datei mit Sollwerten vorliegt */
  referenz: FeldtestReferenz | null
}

export const FELDTEST_MATRIX: FeldtestFall[] = [
  {
    id: 'kirche-lidar',
    name: 'Kirchen-LiDAR-Scan',
    eingang: 'ply',
    imWerkzeugMessbar: true,
    sollQuelle: 'vor-ort',
    beschaffung: 'Scan einer echten Kirche (PLY, möglichst aus einer Scan-App wie auf der Baustelle), dazu Vor-Ort-Nachmessung von Schiff, Turm und Anbauten (Länge, Tiefe, Traufhöhe, Gesamthöhe).',
    kriterien: [
      { wert: 'laenge', muss: 'gruen', text: 'Gesamtlänge bis 5 % genau' },
      { wert: 'breite', muss: 'gruen', text: 'größte Tiefe bis 5 % genau' },
      { wert: 'gesamthoehe', muss: 'hoechstens-gelb', text: 'Gesamthöhe (Turmspitze) bis 15 % genau' },
      { wert: 'teil-1-hoehe', muss: 'beobachten', text: 'Traufhöhen je Teil: wie weit trägt die Teile-Erkennung bei echten Scans?' },
    ],
    status: 'offen',
    referenz: null,
  },
  {
    id: 'statiker-dxf',
    name: 'Statiker-DXF-Grundriss',
    eingang: 'dxf',
    imWerkzeugMessbar: true,
    sollQuelle: 'plan',
    beschaffung: 'Grundriss-DXF aus dem Statikbüro (echte Ebenen, Bemaßung, evtl. mehrere Figuren), dazu die Maße aus dem Plan.',
    kriterien: [
      { wert: 'laenge', muss: 'gruen', text: 'Länge bis 5 % genau' },
      { wert: 'breite', muss: 'gruen', text: 'Breite bis 5 % genau' },
      { wert: 'ecken', muss: 'gruen', text: 'Anzahl Ecken stimmt exakt' },
    ],
    status: 'offen',
    referenz: null,
  },
  {
    id: 'architekt-obj',
    name: 'Architekten-OBJ-Export',
    eingang: 'obj',
    imWerkzeugMessbar: true,
    sollQuelle: 'plan',
    beschaffung: 'OBJ-Export aus Architektursoftware (SketchUp/ArchiCAD/Revit), dazu Außenmaße und Höhen aus dem Entwurfsplan; Einheit und Achse der Datei notieren.',
    kriterien: [
      { wert: 'laenge', muss: 'gruen', text: 'Länge bis 5 % genau (mit richtig gewählter Einheit)' },
      { wert: 'gesamthoehe', muss: 'gruen', text: 'Gesamthöhe bis 5 % genau' },
      { wert: 'teil-1-laenge', muss: 'beobachten', text: 'Teile-Zerlegung bei Anbauten und Dachaufbauten' },
    ],
    status: 'offen',
    referenz: null,
  },
  {
    id: 'foto-pdf-beleg',
    name: 'Foto-PDF mit Beleg-Maßen',
    eingang: 'foto-pdf',
    imWerkzeugMessbar: false,
    sollQuelle: 'beleg',
    beschaffung: 'Foto oder PDF eines Plans, in dem Maße als Zahlen stehen (Beleg im Dokument). Die Auswertung läuft über die KI-Planlesung; das Feldtest-Werkzeug kann diesen Eingang noch nicht als Datei messen.',
    kriterien: [
      { wert: 'laenge', muss: 'gruen', text: 'Länge stimmt mit der Beleg-Zahl überein' },
      { wert: 'breite', muss: 'gruen', text: 'Breite stimmt mit der Beleg-Zahl überein' },
      { wert: 'gesamthoehe', muss: 'beobachten', text: 'Höhe nur, wenn im Plan vermaßt (sonst bewusst leer)' },
    ],
    status: 'offen',
    referenz: null,
  },
  {
    id: 'klick-umriss',
    name: 'Klick-gezeichneter Umriss',
    eingang: 'klick-zeichnung',
    imWerkzeugMessbar: false,
    sollQuelle: 'vor-ort',
    beschaffung: 'Umriss, den eine Person im Klick-Zeichner nach Vor-Ort-Maßen zeichnet (Eckpunkte und Maße notieren). Messbar wird der Fall, sobald der Zeichner die Zeichnung als DXF ablegt und im Werkzeug geladen wird.',
    kriterien: [
      { wert: 'laenge', muss: 'gruen', text: 'Länge bis 5 % genau' },
      { wert: 'breite', muss: 'gruen', text: 'Breite bis 5 % genau' },
      { wert: 'ecken', muss: 'gruen', text: 'Anzahl Ecken stimmt exakt' },
    ],
    status: 'offen',
    referenz: null,
  },
]
