// ============================================================
// SCAFFOLD OS – Ortung: Aufenthalte an Baustellen erkennen und daraus Tagesabschnitte vorschlagen
// Reine Rechenlogik. Die Vorschläge werden nie automatisch gebucht: Dispo/Chef übernehmen und korrigieren sie.
// Grundlage: Positionen eines Fahrzeugs (Tabelle gps_tracking, per App oder CSV-Import vom Telematik-Anbieter),
// Baustellen-Koordinaten der Tour-Stopps und Abfahrt/Rückkehr der Tour. Ohne Koordinaten oder Positionen gibt es keinen Vorschlag.
// ============================================================

export interface Pos { t: string; lat: number; lng: number }
export interface Ort { id: string; project_id: string | null; name: string; lat: number; lng: number }
export interface Aufenthalt { ort: Ort; von: string; bis: string }
export interface Vorschlag { art: 'baustelle' | 'fahrt_hof'; start_time: string; end_time: string; project_id: string | null; note: string; begruendung: string }

export const STANDARD_RADIUS_M = 150;
export const STANDARD_MIN_MINUTEN = 10;

export function abstandMeter(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const ms = (t: string) => Date.parse(t);
const minuten = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 60000);
const uhr = (t: string) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

/** Zusammenhängende Positionen innerhalb des Radius um einen Ort = ein Aufenthalt (mindestens minMinuten lang). */
export function erkenneAufenthalte(positionen: Pos[], orte: Ort[], opt: { radiusM?: number; minMinuten?: number } = {}): Aufenthalt[] {
  const radius = opt.radiusM ?? STANDARD_RADIUS_M, mindest = opt.minMinuten ?? STANDARD_MIN_MINUTEN;
  const sortiert = positionen.filter(p => Number.isFinite(ms(p.t)) && Number.isFinite(p.lat) && Number.isFinite(p.lng)).sort((a, b) => ms(a.t) - ms(b.t));
  const ergebnis: Aufenthalt[] = [];
  let lauf: { ort: Ort; von: string; bis: string } | null = null;
  const abschliessen = () => { if (lauf && minuten(lauf.von, lauf.bis) >= mindest) ergebnis.push(lauf); lauf = null; };
  for (const p of sortiert) {
    let naechster: Ort | null = null, best = Infinity;
    for (const o of orte) { const d = abstandMeter(p, o); if (d <= radius && d < best) { best = d; naechster = o; } }
    if (naechster && lauf && lauf.ort.id === naechster.id) lauf.bis = p.t;
    else { abschliessen(); if (naechster) lauf = { ort: naechster, von: p.t, bis: p.t }; }
  }
  abschliessen();
  return ergebnis;
}

export interface TourZeiten { departed_at: string | null; returned_at: string | null }

/** Abschnitte der Tour: Fahrt vom Hof, Zeit auf der Baustelle, Fahrten dazwischen, Rückfahrt zum Hof. */
export function schlageAbschnitteVor(tour: TourZeiten, aufenthalte: Aufenthalt[]): { vorschlaege: Vorschlag[]; hinweise: string[] } {
  const vorschlaege: Vorschlag[] = [], hinweise: string[] = [];
  if (!aufenthalte.length) { hinweise.push('Keine Aufenthalte an den Baustellen der Tour erkannt (keine Positionen oder keine Baustellen-Koordinaten).'); return { vorschlaege, hinweise }; }
  let cursor = tour.departed_at;
  if (!cursor) hinweise.push('Die Tour hat keine Abfahrtszeit vom Hof: die erste Fahrt wird nicht vorgeschlagen.');
  aufenthalte.forEach((a, i) => {
    if (cursor && minuten(cursor, a.von) >= 2) {
      const vomHof = i === 0 && cursor === tour.departed_at;
      vorschlaege.push({ art: 'fahrt_hof', start_time: new Date(cursor).toISOString(), end_time: new Date(a.von).toISOString(), project_id: null, note: vomHof ? 'Fahrt vom Hof' : 'Fahrt zwischen Baustellen',
        begruendung: vomHof ? `Abfahrt vom Hof ${uhr(cursor)}, Ankunft an der Baustelle ${uhr(a.von)}.` : `Abfahrt ${uhr(cursor)}, Ankunft ${uhr(a.von)}.` });
    }
    vorschlaege.push({ art: 'baustelle', start_time: new Date(a.von).toISOString(), end_time: new Date(a.bis).toISOString(), project_id: a.ort.project_id, note: a.ort.name.slice(0, 120),
      begruendung: `Fahrzeug von ${uhr(a.von)} bis ${uhr(a.bis)} im Umkreis der Baustelle (${minuten(a.von, a.bis)} min).` });
    cursor = a.bis;
  });
  if (tour.returned_at && cursor && minuten(cursor, tour.returned_at) >= 2) {
    vorschlaege.push({ art: 'fahrt_hof', start_time: new Date(cursor).toISOString(), end_time: new Date(tour.returned_at).toISOString(), project_id: null, note: 'Rückfahrt zum Hof', begruendung: `Abfahrt von der Baustelle ${uhr(cursor)}, zurück auf dem Hof ${uhr(tour.returned_at)}.` });
  } else if (!tour.returned_at) hinweise.push('Die Tour hat keine Rückkehrzeit zum Hof: die Rückfahrt wird nicht vorgeschlagen.');
  return { vorschlaege, hinweise };
}

