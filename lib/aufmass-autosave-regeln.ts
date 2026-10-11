// ============================================================
// SCAFFOLD OS – Auto-Speichern bei Bestandsprojekten (Aufmaß Schritt 1–5)
// Reine Regeln (ohne Browser/DB), von Client UND API genutzt.
//
// Bestandsprojekt = Aufmaß wird mit ?id= geöffnet. Beim "Weiter" wird nur
// data.stepN still gespeichert – OHNE Versionseintrag (Versionen entstehen
// weiter nur beim bewussten Speichern in Schritt 6) und nie bei
// abgeschlossenen Projekten.
// ============================================================

export const AUTOSAVE_SCHRITTE = ['step1', 'step2', 'step3', 'step4', 'step5'] as const;
export type AutosaveSchritt = (typeof AUTOSAVE_SCHRITTE)[number];

export const AUTOSAVE_PROJEKT_ABGESCHLOSSEN_FEHLER =
  'Das Projekt ist abgeschlossen – Änderungen werden nur beim bewussten Speichern in Schritt 6 übernommen.';

/** JSON mit sortierten Schlüsseln – gleicher Inhalt ergibt immer denselben Text. */
export function stabilJson(wert: unknown): string {
  const sortiere = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortiere);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return Object.keys(o).sort().reduce<Record<string, unknown>>((acc, k) => { acc[k] = sortiere(o[k]); return acc; }, {});
    }
    return v;
  };
  return JSON.stringify(sortiere(wert)) ?? 'null';
}

/** true, wenn der Schritt gespeichert werden muss (keine Basis oder Inhalt verändert). */
export function istSchrittGeaendert(basis: string | undefined, aktuell: unknown): boolean {
  return basis === undefined || basis !== stabilJson(aktuell);
}

/** Server: nur data.step1–step5 durchlassen, alles andere (angebotsStatus, entwurf, …) verwerfen. */
export function filtereAutosaveData(data: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  const d = data as Record<string, unknown>;
  for (const k of AUTOSAVE_SCHRITTE) {
    if (k in d && d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) out[k] = d[k];
  }
  return out;
}

/** Server: abgeschlossene Projekte werden vom Auto-Speichern nie verändert. */
export function autosaveGesperrt(projektStatus: string | null | undefined): boolean {
  return projektStatus === 'completed';
}
