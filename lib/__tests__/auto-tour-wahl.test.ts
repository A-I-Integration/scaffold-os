import { describe, it, expect } from 'vitest';
import { gesamtgewichtKg, waehleFahrzeug, waehleFahrer, teileInFahrten, type FahrzeugKurz, type FahrerKandidat } from '../auto-tour-wahl';

const sprinter: FahrzeugKurz = { id: 'v1', name: 'Sprinter 1', capacity_kg: 1200, zulaessiges_gesamtgewicht_kg: 3500 };
const lkw: FahrzeugKurz = { id: 'v2', name: 'Lkw 1', capacity_kg: 6000, zulaessiges_gesamtgewicht_kg: 12000 };
const ohne: FahrzeugKurz = { id: 'v3', name: 'Alt', capacity_kg: null, zulaessiges_gesamtgewicht_kg: null };

describe('gesamtgewichtKg', () => {
  it('summiert Menge × Stückgewicht', () => {
    expect(gesamtgewichtKg([{ quantity: 2, gewichtProStueckKg: 12.5 }, { quantity: 10, gewichtProStueckKg: 0.8 }])).toBe(33);
  });
  it('leer = 0', () => expect(gesamtgewichtKg([])).toBe(0));
});

describe('waehleFahrzeug', () => {
  it('nimmt das leichteste passende', () => {
    const r = waehleFahrzeug([lkw, sprinter], 900, new Set());
    expect('fahrzeug' in r && r.fahrzeug.id).toBe('v1');
  });
  it('geht auf das größere, wenn das kleine nicht reicht', () => {
    const r = waehleFahrzeug([sprinter, lkw], 3000, new Set());
    expect('fahrzeug' in r && r.fahrzeug.id).toBe('v2');
  });
  it('überspringt belegte Fahrzeuge', () => {
    const r = waehleFahrzeug([sprinter, lkw], 900, new Set(['v1']));
    expect('fahrzeug' in r && r.fahrzeug.id).toBe('v2');
  });
  it('ohne Gewicht kein Vorschlag', () => {
    expect('hinweis' in waehleFahrzeug([sprinter], 0, new Set())).toBe(true);
  });
  it('Fahrzeuge ohne Nutzlast werden nicht geraten', () => {
    const r = waehleFahrzeug([ohne], 100, new Set());
    expect('hinweis' in r && r.hinweis).toMatch(/Nutzlast/);
  });
  it('zu schwer für alle: Hinweis mit Zahlen', () => {
    const r = waehleFahrzeug([sprinter, lkw], 9000, new Set());
    expect('hinweis' in r && r.hinweis).toMatch(/9\.000 kg/);
  });
  it('alle passenden belegt: Hinweis', () => {
    const r = waehleFahrzeug([sprinter], 500, new Set(['v1']));
    expect('hinweis' in r && r.hinweis).toMatch(/schon in einer Tour/);
  });
});

const anna: FahrerKandidat = { employee_id: 'e1', name: 'Anna Alt', klassen: ['B'] };
const bert: FahrerKandidat = { employee_id: 'e2', name: 'Bert Bauer', klassen: ['C', 'CE'] };
const cora: FahrerKandidat = { employee_id: 'e3', name: 'Cora Claasen', klassen: ['C1'] };

describe('waehleFahrer', () => {
  it('nimmt den ersten freien, der fahren darf (alphabetisch)', () => {
    const r = waehleFahrer([bert, anna], new Set(), new Set(), sprinter);
    expect('fahrer' in r && r.fahrer.employee_id).toBe('e1');
  });
  it('überspringt Abwesende und Eingeteilte', () => {
    const r = waehleFahrer([anna, bert, cora], new Set(['e1']), new Set(['e2']), sprinter);
    expect('fahrer' in r && r.fahrer.employee_id).toBe('e3');
  });
  it('beachtet die Führerschein-Klasse', () => {
    const r = waehleFahrer([anna, bert], new Set(), new Set(), lkw);
    expect('fahrer' in r && r.fahrer.employee_id).toBe('e2');
  });
  it('niemand frei: Hinweis', () => {
    const r = waehleFahrer([anna], new Set(['e1']), new Set(), sprinter);
    expect('hinweis' in r && r.hinweis).toMatch(/kein Mitarbeiter frei/);
  });
  it('frei, aber keiner darf: Hinweis mit Klasse', () => {
    const r = waehleFahrer([anna], new Set(), new Set(), lkw);
    expect('hinweis' in r && r.hinweis).toMatch(/Klasse C1E/);
  });
  it('Fahrzeug ohne hinterlegtes Gesamtgewicht: nicht blockieren', () => {
    const r = waehleFahrer([anna], new Set(), new Set(), { ...sprinter, zulaessiges_gesamtgewicht_kg: null });
    expect('fahrer' in r).toBe(true);
  });
});

