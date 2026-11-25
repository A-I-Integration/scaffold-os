// ============================================================
// SCAFFOLD OS – Land von Kunde und Baustelle
// Leer oder „Deutschland“ = Inland. Das Land steht in der Anschrift auf Angebot und Rechnung (außer bei Deutschland)
// und schlägt bei einer Baustelle in Luxemburg den Steuersatz 17 % TVA vor.
// ============================================================

export const STANDARD_LAND = 'Deutschland';
export const LAENDER_VORSCHLAG = ['Deutschland', 'Österreich', 'Schweiz', 'Niederlande', 'Belgien', 'Luxemburg', 'Frankreich', 'Polen', 'Tschechien', 'Dänemark', 'Bulgarien'];

/** Bereinigt die Eingabe: leer = nicht gesetzt (null), höchstens 60 Zeichen, keine spitzen Klammern oder Anführungszeichen. */
export function pruefeLand(roh: unknown): { ok: true; land: string | null } | { ok: false; fehler: string } {
  if (roh === null || roh === undefined) return { ok: true, land: null };
  const s = String(roh).trim().replace(/\s+/g, ' ');
  if (!s) return { ok: true, land: null };
  if (s.length > 60) return { ok: false, fehler: 'Das Land ist zu lang (höchstens 60 Zeichen).' };
  if (/[<>"]/.test(s)) return { ok: false, fehler: 'Das Land enthält ungültige Zeichen.' };
  return { ok: true, land: s };
}

export const landOderStandard = (land: string | null | undefined): string => (land || '').trim() || STANDARD_LAND;
export const istInland = (land: string | null | undefined): boolean => landOderStandard(land).toLowerCase() === STANDARD_LAND.toLowerCase();
export const istLuxemburg = (land: string | null | undefined): boolean => ['luxemburg', 'luxembourg', 'lu'].includes((land || '').trim().toLowerCase());

/** Anschrift in einer Zeile: „Straße, PLZ Ort“; bei Auslandskunden mit Land am Ende. */
export function kundenAnschrift(k: { street?: string | null; zip?: string | null; city?: string | null; land?: string | null } | null | undefined): string {
  if (!k) return '';
  const ort = [k.zip, k.city].filter(Boolean).join(' ');
  return [k.street, ort, istInland(k.land) ? '' : landOderStandard(k.land)].filter((t) => t && String(t).trim()).join(', ');
}

/** Hängt das Land an eine fertige Adresse (z. B. Baustellenadresse) an, wenn es nicht Deutschland ist und noch nicht darin steht. */
export function adresseMitLand(adresse: string | null | undefined, land: string | null | undefined): string {
  const a = (adresse || '').trim();
  if (istInland(land)) return a;
  const l = landOderStandard(land);
  if (a.toLowerCase().includes(l.toLowerCase())) return a;
  return a ? `${a}, ${l}` : l;
}

export interface SteuerVorschlag { taxRate: number; steuerfall: 'lu_tva'; text: string }
/** Steuervorschlag für Leistungen auf einer Baustelle in diesem Land (derzeit nur Luxemburg: 17 % TVA). */
export function steuerVorschlagFuerBaustelle(land: string | null | undefined): SteuerVorschlag | null {
  return istLuxemburg(land) ? { taxRate: 17, steuerfall: 'lu_tva', text: 'Baustelle in Luxemburg: 17 % TVA vorgeschlagen. Bitte mit dem Steuerberater abstimmen.' } : null;
}
