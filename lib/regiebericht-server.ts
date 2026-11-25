import { erzeugeRegiebericht } from '@/lib/regiebericht-pdf';
import { normStunden, normMaterial, normFotos, ohnePreise, type RegieStunde, type RegieMaterial } from '@/lib/regiebericht';

// Gemeinsame Serverhilfen für Regieberichte (Datenbankzugriff über Supabase REST mit Service-Key).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const sbHeaders = () => ({ 'Content-Type': 'application/json', apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || key, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || key}` });
export const sbUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL || url;
export const PREIS_ROLLEN = ['admin', 'disponent', 'bauleiter'];
export const BETRIEB_ROLLEN = ['admin', 'disponent', 'bauleiter', 'mitarbeiter'];
export const BUERO_ROLLEN = ['admin', 'disponent'];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const tabelleFehlt = (t: string) => /regieberichte/.test(t) && /(does not exist|Could not find|PGRST205|42P01)/i.test(t);

export async function ladeBericht(id: string): Promise<Record<string, any> | null> {
  const r = await fetch(`${sbUrl()}/rest/v1/regieberichte?id=eq.${id}&select=*`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json())?.[0] ?? null;
}

/** Bericht für die Ausgabe an die Rolle aufbereiten (Mitarbeiter sehen keine Preise). */
export function fuerRolle(b: Record<string, any>, rolle: string): Record<string, any> & { stunden: RegieStunde[]; material: RegieMaterial[]; fotos: string[] } {
  const norm = { ...b, stunden: normStunden(b.stunden), material: normMaterial(b.material), fotos: normFotos(b.fotos) };
  return PREIS_ROLLEN.includes(rolle) ? norm : ohnePreise(norm);
}

export async function pdfFuer(b: Record<string, any>, rolle: string, mitPreisen = true): Promise<Uint8Array> {
  const h = sbHeaders();
  const [p, k, c] = await Promise.all([
    fetch(`${sbUrl()}/rest/v1/projects?id=eq.${b.project_id}&select=name,adresse`, { headers: h }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    b.customer_id ? fetch(`${sbUrl()}/rest/v1/customers?id=eq.${b.customer_id}&select=name`, { headers: h }).then((r) => (r.ok ? r.json() : [])).catch(() => []) : Promise.resolve([]),
    fetch(`${sbUrl()}/rest/v1/company_settings?id=eq.00000000-0000-0000-0000-000000000001&select=company_name,street,zip,city`, { headers: h }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);
  const n = fuerRolle(b, rolle);
  return erzeugeRegiebericht({
    nummer: n.nummer, datum: n.datum, anlass: n.anlass, beschreibung: n.beschreibung, stunden: n.stunden, material: n.material, fotos: n.fotos,
    unterschrieben_von: n.unterschrieben_von, unterschrift: n.unterschrift, unterschrieben_am: n.unterschrieben_am,
    projektName: p?.[0]?.name, baustelle: p?.[0]?.adresse, kundeName: k?.[0]?.name, firma: c?.[0] ?? null,
    mitPreisen: mitPreisen && PREIS_ROLLEN.includes(rolle),
  });
}
