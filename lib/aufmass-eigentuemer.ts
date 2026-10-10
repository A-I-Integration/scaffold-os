// ============================================================
// SCAFFOLD OS – Zuordnung von Browser-Zwischenspeichern zu EINEM Projekt
//
// LiDAR-Messwerte und die Upload-Sitzung liegen im localStorage und sind
// nicht an ein Projekt gebunden. Wer erst ein Test-Aufmaß mit Scan machte und
// danach ein bestehendes Projekt öffnete, sah dort den fremden Scan, und beim
// Speichern landeten fremde Messwerte/Uploads im falschen Projekt.
//
// Jetzt wird vermerkt, zu welchem Projekt die Werte gehören:
//   • Projekt-ID  → gehört zu diesem bestehenden Projekt
//   • 'neu'       → gehört zum gerade neu angelegten (noch ungespeicherten) Aufmaß
// Gelesen werden die Werte nur, wenn der Vermerk zum geöffneten Projekt passt.
// ============================================================

export const LIDAR_EIGENTUEMER_KEY = 'scaffold_lidar_projekt';
export const SESSION_EIGENTUEMER_KEY = 'scaffold_session_projekt';
export const NEU = 'neu';

/** Reine Entscheidungslogik (ohne Browser). projectId = null → neues Aufmaß. */
export function gehoertZu(eigentuemer: string | null, projectId: string | null | undefined): boolean {
  if (projectId) return eigentuemer === projectId;
  return eigentuemer === null || eigentuemer === NEU;
}

export function setzeLidarEigentuemer(projectId: string | null | undefined) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LIDAR_EIGENTUEMER_KEY, projectId || NEU); } catch { /* ignore */ }
}

/** Liest einen LiDAR-Zwischenspeicher nur, wenn er zu diesem Projekt gehört. */
export function leseLidarFuerProjekt(key: string, projectId: string | null | undefined): string | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!gehoertZu(localStorage.getItem(LIDAR_EIGENTUEMER_KEY), projectId)) return null;
    return localStorage.getItem(key);
  } catch { return null; }
}

/** Darf die Upload-Sitzung (scaffold_session_id) beim Speichern an dieses Projekt gehängt werden? */
export function sitzungGehoertZu(projectId: string | null | undefined): boolean {
  if (typeof window === 'undefined') return false;
  try { return gehoertZu(localStorage.getItem(SESSION_EIGENTUEMER_KEY), projectId); } catch { return false; }
}
