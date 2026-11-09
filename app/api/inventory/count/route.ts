import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, serverErrorResponse, pruefeRolle } from '@/lib/auth';
import { ROLLEN } from '@/lib/rollen';
import { freierLagerbestand, hauptlagerId, rpc } from '@/lib/inventory/buchung';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// POST /api/inventory/count
// Body: { inventory_id, counted_quantity, notes?, project_id? }
export async function POST(req: Request) {
  const rollenPruefung = await pruefeRolle(ROLLEN.LAGER);
  if (!rollenPruefung.ok) return rollenPruefung.response;
  try {
    const body = await req.json();
    const { inventory_id, counted_quantity, notes, project_id } = body;

    if (!inventory_id || counted_quantity === undefined) {
      return NextResponse.json({ success: false, error: 'inventory_id und counted_quantity erforderlich' }, { status: 400 });
    }

    // 1. Buchbestand = freier Bestand in allen Lagern (neues Lager)
    const getRes = await fetch(`${url}/rest/v1/inventory?id=eq.${inventory_id}&select=sku,name,unit`, { headers });
    if (!getRes.ok) throw new Error(await getRes.text());
    const items = await getRes.json();
    if (!items || items.length === 0) throw new Error('Artikel nicht gefunden');

    const gezaehlt = Number(counted_quantity);
    if (!Number.isInteger(gezaehlt) || gezaehlt < 0) {
      return NextResponse.json({ success: false, error: 'Die gezählte Menge muss eine ganze Zahl ab 0 sein.' }, { status: 400 });
    }
    const quellen = await freierLagerbestand(inventory_id);
    if (!quellen) throw new Error('Lagerbestand konnte nicht gelesen werden');
    const bookQty = quellen.reduce((s, z) => s + z.menge, 0);
    const diff = gezaehlt - bookQty;

    // 2. Differenz als Beleg buchen (Mehrbestand IP ins Hauptlager, Fehlbestand IM aus den Lagern mit dem meisten Bestand)
    if (diff !== 0) {
      let positionen: Record<string, unknown>[] = [];
      let art = 'IP';
      if (diff > 0) {
        const haupt = await hauptlagerId();
        if (!haupt) throw new Error('Hauptlager nicht gefunden');
        positionen = [{ inventory_id, menge: diff, nach_lagerort: haupt, nach_zustand: 'frei' }];
      } else {
        art = 'IM';
        let rest = -diff;
        for (const q of quellen) {
          if (rest <= 0) break;
          const nimm = Math.min(rest, q.menge);
          positionen.push({ inventory_id, menge: nimm, von_lagerort: q.lagerort_id, von_zustand: 'frei' });
          rest -= nimm;
        }
      }
      const r = await rpc('buche_lager', {
        p_bewegungsart: art, p_positionen: positionen, p_user: rollenPruefung.userId, p_project: project_id || null,
        p_bemerkung: notes || `Inventur: gezählt ${gezaehlt}, Buchbestand ${bookQty}`, p_referenz_typ: 'inventory_count',
      });
      if (!r.ok) {
        if (/Nicht genug Bestand/.test(r.meldung)) {
          return NextResponse.json({ success: false, error: 'Der Bestand wurde zwischenzeitlich geändert. Bitte erneut zählen.' }, { status: 409 });
        }
        throw new Error(r.meldung);
      }
    }

    // 3. Altes Protokoll (Berichte lesen es noch)
    const txRes = await fetch(`${url}/rest/v1/inventory_transactions`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        inventory_id,
        project_id: project_id || null,
        type: 'count',
        quantity: diff, // positiv = Zugang, negativ = Abgang
        reason: notes || `Inventur: gezählt ${gezaehlt}, Buchbestand ${bookQty}, Differenz ${diff > 0 ? '+' : ''}${diff}`,
        reference_type: 'inventory_count',
      }),
    });
    if (!txRes.ok) throw new Error(await txRes.text());

    return NextResponse.json({
      success: true,
      inventory_id,
      book_quantity: bookQty,
      counted_quantity: gezaehlt,
      difference: diff,
      message: diff === 0 ? 'Bestand stimmt überein ✅' : `Differenz ${diff > 0 ? '+' : ''}${diff} gebucht`,
    });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}