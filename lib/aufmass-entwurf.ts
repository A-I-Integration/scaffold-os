// ============================================================
// SCAFFOLD OS – Aufmaß-Entwurf (Auto-Save für Schritt 1–5)
//
// Bisher lag alles aus Schritt 1–5 nur im Browser (localStorage). Wurde der
// Browser geschlossen oder der Speicher geleert, war die Arbeit weg. Jetzt
// wird beim "Weiter" jedes Schritts eine Kopie als Projekt mit
// data.entwurf = true in der Datenbank abgelegt. Die Projekt-ID merkt sich
// der Browser unter ENTWURF_ID_KEY (nicht in der URL – ein ?id= in der URL
// würde in Schritt 2 den LiDAR-/Grundriss-/Foto-Import abschalten).
//
// Schritt 6 nutzt dieselbe ID beim endgültigen Speichern (PATCH statt POST),
// setzt entwurf auf false und räumt den Schlüssel auf.
// ============================================================

export const ENTWURF_ID_KEY = 'scaffold_entwurf_id';

export interface EntwurfPayload {
  name: string;
  adresse: string;
  data: Record<string, any>;
}

/** Reine Funktion (ohne Browser): baut aus den Schritt-Daten die Nutzlast. */
export function baueEntwurfPayload(steps: Record<string, any>): EntwurfPayload {
  const s1 = steps.step1 || {};
  const name = typeof s1.name === 'string' && s1.name.trim() ? s1.name.trim() : 'Unbenanntes Projekt';
  const adresse = typeof s1.adresse === 'string' ? s1.adresse : '';
  return { name, adresse, data: { ...steps, entwurf: true } };
}

function leseSchritte(): Record<string, any> {
  const steps: Record<string, any> = {};
  for (let i = 1; i <= 5; i++) {
    const raw = localStorage.getItem(`scaffold_step${i}`);
    if (!raw) { steps[`step${i}`] = {}; continue; }
    try { steps[`step${i}`] = JSON.parse(raw); } catch { steps[`step${i}`] = {}; }
  }
  return steps;
}

// Aufrufe nacheinander abarbeiten – sonst könnten zwei schnelle "Weiter"
// vor der ersten Antwort zwei Entwürfe anlegen.
let kette: Promise<unknown> = Promise.resolve();

async function speichereEntwurfEinmal(): Promise<void> {
  if (typeof window === 'undefined') return;
  const steps = leseSchritte();
  // Nichts Sinnvolles eingegeben (Schritt 1 leer) → keinen leeren Entwurf anlegen
  if (!steps.step1 || Object.keys(steps.step1).length === 0) return;
  const p = baueEntwurfPayload(steps);
  const id = localStorage.getItem(ENTWURF_ID_KEY);

  if (id) {
    const res = await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: p.name, adresse: p.adresse, data: p.data }),
    });
    if (res.ok) return;
    if (res.status !== 404) return; // z. B. keine Berechtigung/Netz – nichts kaputt machen
    // Entwurf existiert nicht mehr (gelöscht) → neu anlegen
    localStorage.removeItem(ENTWURF_ID_KEY);
  }

  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: p.name, adresse: p.adresse, data: p.data, status: 'active' }),
  });
  if (!res.ok) return;
  const json = await res.json();
  if (json?.id) localStorage.setItem(ENTWURF_ID_KEY, String(json.id));
}

/** Speichert den aktuellen Stand von Schritt 1–5 als Entwurf. Wirft nie. */
export function speichereEntwurf(): Promise<void> {
  const lauf = kette.then(() => speichereEntwurfEinmal()).catch(() => { /* Entwurf ist best-effort */ });
  kette = lauf;
  return lauf;
}

export function leseEntwurfId(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(ENTWURF_ID_KEY); } catch { return null; }
}
