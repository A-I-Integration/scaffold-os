import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { csvZuPositionen, normKennzeichen } from '@/lib/ortung';

// ============================================================
// SCAFFOLD OS – Ortungsdaten aus einer CSV-Datei des Telematik-Anbieters importieren
// POST { csv } → schreibt Positionen je Fahrzeug (Zuordnung über das Kennzeichen) in gps_tracking.
// Nur Chef und Dispo. Positionen älter als 90 Tage werden nicht übernommen (die nächtliche Datenhygiene löscht sie ohnehin).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const MAX_ZEICHEN = 8_000_000;
const MAX_ZEILEN = 100_000;
const fehler = (text: string, status = 400) => NextResponse.json({ success: false, error: text }, { status });

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(['admin', 'disponent']);
  if (!rolle.ok) return rolle.response;
  let b: any;
  try { b = await req.json(); } catch { return fehler('Ungültige Anfrage'); }
  const csv = typeof b?.csv === 'string' ? b.csv : '';
  if (!csv.trim()) return fehler('Bitte eine CSV-Datei auswählen.');
  if (csv.length > MAX_ZEICHEN) return fehler('Die Datei ist zu groß (höchstens 8 MB). Bitte in kleinere Zeiträume teilen.');
  const gelesen = csvZuPositionen(csv);
  if (gelesen.fehler) return fehler(gelesen.fehler);
  if (gelesen.positionen.length > MAX_ZEILEN) return fehler(`Zu viele Zeilen (höchstens ${MAX_ZEILEN}). Bitte in kleinere Zeiträume teilen.`);
  try {
    const rv = await fetch(`${url}/rest/v1/vehicles?select=id,license_plate`, { headers });
    if (!rv.ok) throw new Error(await rv.text());
    const fahrzeuge = new Map<string, string>((await rv.json()).map((v: any) => [normKennzeichen(String(v.license_plate)), v.id]));
    const grenze = Date.now() - 90 * 86400000, zukunft = Date.now() + 86400000;
    const unbekannt = new Set<string>();
    let zuAlt = 0, ungueltig = gelesen.ungueltig;
    const jeFahrzeug = new Map<string, { vehicle_id: string; created_at: string; lat: number; lng: number }[]>();
    for (const p of gelesen.positionen) {
      const id = fahrzeuge.get(p.kennzeichen);
      if (!id) { unbekannt.add(p.kennzeichen); continue; }
      const t = Date.parse(p.t);
      if (t < grenze) { zuAlt++; continue; }
      if (t > zukunft) { ungueltig++; continue; }
      (jeFahrzeug.get(id) ?? jeFahrzeug.set(id, []).get(id)!).push({ vehicle_id: id, created_at: p.t, lat: p.lat, lng: p.lng });
    }
    let importiert = 0, doppelt = 0;
    for (const [vehicleId, zeilen] of jeFahrzeug) {
      const zeiten = zeilen.map(z => z.created_at).sort();
      const r = await fetch(`${url}/rest/v1/gps_tracking?select=created_at&vehicle_id=eq.${vehicleId}&created_at=gte.${zeiten[0]}&created_at=lte.${zeiten[zeiten.length - 1]}&limit=100000`, { headers });
      if (!r.ok) throw new Error(await r.text());
      const schon = new Set((await r.json()).map((x: any) => Date.parse(x.created_at)));
      const neu = zeilen.filter(z => !schon.has(Date.parse(z.created_at)));
      doppelt += zeilen.length - neu.length;
      for (let i = 0; i < neu.length; i += 500) {
        const w = await fetch(`${url}/rest/v1/gps_tracking`, { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(neu.slice(i, i + 500)) });
        if (!w.ok) throw new Error(await w.text());
        importiert += Math.min(500, neu.length - i);
      }
    }
    return NextResponse.json({ success: true, gelesen: gelesen.positionen.length + gelesen.ungueltig, importiert, doppelt, zuAlt, ungueltig, unbekannteKennzeichen: [...unbekannt].slice(0, 20) });
  } catch (err) {
    return serverErrorResponse(err, 'ortung-import/POST');
  }
}
