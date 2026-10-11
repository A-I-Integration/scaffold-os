// Client-Teil des Auto-Speicherns bei Bestandsprojekten (siehe aufmass-autosave-regeln.ts).
import { type AutosaveSchritt, istSchrittGeaendert, stabilJson } from '@/lib/aufmass-autosave-regeln';

// Zuletzt erfolgreich gespeicherter Stand je Projekt+Schritt (nur in dieser Browser-Sitzung).
const basen = new Map<string, string>();
// Aufrufe nacheinander: Server liest-mergt-schreibt data, parallele PATCHs könnten sich überschreiben.
let kette: Promise<unknown> = Promise.resolve();

async function einmal(projectId: string, schritt: AutosaveSchritt, form: unknown): Promise<void> {
  const key = `${projectId}:${schritt}`;
  if (!istSchrittGeaendert(basen.get(key), form)) return;
  const res = await fetch('/api/projects', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, autosave: true, data: { [schritt]: form } }),
  });
  // Basis nur nach Erfolg setzen – bei Fehler versucht das nächste "Weiter" es erneut.
  // 409 (Projekt abgeschlossen) ist endgültig → nicht jedes Mal erneut anfragen.
  if (res.ok || res.status === 409) basen.set(key, stabilJson(form));
}

/** Speichert data.<schritt> eines Bestandsprojekts still im Hintergrund. Wirft nie, blockiert nie. */
export function speichereSchrittAuto(projectId: string | null, schritt: AutosaveSchritt, form: unknown): Promise<void> {
  if (!projectId || typeof window === 'undefined') return Promise.resolve();
  const lauf = kette.then(() => einmal(projectId, schritt, form)).catch(() => { /* best-effort */ });
  kette = lauf;
  return lauf;
}