describe('teileInFahrten', () => {
  const pos = (g: number) => ({ gewicht: g });
  it('teilt 3716 kg auf zwei Fahrten à max. 3500', () => {
    const r = teileInFahrten([pos(2000), pos(1000), pos(600), pos(116)], 3500);
    expect('fahrten' in r).toBe(true);
    if ('fahrten' in r) {
      expect(r.fahrten).toHaveLength(2);
      for (const f of r.fahrten) expect(f.reduce((s, x) => s + x.gewicht, 0)).toBeLessThanOrEqual(3500);
      expect(r.fahrten.flat()).toHaveLength(4);
    }
  });
  it('schwerste Fahrt zuerst', () => {
    const r = teileInFahrten([pos(3000), pos(900)], 3500);
    if ('fahrten' in r) expect(r.fahrten[0][0].gewicht).toBe(3000);
  });
  it('einzelne zu schwere Position → Hinweis', () => {
    expect('hinweis' in teileInFahrten([pos(4000)], 3500)).toBe(true);
  });
});

import { planeFahrtZeit, minutenZuUhrzeit, uhrzeitZuMinuten, FAHRT_DAUER_MIN, type ZeitPlanung } from '../auto-tour-wahl';

describe('planeFahrtZeit', () => {
  const lkwB: FahrzeugKurz = { id: 'v1', name: 'Lkw', capacity_kg: 5000, zulaessiges_gesamtgewicht_kg: null };
  const fahrer: FahrerKandidat = { employee_id: 'e1', name: 'Anna', klassen: ['B'] };
  const leer = (): ZeitPlanung => ({ fahrzeugFreiAb: new Map(), maFreiAb: new Map() });
  const basis = { fahrzeuge: [lkwB], kandidaten: [fahrer], abwesendIds: new Set<string>(), ganztagBelegteMa: new Set<string>(), gewicht: 1000 };

  it('erste Fahrt startet 07:00, die nächsten folgen im Abstand der Fahrtdauer', () => {
    const zeit = leer();
    const r1 = planeFahrtZeit({ ...basis, zeit });
    const r2 = planeFahrtZeit({ ...basis, zeit });
    const r3 = planeFahrtZeit({ ...basis, zeit });
    expect('startMin' in r1 && r1.startMin).toBe(420);
    expect('startMin' in r2 && r2.startMin).toBe(420 + FAHRT_DAUER_MIN);
    expect('startMin' in r3 && r3.startMin).toBe(420 + 2 * FAHRT_DAUER_MIN);
  });
  it('bestehende Tour belegt das Fahrzeug bis Start + Dauer', () => {
    const zeit = leer();
    zeit.fahrzeugFreiAb.set('v1', 420 + FAHRT_DAUER_MIN);
    zeit.maFreiAb.set('e1', 420 + FAHRT_DAUER_MIN);
    const r = planeFahrtZeit({ ...basis, zeit });
    expect('startMin' in r && r.startMin).toBe(600);
  });
  it('zu spät am Tag → Hinweis statt Fahrt', () => {
    const zeit = leer();
    zeit.fahrzeugFreiAb.set('v1', 16 * 60);
    const r = planeFahrtZeit({ ...basis, zeit });
    expect('hinweis' in r).toBe(true);
  });
  it('zwei Fahrzeuge: zwei Fahrer fahren parallel um 07:00', () => {
    const zeit = leer();
    const v2: FahrzeugKurz = { id: 'v2', name: 'Sprinter', capacity_kg: 5000, zulaessiges_gesamtgewicht_kg: null };
    const f2: FahrerKandidat = { employee_id: 'e2', name: 'Max', klassen: ['B'] };
    const b = { ...basis, fahrzeuge: [lkwB, v2], kandidaten: [fahrer, f2] };
    const r1 = planeFahrtZeit({ ...b, zeit });
    const r2 = planeFahrtZeit({ ...b, zeit });
    expect('startMin' in r1 && r1.startMin).toBe(420);
    expect('startMin' in r2 && r2.startMin).toBe(420);
  });
  it('ganztägig gebundener Fahrer wird nicht eingeplant', () => {
    const r = planeFahrtZeit({ ...basis, zeit: leer(), ganztagBelegteMa: new Set(['e1']) });
    expect('hinweis' in r).toBe(true);
  });
  it('Uhrzeit-Hilfen', () => {
    expect(minutenZuUhrzeit(600)).toBe('10:00:00');
    expect(uhrzeitZuMinuten('07:00:00')).toBe(420);
    expect(uhrzeitZuMinuten(null)).toBe(420);
  });
});
