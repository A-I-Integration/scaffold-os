import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { ROLLEN } from '@/lib/rollen';

// ============================================================
// SCAFFOLD OS – Versandprotokoll lesen (Faktura F4, Tabelle invoice_dispatches)
// GET ?invoice_id=<uuid>   → alle Versuche dieser Rechnung (neueste zuerst)
// GET ?customer_id=<uuid>  → alle Versuche dieses Kunden
// GET (ohne Filter)        → die jüngsten 1000 Versuche
// Geschrieben wird ausschließlich vom Server beim Versand (/api/email). Nur Admin und Disposition.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPALTEN = 'id,created_at,invoice_id,invoice_number,customer_id,project_id,kind,to_email,subject,status,error,format,dokument_hash,attachment_name';

const tabelleFehlt = (t: string) => /invoice_dispatches/.test(t) && /(does not exist|schema cache|PGRST205|42P01)/i.test(t);

export async function GET(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO);
  if (!r.ok) return r.response;
  try {
    const rechnung = req.nextUrl.searchParams.get('invoice_id');
    const kunde = req.nextUrl.searchParams.get('customer_id');
    if ((rechnung && !UUID.test(rechnung)) || (kunde && !UUID.test(kunde))) return NextResponse.json({ success: false, error: 'id ungültig' }, { status: 400 });
    const filter = rechnung ? `&invoice_id=eq.${rechnung}` : kunde ? `&customer_id=eq.${kunde}` : '';
    const res = await fetch(`${url}/rest/v1/invoice_dispatches?select=${SPALTEN}${filter}&order=created_at.desc&limit=1000`, { headers });
    if (!res.ok) {
      const t = await res.text();
      // Ohne Tabelle läuft alles wie bisher; die Oberfläche zeigt dann „kein Versand protokolliert“ und den Hinweis
      if (tabelleFehlt(t)) return NextResponse.json({ success: false, code: 'TABELLE_FEHLT', error: 'Das Versandprotokoll ist noch nicht eingerichtet (supabase/phase-123-versandprotokoll.sql im SQL-Editor ausführen).' }, { status: 503 });
      throw new Error(t);
    }
    return NextResponse.json({ success: true, eintraege: await res.json() });
  } catch (err) {
    return serverErrorResponse(err);
  }
}
