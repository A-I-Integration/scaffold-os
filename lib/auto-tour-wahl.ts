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

/**
 * Teilt Transportaufträge auf mehrere Fahrten auf (jede Fahrt höchstens maxKg),
 * größte zuerst. Ein einzelner Auftrag, der allein zu schwer ist, wird nicht
 * zerschnitten – dann Hinweis statt Tour.
 */
export function teileInFahrten<T extends { gewicht: number }>(
  items: T[],
  maxKg: number
): { fahrten: T[][] } | { hinweis: string } {
  const sortiert = [...items].sort((a, b) => b.gewicht - a.gewicht);
  const fahrten: T[][] = [];
  const summen: number[] = [];
  for (const it of sortiert) {
    if (it.gewicht > maxKg) {
      return { hinweis: `Eine einzelne Position wiegt ca. ${kg(it.gewicht)} und passt in kein Fahrzeug (größte Nutzlast ${kg(maxKg)}) – bitte manuell aufteilen.` };
    }
    const i = summen.findIndex((s) => s + it.gewicht <= maxKg);
    if (i >= 0) { fahrten[i].push(it); summen[i] += it.gewicht; }
    else { fahrten.push([it]); summen.push(it.gewicht); }
  }
  // schwerste Fahrt zuerst, damit sie das größte freie Fahrzeug bekommt
  const idx = summen.map((_, i) => i).sort((a, b) => summen[b] - summen[a]);
  return { fahrten: idx.map((i) => fahrten[i]) };
}

// ------------------------------------------------------------
// Zeitplanung: Ein Fahrzeug/Fahrer kann am Tag mehrere Fahrten NACHEINANDER
// fahren (auch für verschiedene Baustellen). Jede Fahrt dauert pauschal
// FAHRT_DAUER_MIN – das ist eine ANNAHME (Standard 3 Stunden, von Michelle
// als Vorschlag übernommen), keine gemessene Größe. Die Dispo kann die Startzeit
// in Touren jederzeit ändern. Fahrten beginnen frühestens TAG_START_MIN und
// spätestens LETZTER_START_MIN (ebenfalls Annahme), sonst: Hinweis "Tag voll".
// ------------------------------------------------------------
export const FAHRT_DAUER_MIN = 180;
export const TAG_START_MIN = 7 * 60;
export const LETZTER_START_MIN = 15 * 60;

export interface ZeitPlanung {
  /** Fahrzeug-ID → ab dieser Minute (seit 00:00) wieder frei */
  fahrzeugFreiAb: Map<string, number>;
  /** Mitarbeiter-ID → ab dieser Minute wieder frei */
  maFreiAb: Map<string, number>;
}

export function minutenZuUhrzeit(min: number): string {
  const h = String(Math.floor(min / 60)).padStart(2, '0');
  const m = String(min % 60).padStart(2, '0');
  return `${h}:${m}:00`;
}

export function uhrzeitZuMinuten(zeit: string | null | undefined): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(zeit || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : TAG_START_MIN;
}

/**
 * Sucht für eine Fahrt (Gewicht in kg) den frühesten Startzeitpunkt, zu dem
 * ein passendes Fahrzeug UND ein fahrberechtigter, freier Fahrer verfügbar sind.
 * Trägt bei Erfolg die Belegung (Start + Fahrtdauer) in `zeit` ein.
 */
export function planeFahrtZeit(a: {
  fahrzeuge: FahrzeugKurz[];
  kandidaten: FahrerKandidat[];
  abwesendIds: Set<string>;
  /** ganztägig gebunden (z. B. auf einer Baustelle eingeteilt) */
  ganztagBelegteMa: Set<string>;
  zeit: ZeitPlanung;
  gewicht: number;
}): { fahrzeug: FahrzeugKurz; fahrer: FahrerKandidat; startMin: number } | { hinweis: string } {
  const kandidatenZeiten = new Set<number>([TAG_START_MIN]);
  for (const v of a.zeit.fahrzeugFreiAb.values()) kandidatenZeiten.add(v);
  for (const v of a.zeit.maFreiAb.values()) kandidatenZeiten.add(v);
  const zeiten = Array.from(kandidatenZeiten)
    .filter((t) => t >= TAG_START_MIN && t <= LETZTER_START_MIN)
    .sort((x, y) => x - y);

  let hinweisFz: string | null = null;
  let hinweisFahrer: string | null = null;
  for (const t of zeiten) {
    const belegteFz = new Set<string>();
    a.zeit.fahrzeugFreiAb.forEach((frei, id) => { if (frei > t) belegteFz.add(id); });
    const fz = waehleFahrzeug(a.fahrzeuge, a.gewicht, belegteFz);
    if ('hinweis' in fz) { hinweisFz = hinweisFz ?? fz.hinweis; continue; }
    const belegteMa = new Set<string>(a.ganztagBelegteMa);
    a.zeit.maFreiAb.forEach((frei, id) => { if (frei > t) belegteMa.add(id); });
    const fa = waehleFahrer(a.kandidaten, a.abwesendIds, belegteMa, fz.fahrzeug);
    if ('hinweis' in fa) { hinweisFahrer = hinweisFahrer ?? fa.hinweis; continue; }
    a.zeit.fahrzeugFreiAb.set(fz.fahrzeug.id, t + FAHRT_DAUER_MIN);
    a.zeit.maFreiAb.set(fa.fahrer.employee_id, t + FAHRT_DAUER_MIN);
    return { fahrzeug: fz.fahrzeug, fahrer: fa.fahrer, startMin: t };
  }
  return {
    hinweis: hinweisFahrer
      ?? (hinweisFz ? `${hinweisFz} (spätester Fahrtbeginn ${minutenZuUhrzeit(LETZTER_START_MIN).slice(0, 5)} Uhr)` : 'Der Tag ist für Fahrten voll.'),
  };
}
