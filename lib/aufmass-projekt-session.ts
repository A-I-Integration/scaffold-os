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
  'scaffold_schritt_geladenes_projekt_1',
  'scaffold_schritt_geladenes_projekt_2',
  'scaffold_schritt_geladenes_projekt_3',
  'scaffold_schritt_geladenes_projekt_4',
  'scaffold_schritt_geladenes_projekt_5',
  'scaffold_schritt_geladenes_projekt_6',
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

// FIX (Bug-Report, 2. Anlauf: "Angebot öffnen" zeigt ein Aufmaß OHNE die
// CAD-Daten" / "über Dashboard → Schritt 1 → Schritt 2 bleibt Schritt 2
// leer"): Die Markierung oben wird von JEDEM der 6 Schritte geschrieben
// und sagt deshalb nur "irgendein Schritt hat dieses Projekt diese
// Sitzung schon angefasst" – nicht "DIESER Schritt hat für GENAU dieses
// Projekt seine EIGENEN, vollständigen Daten schon aus der Datenbank
// geladen". Beispiel für den zweiten Bug-Report: Dashboard öffnet ein
// Projekt über Schritt 1 (setzt die Markierung); klickt man von dort zu
// Schritt 2 weiter, sah Schritt 2 die (von Schritt 1 gesetzte) Markierung
// bereits auf "dieses Projekt" stehen und hielt sich fälschlich für schon
// geladen – obwohl er selbst nie etwas geladen hatte und scaffold_step2
// im Zwischenspeicher noch fehlte. Ein früherer Zusatz-Check in Schritt 6
// allein (ob überhaupt irgendein scaffold_step2 im Zwischenspeicher
// liegt) reicht dafür nicht: lag dort noch scaffold_step2 eines VORHER
// besuchten, ANDEREN Projekts, wurde der Check fälschlich "erfüllt".
// Jeder Schritt merkt sich deshalb jetzt selbst, unter einem NUR von ihm
// selbst beschriebenen Schlüssel, für welche Projekt-ID er seine eigenen
// Daten zuletzt wirklich vollständig aus der Datenbank geladen hat –
// projektgenau und unabhängig davon, was andere Schritte im geteilten
// Zwischenspeicher/der geteilten Markierung hinterlassen haben.
const SCHRITT_GELADEN_PREFIX = 'scaffold_schritt_geladenes_projekt_';

/** Liefert die Projekt-ID, für die GENAU dieser Schritt (1-6) seine Daten
 * zuletzt selbst vollständig aus der Datenbank geladen hat (oder null). */
export function leseSchrittGeladenesProjekt(schritt: number): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SCHRITT_GELADEN_PREFIX + schritt);
}

/** Markiert, dass GENAU dieser Schritt (1-6) seine Daten für dieses
 * Projekt geladen hat. */
export function setzeSchrittGeladenesProjekt(schritt: number, projectId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SCHRITT_GELADEN_PREFIX + schritt, projectId);
}

/** Alle 6 "hat dieser Schritt für dieses Projekt schon geladen"-Schlüssel
 * (siehe SCHRITT_GELADEN_PREFIX) – für WIZARD_KEYS unten. */
const ALLE_SCHRITT_GELADEN_KEYS = [1, 2, 3, 4, 5, 6].map((n) => SCHRITT_GELADEN_PREFIX + n);

/** Nach erfolgreichem Speichern: Markierung entfernen, damit ein
 * späteres erneutes Öffnen wieder korrekt frisch von der Datenbank lädt. */
export function schliesseSitzungAb() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(MARKER_KEY);
  // Siehe SCHRITT_GELADEN_PREFIX oben: nach dem Speichern soll ein
  // späteres erneutes Öffnen (z.B. über "Angebot öffnen" oder das
  // Dashboard) für JEDEN Schritt wieder frisch laden, statt sich auf den
  // jetzt ggf. veralteten Ladestand zu verlassen.
  ALLE_SCHRITT_GELADEN_KEYS.forEach((k) => localStorage.removeItem(k));
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
// FIX (Bug-Report: "Merola hat ... gewerke [gelöscht]"): Vor der Umstellung
// auf die heutigen 6 Gewerke-Kacheln (Commit bf3c86e) gab es eine andere,
// kleinere Liste an Einzelauswahl-Werten: "Fassade", "Dach", "Kamin",
// "Werbeanlage", "Fenster", "Allgemein". Bei sehr alten Projekten steht
// deshalb z.B. noch "Fassade" (statt "WDVS/Fassade") gespeichert – dieser
// Wert existiert unter diesem Namen in der heutigen Kachel-Liste nicht
// mehr, weshalb Schritt 1 keine Kachel markieren konnte, obwohl die Daten
// unverändert korrekt in der Datenbank lagen (die Kunden-Detailseite zeigte
// über diese Funktion ja auch weiterhin richtig "Fassade" an).
// NUR eindeutige 1:1-Umbenennungen werden hier automatisch übersetzt – für
// "Kamin"/"Werbeanlage"/"Allgemein" gibt es keine klare heutige Entsprechung
// mehr, die wird deshalb bewusst NICHT geraten, sondern unverändert
// durchgereicht (zeigt weiterhin keine Kachel als ausgewählt, aber verliert
// auch keine Daten und erfindet keine falsche Zuordnung).
const GEWERK_UMBENENNUNGEN: Record<string, string> = {
  'Fassade': 'WDVS/Fassade',
};

/** Liefert die Gewerke eines step1-Objekts – neues Array-Feld "gewerke",
 * mit Fallback auf das alte Einzelfeld "gewerk" für ältere Projekte, sowie
 * Übersetzung bekannter, eindeutig umbenannter Alt-Werte auf die heutigen
 * Kachel-Bezeichnungen (siehe GEWERK_UMBENENNUNGEN). */
export function gewerkeVonStep1(step1: any): string[] {
  const roh: string[] = Array.isArray(step1?.gewerke) && step1.gewerke.length > 0
    ? step1.gewerke
    : (step1?.gewerk ? [step1.gewerk] : []);
  return roh.map((g) => GEWERK_UMBENENNUNGEN[g] || g);
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
