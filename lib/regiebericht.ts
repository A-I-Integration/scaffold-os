// ============================================================
// SCAFFOLD OS – Regie-/Rapportbericht (Paket 10)
// Reine Logik: Bereinigen, Summen, Status, Positionen für die Rechnung. Ohne Datenbank, ohne Browser.
// Ein Regiebericht gilt als Nachweis (Stunden je Mitarbeiter, Material, Fotos, Unterschrift des Bauherrn)
// und wird auf Wunsch als Positionen in eine Rechnung übernommen. Abgerechnet = einer Rechnung zugeordnet.
// ============================================================

export type RegieStatus = 'entwurf' | 'unterschrieben' | 'versendet' | 'zurueck';
export const REGIE_STATUS: RegieStatus[] = ['entwurf', 'unterschrieben', 'versendet', 'zurueck'];
export const REGIE_STATUS_LABEL: Record<RegieStatus, string> = {
  entwurf: 'Entwurf', unterschrieben: 'Unterschrieben', versendet: 'Zur Unterschrift versendet', zurueck: 'Unterschrieben zurück',
};

export interface RegieStunde { name: string; stunden: number; satz: number }
export interface RegieMaterial { bezeichnung: string; menge: number; einheit: string; einzelpreis: number }

export const MAX_FOTOS = 6;
export const MAX_FOTO_ZEICHEN = 400_000; // ca. 300 KB je Bild als data-URL (Browser verkleinert vorher)
export const MAX_UNTERSCHRIFT_ZEICHEN = 300_000;

const runde2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const zahl0 = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function normStunden(roh: unknown): RegieStunde[] {
  if (!Array.isArray(roh)) return [];
  return roh.map((z: any) => ({ name: text(z?.name, 80), stunden: runde2(zahl0(z?.stunden)), satz: runde2(zahl0(z?.satz)) }))
    .filter((z) => z.name || z.stunden > 0);
}
export function normMaterial(roh: unknown): RegieMaterial[] {
  if (!Array.isArray(roh)) return [];
  return roh.map((z: any) => ({ bezeichnung: text(z?.bezeichnung, 160), menge: zahl0(z?.menge), einheit: text(z?.einheit, 12) || 'Stk.', einzelpreis: runde2(zahl0(z?.einzelpreis)) }))
    .filter((z) => z.bezeichnung || z.menge > 0);
}
export function normFotos(roh: unknown): string[] {
  if (!Array.isArray(roh)) return [];
  return roh.filter((f): f is string => typeof f === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(f) && f.length <= MAX_FOTO_ZEICHEN).slice(0, MAX_FOTOS);
}

export const summeStunden = (s: RegieStunde[]): number => runde2(s.reduce((a, z) => a + z.stunden, 0));
export const betragStunden = (s: RegieStunde[]): number => runde2(s.reduce((a, z) => a + z.stunden * z.satz, 0));
export const betragMaterial = (m: RegieMaterial[]): number => runde2(m.reduce((a, z) => a + z.menge * z.einzelpreis, 0));
export const betragGesamt = (r: { stunden: RegieStunde[]; material: RegieMaterial[] }): number => runde2(betragStunden(r.stunden) + betragMaterial(r.material));

/** Hinweise vor dem Speichern (blockieren nicht, werden angezeigt). */
export function regieHinweise(r: { stunden: RegieStunde[]; material: RegieMaterial[]; beschreibung?: string | null; anlass?: string | null }): string[] {
  const h: string[] = [];
  if (!r.stunden.length && !r.material.length) h.push('Weder Stunden noch Material eingetragen.');
  if (r.stunden.some((z) => !z.name)) h.push('Bei einer Stundenzeile fehlt der Name des Mitarbeiters.');
  if (r.stunden.some((z) => z.stunden > 0 && !(z.satz > 0))) h.push('Bei Stunden fehlt der Stundensatz: sie lassen sich so nicht abrechnen.');
  if (r.material.some((z) => z.bezeichnung && !(z.einzelpreis > 0))) h.push('Bei Material fehlt der Preis: es lässt sich so nicht abrechnen.');
  if (!text(r.beschreibung, 4000) && !text(r.anlass, 200)) h.push('Beschreibung oder Anlass fehlt.');
  return h;
}

