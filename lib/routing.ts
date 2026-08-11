// ============================================================
// SCAFFOLD OS – Routing-Helfer (OpenStreetMap, kostenlos, ohne API-Key)
//
//   geocodeAddress()      → Nominatim: Adresse → Koordinaten
//   buildTable()          → OSRM: Fahrzeit-/Distanz-Matrix zwischen Punkten
//
// Fair-Use: Nominatim erlaubt max. ~1 Anfrage/Sekunde und verlangt
// einen User-Agent. Wir geocodieren sequentiell mit Pause und nur
// so viele Adressen wie nötig (MAX_GEOCODE).
// ============================================================

export interface GeoPoint {
  label: string;      // z.B. Projektname oder "Lager"
  address: string;
  lat: number;
  lng: number;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/table/v1/driving';
const UA = 'SCAFFOLD-OS/1.0 (Geruestbau-Disposition; Kontakt: noreply@scaffoldos.de)';
const MAX_GEOCODE = 15;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `${NOMINATIM}?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=de`,
      { headers: { 'User-Agent': UA } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.[0]) return null;
    return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) };
  } catch {
    return null;
  }
}

// Geocodiert eine Liste von {label, address}; nicht auflösbare Adressen
// werden übersprungen und in "failed" zurückgemeldet.
export async function geocodeAll(
  items: { label: string; address: string }[]
): Promise<{ points: GeoPoint[]; failed: string[] }> {
  const points: GeoPoint[] = [];
  const failed: string[] = [];
  const limited = items.slice(0, MAX_GEOCODE);

  for (let i = 0; i < limited.length; i++) {
    const it = limited[i];
    const coords = await geocodeAddress(it.address);
    if (coords) {
      points.push({ label: it.label, address: it.address, ...coords });
    } else {
      failed.push(it.address);
    }
    if (i < limited.length - 1) await sleep(1100); // Nominatim Fair-Use
  }
  return { points, failed };
}

export interface TableResult {
  durations: number[][] | null; // Sekunden
  distances: number[][] | null; // Meter
}

export async function buildTable(points: GeoPoint[]): Promise<TableResult> {
  if (points.length < 2) return { durations: null, distances: null };
  try {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
    const res = await fetch(`${OSRM}/${coords}?annotations=duration,distance`, {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) return { durations: null, distances: null };
    const json = await res.json();
    if (json.code !== 'Ok') return { durations: null, distances: null };
    return { durations: json.durations || null, distances: json.distances || null };
  } catch {
    return { durations: null, distances: null };
  }
}

// Matrix als kompakten Text fürs KI-Modell aufbereiten
export function tableAsText(points: GeoPoint[], durations: number[][] | null): string {
  if (!durations) return 'Keine Fahrzeit-Matrix verfügbar (Routing-Dienst nicht erreichbar).';
  const lines: string[] = ['Fahrzeiten in Minuten (von → nach):'];
  for (let i = 0; i < points.length; i++) {
    const row = points
      .map((p, j) => (i === j ? null : `${p.label}: ${Math.round(durations[i][j] / 60)}`))
      .filter(Boolean)
      .join(', ');
    lines.push(`- ${points[i].label} → ${row}`);
  }
  return lines.join('\n');
}
