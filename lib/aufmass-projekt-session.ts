// ============================================================
// SCAFFOLD OS – Gemeinsame Sitzungs-Logik für den Aufmaß-Assistenten
// (Phase 56)
//
// War vorher in allen 6 Schritt-Dateien fast identisch dupliziert –
// genau das Risiko, dass sie irgendwo vergessen oder leicht falsch
// kopiert wird (wie beim ursprünglichen Bug: Schritt 6 fehlte die
// Absicherung komplett). Jetzt eine einzige, getestete Quelle.
//
// Entscheidet: Muss beim Betreten eines Schritts mit ?id=... frisch
// von der Datenbank geladen werden (neues/anderes Projekt), oder
// reicht der Zwischenspeicher (gleiche Bearbeitungs-Sitzung, eigene
// frische Änderungen nicht überschreiben)?
// ============================================================

const MARKER_KEY = 'scaffold_editing_project_id';

/**
 * Reine Entscheidungslogik, ohne localStorage-Zugriff – dadurch ohne
 * Browser-Umgebung testbar.
 */
export function sollFrischGeladenWerden(projectId: string | null, zuletztBearbeitetesProjekt: string | null): boolean {
  if (!projectId) return false; // kein Projekt geöffnet (neues Aufmaß) – nichts zu laden
  return zuletztBearbeitetesProjekt !== projectId;
}

/** Liest die aktuelle Markierung (welches Projekt zuletzt bearbeitet wurde). */
export function leseMarkierung(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(MARKER_KEY);
}

/** Markiert ein Projekt als "gerade in Bearbeitung". */
export function setzeMarkierung(projectId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MARKER_KEY, projectId);
}

/** Nach erfolgreichem Speichern: Markierung entfernen, damit ein
 * späteres erneutes Öffnen wieder korrekt frisch von der Datenbank lädt. */
export function schliesseSitzungAb() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(MARKER_KEY);
}
