// Gebäudeteile aus dem LiDAR-Scan → Vorschläge für Aufmaß Schritt 2 (Traufhöhe, Dachform, Garage/Nebengebäude).
// Alles nur Vorschläge: Die Felder bleiben änderbar, der Hinweis im Formular fordert zum Prüfen auf.

export type LidarTeilEingabe = { typ?: string; laengeM?: number; tiefeM?: number; traufhoeheM?: number; dachForm?: string; dachHoeheM?: number; versatzM?: number };

export interface TeileVorbelegung {
  traufhoehe: string; // '' = unbekannt
  dachform: '' | 'Satteldach' | 'Flachdach' | 'Walmdach';
  garagen: boolean;
  /** Haupthaus: längere Seite / kürzere Seite in m ('' = unbekannt) */
  laenge: string;
  breite: string;
  hinweis: string;
}

const DACH: Record<string, TeileVorbelegung['dachform']> = { satteldach: 'Satteldach', flachdach: 'Flachdach', walmdach: 'Walmdach' };
const ok = (n: unknown): n is number => typeof n === 'number' && isFinite(n) && n > 0;
const komma = (n: number) => n.toFixed(1).replace('.', ',');

/** Hauptgebäude = das größte Teil (Grundfläche); weitere Teile gelten als Nebengebäude/Anbau. */
export function teileVorbelegung(teile: unknown): TeileVorbelegung | null {
  if (!Array.isArray(teile) || teile.length === 0) return null;
  const liste = (teile as LidarTeilEingabe[]).filter((t) => t && ok(t.traufhoeheM));
  if (liste.length === 0) return null;
  const flaeche = (t: LidarTeilEingabe) => (ok(t.laengeM) && ok(t.tiefeM) ? t.laengeM * t.tiefeM : 0);
  const sortiert = [...liste].sort((a, b) => flaeche(b) - flaeche(a));
  const haupt = sortiert[0];
  const weitere = sortiert.slice(1);
  const dach = DACH[String(haupt.dachForm)] ?? '';
  const teile2 = weitere.map((t) => `${komma(t.laengeM ?? 0)} × ${komma(t.tiefeM ?? 0)} m, ${komma(t.traufhoeheM ?? 0)} m hoch`);
  const hinweis =
    `Aus dem Scan erkannt: Haupthaus ${komma(haupt.laengeM ?? 0)} × ${komma(haupt.tiefeM ?? 0)} m, Traufhöhe ${komma(haupt.traufhoeheM as number)} m` +
    (dach ? `, ${dach} (Dachhöhe ${komma(haupt.dachHoeheM ?? 0)} m)` : '') +
    (teile2.length ? `; Nebengebäude: ${teile2.join('; ')}` : '') +
    '. Die Dachform wird aus Punkten geschätzt – bitte prüfen.';
  const a = ok(haupt.laengeM) ? haupt.laengeM : 0, b = ok(haupt.tiefeM) ? haupt.tiefeM : 0;
  const lang = a && b ? Math.max(a, b) : 0, kurz = a && b ? Math.min(a, b) : 0;
  return {
    traufhoehe: (haupt.traufhoeheM as number).toFixed(2), dachform: dach, garagen: weitere.length > 0,
    laenge: lang ? lang.toFixed(2) : '', breite: kurz ? kurz.toFixed(2) : '', hinweis,
  };
}
