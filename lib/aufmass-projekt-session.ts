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

// Alle localStorage-Schlüssel, die ein Aufmaß-Durchlauf (Schritt 1–6)
// im Browser ablegt. War vorher nur in schritt1/page.tsx dupliziert und
// dort auch unvollständig (scaffold_lidar_scan_name/-fresh fehlten) –
// zentral hier, damit jede Stelle, die "alles vom Aufmaß löschen" meint,
// wirklich alles löscht (Bug: nach dem Speichern eines Projekts blieben
// scaffold_step1–5 im Browser stehen und ein direkt danach gestartetes
// NEUES Aufmaß zeigte die alten Daten des vorherigen Projekts an).
export const WIZARD_KEYS = [
  'scaffold_step1',
  'scaffold_step2',
  'scaffold_step3',
  'scaffold_step4',
  'scaffold_step5',
  'scaffold_step6',
  'scaffold_lidar_measurements',
  'scaffold_lidar_scan_name',
  'scaffold_lidar_fresh',
  'scaffold_foto_daten',
  'scaffold_foto_analyse',
  'scaffold_grundriss_daten',
  'scaffold_grundriss_analyse',
  'scaffold_grundriss_fresh',
];

/** Entfernt alle oben gelisteten Aufmaß-Zwischenspeicher aus dem Browser. */
export function loescheWizardDaten() {
  if (typeof window === 'undefined') return;
  WIZARD_KEYS.forEach((k) => localStorage.removeItem(k));
}

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

// FIX (Bug-Report: "wenn ich es neu mache soll die Seite immer leer sein"):
// Vorher landete "Neues Aufmaß" (Dashboard/Meine-Touren, kein ?id= in der
// URL) einfach auf Schritt 1 – die Seite las dann unbedingt den noch
// vorhandenen Zwischenspeicher (scaffold_step1 etc.) eines VORHERIGEN,
// nie gespeicherten Aufmaßes und zeigte dessen alte Werte/Dateien wieder
// an, obwohl der Nutzer bewusst neu beginnen wollte. Bisher gab es diesen
// Reset nur im Notfall-Button "Neu beginnen" in Schritt 1 selbst. Jetzt:
// dieselbe, bereits bewährte Logik zentral, damit jeder "Neues Aufmaß"-
// Einstieg sie nutzen kann.
/** Löscht alle Aufmaß-Zwischenspeicher und erzeugt eine frische Session-ID
 * für Datei-Uploads – für den bewussten Einstieg in ein NEUES Aufmaß. */
export function starteNeuesAufmass() {
  if (typeof window === 'undefined') return;
  loescheWizardDaten();
  localStorage.removeItem('scaffold_session_id');
  localStorage.removeItem(MARKER_KEY);
}
