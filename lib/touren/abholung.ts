// ============================================================
// SCAFFOLD OS – Abholfahrt (Abbau beim Kunden)
//
// Eine Abholfahrt ist eine Tour mit einem Stopp OHNE Transportauftrag. Erkannt
// wird sie an der Notiz des Stopps (tour_stops.notes): erste Zeile "ABHOLUNG",
// danach je Zeile "<Menge>× <Artikel>" (laut Lager: was vor Ort ist).
// Kein SQL nötig. Die Rücklauf-Buchung (was kommt intakt zurück, was fehlt)
// bleibt unverändert im Lager (Abbau / Rücklauf).
// ============================================================

export const ABHOL_MARKER = 'ABHOLUNG';

export interface AbholZeile { name: string; quantity: number }

export function baueAbholNotiz(zeilen: AbholZeile[]): string {
  return [ABHOL_MARKER, ...zeilen.map((z) => `${z.quantity}× ${z.name}`)].join('\n');
}

export function leseAbholNotiz(notes: string | null | undefined): { istAbholung: boolean; material: AbholZeile[] } {
  const zeilen = String(notes ?? '').split('\n').map((z) => z.trim());
  if (zeilen[0] !== ABHOL_MARKER) return { istAbholung: false, material: [] };
  const material: AbholZeile[] = [];
  for (const z of zeilen.slice(1)) {
    const m = /^(\d+)×\s*(.+)$/.exec(z);
    if (m) material.push({ name: m[2], quantity: Number(m[1]) });
  }
  return { istAbholung: true, material };
}
