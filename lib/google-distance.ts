// ============================================================
// lib/google-distance.ts
// SCAFFOLD OS – Echte Fahrstrecken über die Google Distance Matrix API
// ============================================================
// Ersetzt die vorherige Zufallszahl in app/api/disposition/route.ts
// (distanceKm: Math.random()...). Ein API-Call liefert die Strecke
// von mehreren Baustellen-Adressen (origins) zu EINER Ziel-Adresse
// (destination) auf einmal.
//
// GOOGLE_MAPS_API_KEY muss als Umgebungsvariable gesetzt sein (Vercel
// Projekt-Einstellungen -> Environment Variables). Ist der Key nicht
// gesetzt, eine Adresse nicht auflösbar, oder die API nicht
// erreichbar: distanceKm wird `null` statt einer erfundenen Zahl -
// die aufrufende Stelle muss damit umgehen (siehe
// lib/calculations/disposition.ts), statt falsche Werte anzuzeigen.
// ============================================================

const ENDPOINT = 'https://maps.googleapis.com/maps/api/distancematrix/json';

/**
 * Liefert für jede origin-Adresse die Fahrstrecke (km) zur destination.
 * Rückgabe: Map Adresse (wie übergeben) -> km, oder null wenn für
 * diese eine Adresse keine Strecke ermittelt werden konnte.
 * Gibt eine leere Map zurück (nicht wirft), wenn der Key fehlt oder
 * der gesamte Request fehlschlägt - Aufrufer prüft dann explizit auf
 * fehlende Einträge statt sich auf einen Wert zu verlassen.
 */
export async function distanceMatrixKm(
  origins: string[],
  destination: string
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey || origins.length === 0 || !destination) {
    for (const o of origins) result.set(o, null);
    return result;
  }

  // Distance Matrix erlaubt bis zu 25 origins pro Request - für unseren
  // Anwendungsfall (Baustellen mit passendem Material) mehr als genug,
  // trotzdem defensiv begrenzt.
  const begrenzt = origins.slice(0, 25);

  try {
    const url =
      `${ENDPOINT}?units=metric` +
      `&origins=${encodeURIComponent(begrenzt.join('|'))}` +
      `&destinations=${encodeURIComponent(destination)}` +
      `&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      for (const o of begrenzt) result.set(o, null);
      return result;
    }
    const json = await res.json();
    if (json.status !== 'OK' || !Array.isArray(json.rows)) {
      for (const o of begrenzt) result.set(o, null);
      return result;
    }
    begrenzt.forEach((origin, i) => {
      const element = json.rows[i]?.elements?.[0];
      if (element?.status === 'OK' && typeof element.distance?.value === 'number') {
        result.set(origin, Math.round((element.distance.value / 1000) * 10) / 10); // Meter -> km
      } else {
        result.set(origin, null);
      }
    });
    return result;
  } catch {
    for (const o of begrenzt) result.set(o, null);
    return result;
  }
}
