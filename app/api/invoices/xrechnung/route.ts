import { NextRequest, NextResponse } from 'next/server';
import { toXRechnung } from '@stackforge-eu/factur-x';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { ROLLEN } from '@/lib/rollen';
import { pruefePflichtangaben } from '@/lib/rechnung-steuer';
import { baueERechnungEingabe } from '@/lib/rechnung-erechnung';
import { archiviereXml } from '@/lib/rechnung-archiv';

// ============================================================
// SCAFFOLD OS – XRechnung (reines XML, Syntax CII)
//
// Für Auftraggeber, die XRechnung verlangen (v. a. Behörden). Die Daten
// kommen aus derselben Quelle wie die ZUGFeRD-Rechnung, werden gegen
// EN 16931 geprüft und unveränderbar archiviert. Behörden verlangen die
// Leitweg-ID des Kunden; ohne sie gibt es eine klare Fehlermeldung.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };

export async function POST(req: NextRequest) {
  const rollenPruefung = await pruefeRolle(ROLLEN.ADMIN_DISPO);
  if (!rollenPruefung.ok) return rollenPruefung.response;
  try {
    const { invoice_id } = await req.json();
    if (!invoice_id || !/^[0-9a-f-]{36}$/i.test(String(invoice_id))) {
      return NextResponse.json({ success: false, error: 'invoice_id erforderlich' }, { status: 400 });
    }
    const invRes = await fetch(`${url}/rest/v1/invoices?id=eq.${invoice_id}&select=*`, { headers });
    if (!invRes.ok) throw new Error(await invRes.text());
    const inv = (await invRes.json())?.[0];
    if (!inv) return NextResponse.json({ success: false, error: 'Rechnung nicht gefunden.' }, { status: 404 });

    const luecken = pruefePflichtangaben(inv);
    if (!inv.leitweg_id) luecken.push({ code: 'LEITWEG_ID', text: 'Für XRechnung fehlt die Leitweg-ID des Kunden (Kundenstamm).' });
    if (luecken.length > 0) {
      return NextResponse.json({
        success: false, error: 'Für die XRechnung fehlen Angaben.',
        details: luecken.map((l) => ({ field: l.code, message: l.text })),
      }, { status: 400 });
    }

    let ergebnis;
    try {
      ergebnis = toXRechnung(baueERechnungEingabe(inv));
    } catch (e: any) {
      return NextResponse.json({ success: false, error: 'Rechnungsdaten sind nicht vollständig für eine XRechnung.', details: String(e?.message || e) }, { status: 400 });
    }
    const archiviert = await archiviereXml({ url, headers }, inv, 'xrechnung', ergebnis.xml, rollenPruefung.userId);
    return NextResponse.json({
      success: true, xml: ergebnis.xml, dateiname: `${String(inv.invoice_number).replace(/[^A-Za-z0-9_-]/g, '_')}_xrechnung.xml`, archiviert,
      ...(archiviert ? {} : { warnung: 'Die XRechnung wurde erstellt, konnte aber nicht archiviert werden (Datenbank-Migration ausgeführt?).' }),
    });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
