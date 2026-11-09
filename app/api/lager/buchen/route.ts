import { NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { ROLLEN } from '@/lib/rollen';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// Bewegungsarten, die über diese Route gebucht werden dürfen. AB (Anfangsbestand) und ST (Storno)
// gibt es hier nicht: AB nur per Migration, Storno über { storno_von }.
const ERLAUBT = ['WE', 'AU', 'AN', 'RN', 'UL', 'ZW', 'VL', 'IP', 'IM'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZUSTAENDE = ['frei', 'reserviert', 'gesperrt', 'in_pruefung', 'defekt', 'reparatur'];

// POST /api/lager/buchen
// Buchen:   { bewegungsart, positionen: [{ inventory_id, menge, von_lagerort?, von_zustand?, nach_lagerort?, nach_zustand?, bemerkung? }], project_id?, bemerkung? }
// Stornieren: { storno_von: <Beleg-ID>, grund? }
// Verlust (VL), Inventurdifferenz (IM/IP) und Storno nur für Admin + Disposition.
export async function POST(req: Request) {
  const rolle = await pruefeRolle(ROLLEN.LAGER);
  if (!rolle.ok) return rolle.response;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return fehler('Ungültige Anfrage.');

    if (body.storno_von !== undefined) {
      if (!ROLLEN.ADMIN_DISPO.includes(rolle.role as never)) return fehler('Stornieren dürfen nur Admin und Disposition.', 403);
      if (!UUID.test(String(body.storno_von))) return fehler('Beleg-ID ungültig.');
      return rpc('storniere_lager', { p_beleg: body.storno_von, p_user: rolle.userId, p_grund: body.grund ?? null });
    }

    const art = String(body.bewegungsart || '');
    if (!(ERLAUBT as readonly string[]).includes(art)) return fehler('Bewegungsart nicht erlaubt.');
    if (['VL', 'IP', 'IM'].includes(art) && !ROLLEN.ADMIN_DISPO.includes(rolle.role as never)) {
      return fehler('Verlust und Inventurdifferenzen dürfen nur Admin und Disposition buchen.', 403);
    }
    const pos = body.positionen;
    if (!Array.isArray(pos) || pos.length === 0 || pos.length > 200) return fehler('Mindestens eine Position (höchstens 200) nötig.');
    for (const [i, p] of pos.entries()) {
      if (!p || !UUID.test(String(p.inventory_id))) return fehler(`Position ${i + 1}: Artikel ungültig.`);
      if (!Number.isInteger(p.menge) || p.menge <= 0) return fehler(`Position ${i + 1}: Menge muss eine ganze Zahl über 0 sein.`);
      for (const f of ['von_lagerort', 'nach_lagerort']) if (p[f] && !UUID.test(String(p[f]))) return fehler(`Position ${i + 1}: Lagerort ungültig.`);
      for (const f of ['von_zustand', 'nach_zustand']) if (p[f] && !ZUSTAENDE.includes(p[f])) return fehler(`Position ${i + 1}: Zustand ungültig.`);
    }
    if (body.project_id && !UUID.test(String(body.project_id))) return fehler('Projekt ungültig.');

    return rpc('buche_lager', {
      p_bewegungsart: art, p_positionen: pos, p_user: rolle.userId,
      p_project: body.project_id ?? null, p_bemerkung: body.bemerkung ?? null,
    });
  } catch (err) {
    return serverErrorResponse(err, 'lager/buchen');
  }
}

function fehler(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

async function rpc(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });
  const text = await res.text();
  if (res.ok) {
    let id: string | null = null;
    try { id = JSON.parse(text); } catch { id = text; }
    return NextResponse.json({ success: true, beleg_id: id });
  }
  // Fachliche Fehlermeldungen aus der Datenbank (Bestand reicht nicht, Regel verletzt …) sind für den Nutzer gedacht.
  let msg = '';
  try { msg = JSON.parse(text).message || ''; } catch { /* kein JSON */ }
  const fachlich = /^(Nicht genug Bestand|Position \d+:|Unbekannte Bewegungsart|Ein Beleg braucht|Beleg |Ein Storno|Projekt .* nicht gefunden|Die Bewegungsart)/.test(msg);
  if (fachlich) return fehler(msg, 422);
  return serverErrorResponse(new Error(text), `lager/${name}`);
}
