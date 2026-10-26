// Vom LiDAR-Scan erkannte Wände → Auswahlliste für Abschnitte in Schritt 2.
// Ebene 1 ist die Hauptfassade (steht oben in Länge/Höhe), ab Ebene 2 wird
// angeboten, was als zusätzlicher Abschnitt übernommen werden soll.

export type LidarEbene = { breiteM?: number; hoeheM?: number };
export type EbenenVorschlag = { bezeichnung: string; laenge: string; hoehe: string; aktiv: boolean };

const zwei = (n?: number): string => (typeof n === 'number' && isFinite(n) && n > 0 ? n.toFixed(2) : '');

/** `vorausgewaehlt` false: Wände sind angeboten, aber nicht angehakt (z. B. wenn der Scan schon Gebäudeteile liefert – sonst würden Wände doppelt gezählt). */
export function ebenenZuVorschlaegen(ebenen: unknown, vorausgewaehlt = true): EbenenVorschlag[] {
  if (!Array.isArray(ebenen)) return [];
  return (ebenen as LidarEbene[]).slice(1).map((e, i) => ({
    bezeichnung: `Ebene ${i + 2}`,
    laenge: zwei(e?.breiteM),
    hoehe: zwei(e?.hoeheM),
    aktiv: vorausgewaehlt,
  }));
}

/** Erkennungsmerkmal eines Scans – merkt, ob der Nutzer ihn schon entschieden hat. */
export function ebenenSignatur(ebenen: unknown): string {
  if (!Array.isArray(ebenen)) return '';
  return (ebenen as LidarEbene[]).map((e) => `${zwei(e?.breiteM)}x${zwei(e?.hoeheM)}`).join('|');
}

/** Fläche aus Eingabefeldern (Komma oder Punkt); 0, wenn etwas fehlt oder ungültig ist. */
export function flaecheM2(laenge: string, hoehe: string): number {
  const l = parseFloat(String(laenge).replace(',', '.'));
  const h = parseFloat(String(hoehe).replace(',', '.'));
  return isFinite(l) && isFinite(h) && l > 0 && h > 0 ? l * h : 0;
}
