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

// FIX (Bug-Report: "Gewerke wieder gelöscht"): Ältere Projekte speichern das
// Gewerk noch im alten Einzelfeld "gewerk" (string) statt im neuen
// Array-Feld "gewerke". Schritt 1 migriert das beim eigenen Laden inzwischen
// selbst (siehe dort) – aber jede andere Stelle, die step1 direkt aus der
// Datenbank liest (z.B. Schritt 6 oder die Kunden-Detailseite, dorthin führt
// z.B. "Aufmaß öffnen" DIREKT, ohne über Schritt 1 zu laufen), sah bei
// solchen Alt-Projekten weiterhin nur ein leeres "gewerke"-Array. Zentral,
// damit jede Anzeigestelle beide Formate versteht.
/** Liefert die Gewerke eines step1-Objekts – neues Array-Feld "gewerke",
 * mit Fallback auf das alte Einzelfeld "gewerk" für ältere Projekte. */
export function gewerkeVonStep1(step1: any): string[] {
  if (Array.isArray(step1?.gewerke) && step1.gewerke.length > 0) return step1.gewerke;
  if (step1?.gewerk) return [step1.gewerk];
  return [];
}

// FIX (Bug-Report: "Schritt 2 alle Daten raus" / "CAD-Datei komplett raus"):
// Ältere, über den CAD-Planer erzeugte Projekte (vor Phase 80) speichern
// KEIN step2/step3 – nur kiResult.building/systemId. Bisher konnte NUR
// Schritt 6 ("Phase 81") daraus step2/step3 ableiten; Schritt 1-3 zeigten
// beim Öffnen über Dashboard -> Schritt 1 komplett leere Felder, obwohl das
// Projekt echte CAD-Daten hat. Jetzt zentral, damit jeder Schritt dieselbe
// Ableitung nutzen kann ("verbinde es sinngemäß").
/** Leitet fehlendes step2/step3 aus einem gespeicherten CAD-kiResult ab
 * (building/systemId). Gibt nur die Felder zurück, die tatsächlich fehlen –
 * bereits vorhandene step2/step3-Daten werden NIE überschrieben. */
export function leiteStepsAusKiResultAb(
  steps: { step2?: any; step3?: any },
  savedKi: { building?: any; systemId?: string } | undefined | null
): { step2?: any; step3?: any } {
  const ergaenzung: { step2?: any; step3?: any } = {};
  if (!steps.step2 && savedKi?.building) {
    const b = savedKi.building;
    ergaenzung.step2 = {
      laenge: String(b.lengthM || ''), breite: String(b.widthM || ''),
      hoehe: String(b.heightM || ''), traufhoehe: String(b.eavesHeightM || ''),
      dachform: b.roofForm ? String(b.roofForm)[0].toUpperCase() + String(b.roofForm).slice(1) : '',
      fassade: 'Putz', hindernisse: [], abschnitte: [],
      dachueberstand: String(b.overhangM ?? 0.5), durchfahrt: false,
    };
  }
  if (!steps.step3 && savedKi?.systemId) {
    ergaenzung.step3 = {
      geruesttyp: 'fassade', system: savedKi.systemId, customSystem: '',
      feldlange: '2.5', belag: 'stahl', gelander: true, diagonale: true,
      fahrbar: false, boden: 'beton',
    };
  }
  return ergaenzung;
}