// ---------- CSV-Import vom Telematik-Anbieter ----------

export interface CsvPosition { kennzeichen: string; t: string; lat: number; lng: number }
export interface CsvErgebnis { positionen: CsvPosition[]; ungueltig: number; fehler?: string }

export const normKennzeichen = (s: string) => s.toUpperCase().replace(/[^A-Z0-9ÄÖÜ]/g, '');

/** Ortszeit Deutschland → UTC-Zeitpunkt. */
export function berlinLokal(y: number, m: number, d: number, h = 0, mi = 0, s = 0): Date {
  let t = Date.UTC(y, m - 1, d, h, mi, s);
  for (let i = 0; i < 2; i++) {
    const teile = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map(p => [p.type, p.value]));
    const gezeigt = Date.UTC(+teile.year, +teile.month - 1, +teile.day, +teile.hour, +teile.minute, +teile.second);
    t -= gezeigt - Date.UTC(y, m - 1, d, h, mi, s);
  }
  return new Date(t);
}

export function parseZeit(text: string): string | null {
  const s = text.trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) { const d = berlinLokal(+m[3], +m[2], +m[1], +m[4], +m[5], +(m[6] || 0)); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (m) {
    if (m[8]) { const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}${m[8] === 'Z' ? 'Z' : m[8].length === 5 ? m[8].slice(0, 3) + ':' + m[8].slice(3) : m[8]}`); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
    const d = berlinLokal(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)); return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

const zahl = (s: string) => Number(s.trim().replace(',', '.'));
function teileZeile(zeile: string, trenner: string): string[] {
  const out: string[] = []; let cur = '', q = false;
  for (const ch of zeile) { if (ch === '"') q = !q; else if (ch === trenner && !q) { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out.map(x => x.trim());
}
const SPALTEN = {
  zeit: ['zeit', 'zeitpunkt', 'zeitstempel', 'timestamp', 'datetime', 'datum/zeit', 'datum und zeit', 'datum zeit'],
  datum: ['datum', 'date'], uhrzeit: ['uhrzeit', 'time'],
  kennzeichen: ['kennzeichen', 'fahrzeug', 'plate', 'license_plate', 'licenseplate', 'kfz', 'amtliches kennzeichen'],
  lat: ['lat', 'latitude', 'breite', 'breitengrad'], lng: ['lng', 'lon', 'long', 'longitude', 'länge', 'laenge', 'laengengrad', 'längengrad'],
};

/** Liest eine CSV-Datei mit Kopfzeile (Trenner ; oder ,). Erkennt die Spalten an gängigen deutschen und englischen Namen. */
export function csvZuPositionen(csv: string): CsvErgebnis {
  const zeilen = csv.replace(/^﻿/, '').split(/\r?\n/).filter(z => z.trim() !== '');
  if (zeilen.length < 2) return { positionen: [], ungueltig: 0, fehler: 'Die Datei enthält keine Datenzeilen.' };
  const trenner = (zeilen[0].match(/;/g) || []).length >= (zeilen[0].match(/,/g) || []).length ? ';' : ',';
  const kopf = teileZeile(zeilen[0], trenner).map(k => k.toLowerCase());
  const idx = (namen: string[]) => kopf.findIndex(k => namen.includes(k));
  const iKz = idx(SPALTEN.kennzeichen), iLat = idx(SPALTEN.lat), iLng = idx(SPALTEN.lng);
  let iZeit = idx(SPALTEN.zeit); const iDatum = idx(SPALTEN.datum), iUhr = idx(SPALTEN.uhrzeit);
  const getrennt = iZeit < 0 && iDatum >= 0 && iUhr >= 0;
  if (iZeit < 0 && !getrennt) iZeit = idx(['time']);
  const fehlend = [iKz < 0 && 'Kennzeichen', iLat < 0 && 'Breitengrad (lat)', iLng < 0 && 'Längengrad (lng)', iZeit < 0 && !getrennt && 'Zeit'].filter(Boolean);
  if (fehlend.length) return { positionen: [], ungueltig: 0, fehler: `Spalten nicht gefunden: ${fehlend.join(', ')}. Erwartet werden Spalten wie Zeit, Kennzeichen, lat, lng.` };
  const positionen: CsvPosition[] = []; let ungueltig = 0;
  for (const z of zeilen.slice(1)) {
    const f = teileZeile(z, trenner);
    const t = parseZeit(getrennt ? `${f[iDatum] ?? ''} ${f[iUhr] ?? ''}` : (f[iZeit] ?? ''));
    const lat = zahl(f[iLat] ?? ''), lng = zahl(f[iLng] ?? ''), kz = normKennzeichen(f[iKz] ?? '');
    if (!t || !kz || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) { ungueltig++; continue; }
    positionen.push({ kennzeichen: kz, t, lat, lng });
  }
  return { positionen, ungueltig };
}
