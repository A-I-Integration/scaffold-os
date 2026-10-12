import { describe, it, expect } from 'vitest';
import { gesamtgewichtKg, waehleFahrzeug, waehleFahrer, type FahrzeugKurz, type FahrerKandidat } from '../auto-tour-wahl';

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
