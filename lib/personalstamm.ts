// ============================================================
// SCAFFOLD OS – Personalstamm: Prüfung und Aufbereitung der Eingaben
// Geprüft wird nur das Format. Ob eine Nummer wirklich existiert (SV-Nummer, Steuer-ID), kann das System nicht wissen.
// ============================================================

export const KONFESSIONEN = [
  { value: 'keine', label: 'keine / nicht kirchensteuerpflichtig' },
  { value: 'ev', label: 'evangelisch (ev)' },
  { value: 'rk', label: 'römisch-katholisch (rk)' },
  { value: 'sonstige', label: 'sonstige' },
] as const;

export const BESCHAEFTIGUNGSARTEN = [
  { value: 'vollzeit', label: 'Vollzeit' },
  { value: 'teilzeit', label: 'Teilzeit' },
  { value: 'minijob', label: 'Minijob' },
  { value: 'aushilfe', label: 'Aushilfe' },
  { value: 'azubi', label: 'Auszubildender' },
] as const;

export interface PersonalEingabe {
  geburtsname?: unknown; geburtsdatum?: unknown; geburtsort?: unknown; staatsangehoerigkeit?: unknown;
  strasse?: unknown; plz?: unknown; ort?: unknown; telefon_privat?: unknown;
  notfall_name?: unknown; notfall_telefon?: unknown;
  sv_nummer?: unknown; steuer_id?: unknown; steuerklasse?: unknown; kinderfreibetraege?: unknown;
  konfession?: unknown; krankenkasse?: unknown; iban?: unknown; bic?: unknown;
  eintrittsdatum?: unknown; austrittsdatum?: unknown; beschaeftigungsart?: unknown;
  taetigkeit?: unknown; notiz?: unknown;
}

export interface PersonalDaten {
  geburtsname: string | null; geburtsdatum: string | null; geburtsort: string | null; staatsangehoerigkeit: string | null;
  strasse: string | null; plz: string | null; ort: string | null; telefon_privat: string | null;
  notfall_name: string | null; notfall_telefon: string | null;
  sv_nummer: string | null; steuer_id: string | null; steuerklasse: number | null; kinderfreibetraege: number | null;
  konfession: string | null; krankenkasse: string | null; iban: string | null; bic: string | null;
  eintrittsdatum: string | null; austrittsdatum: string | null; beschaeftigungsart: string | null;
  taetigkeit: string | null; notiz: string | null;
}

const leer = (v: unknown) => v === undefined || v === null || String(v).trim() === '';
const text = (v: unknown, max: number): string | null => (leer(v) ? null : String(v).trim().slice(0, max));

/** ISO-Datum JJJJ-MM-TT, echtes Kalenderdatum. */
export function istIsoDatum(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** IBAN-Prüfsumme (Modulo 97) nach ISO 13616. */
export function istGueltigeIban(iban: string): boolean {
  const s = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  if (s.startsWith('DE') && s.length !== 22) return false;
  const umgestellt = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const ch of umgestellt) {
    const wert = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const z of wert) rest = (rest * 10 + Number(z)) % 97;
  }
  return rest === 1;
}

export function formatiereIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
}

export type PersonalErgebnis = { ok: true; daten: PersonalDaten } | { ok: false; fehler: string };

