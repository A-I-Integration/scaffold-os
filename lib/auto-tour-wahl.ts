// ============================================================
// SCAFFOLD OS – Automatische Fahrt bei Angebots-Annahme: Auswahl
//
// Reine Funktionen (ohne DB). Regeln (so von Michelle festgelegt):
//   • Fahrzeug: das LEICHTESTE freie Fahrzeug, dessen Nutzlast fürs
//     Materialgewicht reicht (nichts überdimensioniert, nichts geraten:
//     ohne Gewicht oder ohne hinterlegte Nutzlast kein Vorschlag).
//   • Fahrer: automatisch der Mitarbeiter, der am Tag FREI ist
//     (nicht abwesend, nicht schon in einer Tour/auf einer Baustelle
//     am selben Tag) UND das Fahrzeug laut Führerschein-Klasse fahren
//     darf. Bei mehreren: alphabetisch der erste (nachvollziehbar).
//   • Findet sich nichts Passendes: KEINE Tour, stattdessen ein
//     verständlicher Hinweis – die Dispo legt dann manuell an.
// ============================================================

import { darfFahrzeugFahren, erforderlicheKlasse } from '@/lib/touren/fuehrerschein';

export interface FahrzeugKurz {
  id: string;
  name: string;
  capacity_kg: number | null;
  zulaessiges_gesamtgewicht_kg: number | null;
}

export interface FahrerKandidat {
  employee_id: string;
  name: string;
  klassen: string[];
}

export function gesamtgewichtKg(positionen: { quantity: number; gewichtProStueckKg: number }[]): number {
  const summe = positionen.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.gewichtProStueckKg) || 0), 0);
  return Math.round(summe * 100) / 100;
}

const kg = (n: number) => `${Math.round(n).toLocaleString('de-DE')} kg`;

export type FahrzeugWahl = { fahrzeug: FahrzeugKurz } | { hinweis: string };

export function waehleFahrzeug(fahrzeuge: FahrzeugKurz[], gewicht: number, belegteIds: Set<string>): FahrzeugWahl {
  if (!(gewicht > 0)) return { hinweis: 'Das Materialgewicht ist unbekannt – Fahrzeug nicht automatisch wählbar.' };
  const mitNutzlast = fahrzeuge.filter((f) => f.capacity_kg != null && Number(f.capacity_kg) > 0);
  if (mitNutzlast.length === 0) return { hinweis: 'Bei keinem Fahrzeug ist eine Nutzlast hinterlegt (Datenpflege).' };
  const passend = mitNutzlast.filter((f) => Number(f.capacity_kg) >= gewicht);
  if (passend.length === 0) {
    const max = Math.max(...mitNutzlast.map((f) => Number(f.capacity_kg)));
    return { hinweis: `Das Material wiegt ca. ${kg(gewicht)}, die größte Nutzlast ist ${kg(max)} – bitte auf mehrere Fahrten aufteilen.` };
  }
  const frei = passend.filter((f) => !belegteIds.has(f.id));
  if (frei.length === 0) return { hinweis: 'Alle passenden Fahrzeuge sind an dem Tag schon in einer Tour.' };
  frei.sort((a, b) => Number(a.capacity_kg) - Number(b.capacity_kg) || a.name.localeCompare(b.name, 'de'));
  return { fahrzeug: frei[0] };
}

export type FahrerWahl = { fahrer: FahrerKandidat } | { hinweis: string };

export function waehleFahrer(
  kandidaten: FahrerKandidat[],
  abwesendIds: Set<string>,
  belegteIds: Set<string>,
  fahrzeug: FahrzeugKurz
): FahrerWahl {
  const frei = kandidaten.filter((k) => !abwesendIds.has(k.employee_id) && !belegteIds.has(k.employee_id));
  if (frei.length === 0) return { hinweis: 'An dem Tag ist kein Mitarbeiter frei (alle abwesend oder schon eingeteilt).' };
  const dürfen = frei.filter((k) => darfFahrzeugFahren(k.klassen, fahrzeug.zulaessiges_gesamtgewicht_kg));
  if (dürfen.length === 0) {
    const klasse = erforderlicheKlasse(fahrzeug.zulaessiges_gesamtgewicht_kg);
    return {
      hinweis: `Kein freier Mitarbeiter darf ${fahrzeug.name} fahren${klasse ? ` (Klasse ${klasse} nötig)` : ''} – Führerschein-Klassen in der Datenpflege prüfen.`,
    };
  }
  dürfen.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { fahrer: dürfen[0] };
}
