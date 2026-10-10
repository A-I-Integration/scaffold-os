// ============================================================
// SCAFFOLD OS – Gerüsttypen (zentrale Liste) + Auswahl "was bieten wir an"
//
// Ein Betrieb legt im Firmenprofil (Einstellungen) fest, welche Gerüsttypen
// er anbietet. Das Aufmaß (Schritt 3) zeigt dann nur diese Typen an.
// Leere/fehlende Auswahl = ALLE Typen (Verhalten wie bisher).
// ============================================================

export interface Geruesttyp {
  id: string;
  name: string;
  icon: string;
  desc: string;
}

export const ALLE_GERUESTTYPEN: Geruesttyp[] = [
  { id: 'fassade', name: 'Fassadengerüst', icon: '🏢', desc: 'Standard für Maler & WDVS' },
  { id: 'fahr', name: 'Fahrgerüst', icon: '🚧', desc: 'Rollbar, für große Flächen' },
  { id: 'trag', name: 'Traggerüst', icon: '⚒️', desc: 'Überbrückung, hohe Lasten' },
  { id: 'dach', name: 'Dachgerüst', icon: '🏠', desc: 'Dacharbeiten & Schornstein' },
  { id: 'raum', name: 'Raumgerüst', icon: '📦', desc: 'Innenräume, Hallen' },
  { id: 'haenge', name: 'Hängegerüst', icon: '⛓️', desc: 'Fassade ohne Bodenkontakt' },
  { id: 'arbeit', name: 'Arbeitsgerüst', icon: '🪜', desc: 'Allgemeines Arbeitsgerüst' },
  { id: 'schutz', name: 'Schutzgerüst', icon: '🛡️', desc: 'Fang-/Schutzgerüst, Schutzdach' },
  { id: 'einhausung', name: 'Einhausung', icon: '🏗️', desc: 'Plane/Folie – Preis über Festpreis/m² (Schritt 6)' },
  { id: 'wetterschutz', name: 'Wetterschutzdach', icon: '⛱️', desc: 'Dach über dem Gerüst – Preis über Festpreis/m² (Schritt 6)' },
];

/** Liest die gespeicherte Auswahl; null = keine Einschränkung (alle Typen). */
export function leseAngeboteneTypen(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const bekannt = new Set(ALLE_GERUESTTYPEN.map((t) => t.id));
  const ids = raw.filter((x): x is string => typeof x === 'string' && bekannt.has(x));
  return ids.length > 0 ? ids : null;
}

/**
 * Typen, die im Aufmaß zur Auswahl stehen. Bereits gewählte Typen
 * (`immerEnthalten`, z. B. aus einem bestehenden Projekt) bleiben sichtbar,
 * auch wenn der Betrieb sie inzwischen abgewählt hat.
 */
export function sichtbareGeruesttypen(angeboten: string[] | null, immerEnthalten: string[] = []): Geruesttyp[] {
  if (!angeboten) return ALLE_GERUESTTYPEN;
  const erlaubt = new Set([...angeboten, ...immerEnthalten.filter(Boolean)]);
  return ALLE_GERUESTTYPEN.filter((t) => erlaubt.has(t.id));
}