/** Prüft die Eingaben und liefert bereinigte Werte. Leere Felder werden zu null. */
export function pruefePersonalEingabe(e: PersonalEingabe): PersonalErgebnis {
  const daten: Partial<PersonalDaten> = {};
  for (const [feld, name] of [['geburtsdatum', 'Geburtsdatum'], ['eintrittsdatum', 'Eintrittsdatum'], ['austrittsdatum', 'Austrittsdatum']] as const) {
    const v = (e as Record<string, unknown>)[feld];
    if (leer(v)) { daten[feld] = null; continue; }
    const s = String(v).trim();
    if (!istIsoDatum(s)) return { ok: false, fehler: `${name} ist kein gültiges Datum.` };
    daten[feld] = s;
  }
  if (daten.geburtsdatum && daten.geburtsdatum > new Date().toISOString().slice(0, 10)) return { ok: false, fehler: 'Das Geburtsdatum liegt in der Zukunft.' };
  if (daten.eintrittsdatum && daten.austrittsdatum && daten.austrittsdatum < daten.eintrittsdatum) return { ok: false, fehler: 'Das Austrittsdatum liegt vor dem Eintrittsdatum.' };

  daten.geburtsname = text(e.geburtsname, 80);
  daten.geburtsort = text(e.geburtsort, 80);
  daten.staatsangehoerigkeit = text(e.staatsangehoerigkeit, 60);
  daten.strasse = text(e.strasse, 120);
  daten.ort = text(e.ort, 80);
  daten.telefon_privat = text(e.telefon_privat, 40);
  daten.notfall_name = text(e.notfall_name, 80);
  daten.notfall_telefon = text(e.notfall_telefon, 40);
  daten.krankenkasse = text(e.krankenkasse, 80);
  daten.taetigkeit = text(e.taetigkeit, 80);
  daten.notiz = text(e.notiz, 1000);

  if (leer(e.plz)) daten.plz = null;
  else {
    const plz = String(e.plz).trim();
    if (!/^\d{5}$/.test(plz)) return { ok: false, fehler: 'Die Postleitzahl muss aus 5 Ziffern bestehen.' };
    daten.plz = plz;
  }

  if (leer(e.sv_nummer)) daten.sv_nummer = null;
  else {
    const sv = String(e.sv_nummer).replace(/\s+/g, '').toUpperCase();
    // 12 Zeichen: 2 Ziffern Bereich, 6 Ziffern Geburtsdatum, 1 Buchstabe, 2 Ziffern Serie, 1 Prüfziffer
    if (!/^\d{8}[A-Z]\d{3}$/.test(sv)) return { ok: false, fehler: 'Die Sozialversicherungsnummer hat 12 Zeichen (z. B. 12 010190 A 123): 8 Ziffern, 1 Buchstabe, 3 Ziffern.' };
    daten.sv_nummer = sv;
  }

  if (leer(e.steuer_id)) daten.steuer_id = null;
  else {
    const id = String(e.steuer_id).replace(/\s+/g, '');
    if (!/^[1-9]\d{10}$/.test(id)) return { ok: false, fehler: 'Die Steuer-ID (Identifikationsnummer) hat 11 Ziffern und beginnt nicht mit 0.' };
    daten.steuer_id = id;
  }

  if (leer(e.steuerklasse)) daten.steuerklasse = null;
  else {
    const k = Number(e.steuerklasse);
    if (!Number.isInteger(k) || k < 1 || k > 6) return { ok: false, fehler: 'Die Steuerklasse muss zwischen 1 und 6 liegen.' };
    daten.steuerklasse = k;
  }

  if (leer(e.kinderfreibetraege)) daten.kinderfreibetraege = null;
  else {
    const z = Number(String(e.kinderfreibetraege).replace(',', '.'));
    if (!Number.isFinite(z) || z < 0 || z > 20 || Math.round(z * 2) !== z * 2) return { ok: false, fehler: 'Kinderfreibeträge: Zahl in 0,5er-Schritten (z. B. 0 oder 1,5).' };
    daten.kinderfreibetraege = z;
  }

  if (leer(e.konfession)) daten.konfession = null;
  else {
    const k = String(e.konfession);
    if (!KONFESSIONEN.some(x => x.value === k)) return { ok: false, fehler: 'Unbekannte Konfession.' };
    daten.konfession = k;
  }

  if (leer(e.beschaeftigungsart)) daten.beschaeftigungsart = null;
  else {
    const b = String(e.beschaeftigungsart);
    if (!BESCHAEFTIGUNGSARTEN.some(x => x.value === b)) return { ok: false, fehler: 'Unbekannte Beschäftigungsart.' };
    daten.beschaeftigungsart = b;
  }

  if (leer(e.iban)) daten.iban = null;
  else {
    if (!istGueltigeIban(String(e.iban))) return { ok: false, fehler: 'Die IBAN ist nicht gültig (Prüfsumme stimmt nicht).' };
    daten.iban = String(e.iban).replace(/\s+/g, '').toUpperCase();
  }
  if (leer(e.bic)) daten.bic = null;
  else {
    const bic = String(e.bic).replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) return { ok: false, fehler: 'Der BIC hat 8 oder 11 Zeichen.' };
    daten.bic = bic;
  }

  return { ok: true, daten: daten as PersonalDaten };
}