export interface RegieZeileRechnung { bezeichnung: string; menge: number; einheit: string; einzelpreis: number }

/** Positionen für die Rechnung: je Mitarbeiter eine Stundenzeile, je Material eine Zeile. Zeilen ohne Preis werden nicht übernommen (melden). */
export function regieAlsPositionen(r: { nummer: string; datum: string; anlass?: string | null; stunden: RegieStunde[]; material: RegieMaterial[] }): { positionen: RegieZeileRechnung[]; ohnePreis: string[] } {
  const kopf = `Regiebericht ${r.nummer} vom ${r.datum.split('-').reverse().join('.')}`;
  const positionen: RegieZeileRechnung[] = [];
  const ohnePreis: string[] = [];
  for (const z of r.stunden) {
    if (!(z.stunden > 0)) continue;
    if (!(z.satz > 0)) { ohnePreis.push(`${z.name || 'Stunden'} (${kopf})`); continue; }
    positionen.push({ bezeichnung: `${kopf}: Stunden ${z.name || 'Mitarbeiter'}${r.anlass ? ` – ${r.anlass}` : ''}`, menge: z.stunden, einheit: 'Std.', einzelpreis: z.satz });
  }
  for (const m of r.material) {
    if (!(m.menge > 0)) continue;
    if (!(m.einzelpreis > 0)) { ohnePreis.push(`${m.bezeichnung} (${kopf})`); continue; }
    positionen.push({ bezeichnung: `${kopf}: ${m.bezeichnung}`, menge: m.menge, einheit: m.einheit, einzelpreis: m.einzelpreis });
  }
  return { positionen, ohnePreis };
}

export const istAbgerechnet = (r: { rechnung_id?: string | null }): boolean => !!r.rechnung_id;

/** Nächste Nummer RB-JJJJ-NNNN aus den vorhandenen Nummern des Jahres. */
export function naechsteNummer(vorhanden: string[], jahr: number): string {
  const re = new RegExp(`^RB-${jahr}-(\\d{4,})$`);
  const max = vorhanden.reduce((m, n) => { const x = re.exec(n); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `RB-${jahr}-${String(max + 1).padStart(4, '0')}`;
}

/** Preise für Rollen ohne Preissicht entfernen (Mitarbeiter). */
export function ohnePreise<T extends { stunden: RegieStunde[]; material: RegieMaterial[] }>(r: T): T {
  return { ...r, stunden: r.stunden.map((z) => ({ ...z, satz: 0 })), material: r.material.map((m) => ({ ...m, einzelpreis: 0 })) };
}

/** Beim Speichern durch eine Rolle ohne Preissicht die Preise des gespeicherten Stands behalten (Zuordnung nach Position und Name). */
export function preiseUebernehmen(neu: { stunden: RegieStunde[]; material: RegieMaterial[] }, alt: { stunden: RegieStunde[]; material: RegieMaterial[] }) {
  return {
    stunden: neu.stunden.map((z, i) => ({ ...z, satz: alt.stunden[i] && alt.stunden[i].name === z.name ? alt.stunden[i].satz : 0 })),
    material: neu.material.map((m, i) => ({ ...m, einzelpreis: alt.material[i] && alt.material[i].bezeichnung === m.bezeichnung ? alt.material[i].einzelpreis : 0 })),
  };
}

export type Pruefung = { ok: true } | { ok: false; fehler: string };
/** Darf der Bericht noch geändert werden? Nach der Abrechnung nie; nach Unterschrift nur der Rücklauf-Status. */
export function aenderbar(r: Record<string, any>): Pruefung {
  if (r.rechnung_id) return { ok: false, fehler: 'Der Regiebericht ist bereits abgerechnet und kann nicht mehr geändert werden.' };
  if (r.status !== 'entwurf') return { ok: false, fehler: 'Ein unterschriebener oder versendeter Regiebericht kann nicht mehr geändert werden. Bitte einen neuen anlegen.' };
  return { ok: true };
}
