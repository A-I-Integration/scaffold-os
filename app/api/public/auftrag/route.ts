import { NextRequest, NextResponse } from 'next/server';
import { serverErrorResponse } from '@/lib/auth';
import { TOKEN_MUSTER, mappeLinkStatus } from '@/lib/baustellenmappe';
import { normalisiereNachtraege, nachtragNummer } from '@/lib/nachtrag';
import { angebotNettoAusProjekt, berechneAuftragsstand, bezahltBrutto, sortiereRechnungen } from '@/lib/auftragsstand';

// Öffentlicher Auftragsstand (Auftraggeber, ohne Login): GET ?token=…
// Liefert NUR diese eine Baustelle: Kennzahlen, ihre Rechnungen (mit Positionen) und ihre Nachträge.
// Keine internen Notizen, keine Kunden- oder Projektlisten, keine Firmen-Interna außer Kontakt.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const nein = () => NextResponse.json({ success: false, error: 'Dieser Link ist ungültig oder wurde widerrufen.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || '';
    if (!TOKEN_MUSTER.test(token)) return nein();
    const lRes = await fetch(`${url}/rest/v1/project_stand_links?token=eq.${token}&select=project_id,expires_at,revoked_at`, { headers });
    if (!lRes.ok) throw new Error(await lRes.text());
    const link = (await lRes.json())?.[0];
    if (!link || mappeLinkStatus(link) !== 'aktiv') return nein();

    const [pRes, iRes, cRes] = await Promise.all([
      fetch(`${url}/rest/v1/projects?id=eq.${link.project_id}&select=name,adresse,data`, { headers }),
      fetch(`${url}/rest/v1/invoices?project_id=eq.${link.project_id}&select=id,invoice_number,invoice_type,status,invoice_date,due_date,leistungsdatum,geruest_nr,net_amount,tax_rate,tax_amount,gross_amount,paid_amount,positions,notes&order=invoice_date.asc&limit=500`, { headers }),
      fetch(`${url}/rest/v1/company_settings?id=eq.00000000-0000-0000-0000-000000000001&select=company_name,phone,email,calc_crane_day`, { headers }),
    ]);
    if (!pRes.ok) throw new Error(await pRes.text());
    if (!iRes.ok) throw new Error(await iRes.text());
    const projekt = (await pRes.json())?.[0];
    if (!projekt) return nein();
    const firma = cRes.ok ? (await cRes.json())?.[0] || null : null;
    const rechnungen: any[] = await iRes.json();
    const nachtraege = normalisiereNachtraege(projekt.data?.nachtraege);

    const stand = berechneAuftragsstand({
      angebotNetto: angebotNettoAusProjekt(projekt.data, Number(firma?.calc_crane_day) || 850),
      nachtraege, rechnungen,
    });
    return NextResponse.json({
      success: true,
      projekt: { name: projekt.name || 'Baustelle', adresse: projekt.adresse || null },
      firma: firma ? { name: firma.company_name || null, telefon: firma.phone || null, email: firma.email || null } : null,
      stand,
      rechnungen: sortiereRechnungen(rechnungen).map((r) => ({
        id: r.id, nummer: r.invoice_number, art: r.invoice_type || 'standard', status: r.status, datum: r.invoice_date, faellig: r.due_date,
        leistungsdatum: r.leistungsdatum, geruestNr: r.geruest_nr, netto: Number(r.net_amount), steuersatz: Number(r.tax_rate), steuer: Number(r.tax_amount),
        brutto: Number(r.gross_amount), bezahlt: bezahltBrutto(r), positionen: Array.isArray(r.positions) ? r.positions : [], bemerkung: r.notes || null,
      })),
      nachtraege: nachtraege.map((n) => ({ nummer: nachtragNummer(n), datum: n.datum, titel: n.titel, notiz: n.grund, betrag: n.betrag, status: n.status, art: n.art || null })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) { return serverErrorResponse(err, 'public/auftrag GET'); }
}
