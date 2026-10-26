import { describe, it, expect } from 'vitest';
import { berechneFreigabeStatus } from '../freigabe-status';

const heute = new Date('2026-10-26T10:00:00Z');
const p = (created_at: string, details: any) => ({ type: 'pruefung_freigabe', created_at, pruefung_details: details });

describe('berechneFreigabeStatus', () => {
  it('ohne Prüfung', () => expect(berechneFreigabeStatus([], heute).stufe).toBe('keine_pruefung'));
  it('freigegeben', () => expect(berechneFreigabeStatus([p('2026-10-20T08:00:00Z', { freigegeben: true })], heute).stufe).toBe('freigegeben'));
  it('nicht freigegeben', () => expect(berechneFreigabeStatus([p('2026-10-20T08:00:00Z', { freigegeben: false })], heute).stufe).toBe('nicht_freigegeben'));
  it('Mängel offen', () => expect(berechneFreigabeStatus([p('2026-10-20T08:00:00Z', { freigegeben: true, maengel_festgestellt: true })], heute).stufe).toBe('maengel_offen'));
  it('Mängel behoben', () => expect(berechneFreigabeStatus([p('2026-10-20T08:00:00Z', { freigegeben: true, maengel_festgestellt: true, maengel_behoben: true })], heute).stufe).toBe('freigegeben'));
  it('nächste Prüfung überfällig', () => expect(berechneFreigabeStatus([p('2026-10-01T08:00:00Z', { freigegeben: true, naechste_pruefung: '2026-10-25' })], heute).stufe).toBe('pruefung_faellig'));
  it('Ereignis nach Prüfung', () => expect(berechneFreigabeStatus([p('2026-10-20T08:00:00Z', { freigegeben: true }), { type: 'ereignis', created_at: '2026-10-22T08:00:00Z' }], heute).stufe).toBe('pruefung_faellig'));
  it('neue Prüfung nach Ereignis', () => expect(berechneFreigabeStatus([{ type: 'ereignis', created_at: '2026-10-22T08:00:00Z' }, p('2026-10-23T08:00:00Z', { freigegeben: true })], heute).stufe).toBe('freigegeben'));
  it('neueste Prüfung zählt', () => expect(berechneFreigabeStatus([p('2026-10-10T08:00:00Z', { freigegeben: false }), p('2026-10-12T08:00:00Z', { freigegeben: true })], heute).stufe).toBe('freigegeben'));
});
