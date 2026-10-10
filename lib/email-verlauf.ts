// ============================================================
// SCAFFOLD OS – E-Mail-Verlauf: kleine reine Hilfsfunktionen
// ============================================================

/**
 * Entfernt den unsichtbaren Öffnungs-Pixel aus gespeichertem Mail-HTML.
 * Ohne das würde das bloße ANSEHEN der Mail im Verlauf als "Kunde hat
 * geöffnet" gezählt (der Pixel zeigt auf /api/track/open).
 */
export function entferneTrackingPixel(html: string): string {
  return String(html || '').replace(/<img[^>]*api\/track\/open[^>]*>/gi, '');
}

export function istGueltigeEmail(s: string): boolean {
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(String(s || '').trim());
}
