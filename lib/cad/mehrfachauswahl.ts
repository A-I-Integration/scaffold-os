// Mehrfachauswahl im CAD: Shift+Klick und Auswahlrahmen. Reine Logik, ohne 3D/Oberfläche.

/** Shift+Klick: das Bauteil kommt zur Auswahl dazu oder fällt heraus. Ist noch keine Mehrfachauswahl da, zählt das aktuell einzeln gewählte Bauteil mit. */
export function schalteAuswahl(auswahl: readonly string[], einzeln: string | null, id: string): string[] {
  const basis = auswahl.length > 0 ? [...auswahl] : einzeln ? [einzeln] : []
  return basis.includes(id) ? basis.filter((x) => x !== id) : [...basis, id]
}

/** Auswahlrahmen: Kennungen aller Punkte (Bildschirmkoordinaten), die im aufgezogenen Rechteck liegen. Die Ecken dürfen in beliebiger Reihenfolge stehen. */
export function idsImRahmen(punkte: readonly { id: string; x: number; y: number }[], a: { x: number; y: number }, b: { x: number; y: number }): string[] {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y)
  return punkte.filter((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1).map((p) => p.id)
}

/** Auswahlrahmen mit gedrückter Shift-Taste ergänzt die bisherige Auswahl, sonst ersetzt er sie. Reihenfolge bleibt stabil, keine Doppelten. */
export function rahmenErgebnis(bisher: readonly string[], neu: readonly string[], ergaenzen: boolean): string[] {
  return ergaenzen ? [...bisher, ...neu.filter((x) => !bisher.includes(x))] : [...neu]
}

/** Zu kleiner Rahmen (versehentliches Klicken) zählt nicht als Auswahlrahmen. */
export function istEchterRahmen(a: { x: number; y: number }, b: { x: number; y: number }, mindestPx = 6): boolean {
  return Math.abs(a.x - b.x) >= mindestPx && Math.abs(a.y - b.y) >= mindestPx
}
