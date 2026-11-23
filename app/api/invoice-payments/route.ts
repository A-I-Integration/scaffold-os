import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';

// ============================================================
// SCAFFOLD OS – Teilzahlungen (Phase 38)
//
// GET  ?invoice_id=... → Zahlungshistorie einer Rechnung
// POST { invoice_id, amount, payment_date?, note? } → Zahlung erfassen
//      (voll oder teilweise – rechnet paid_amount hoch, setzt status
//      erst bei vollständigem Ausgleich auf "bezahlt")
// DELETE ?id=... → einzelne (fehlerhafte) Zahlung stornieren
//
// Buchen und Löschen laufen als Datenbankfunktionen (supabase/phase-129): Zeilensperre, Prüfung, Buchung und Status in einer Transaktion;
// Idempotency-Key bzw. request_key verhindert Doppelbuchungen bei Wiederholung.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
};
const WRITE_ROLES = ['admin', 'disponent'];

async function callerRole(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    return profile?.role || null;
  } catch {
    return null;
  }
}

const migrationFehlt = () => NextResponse.json({ success: false, code: 'BUCHUNG_MIGRATION_FEHLT', error: 'Die Datenbank-Migration phase-129 fehlt. Es wurde nichts gebucht.' }, { status: 503 });

export async function GET(req: NextRequest) {
  const role = await callerRole();
  if (!role) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
  if (!WRITE_ROLES.includes(role)) return NextResponse.json({ success: false, error: 'Dafür hast du keine Berechtigung.' }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get('invoice_id');
    // Zeitraum-Abfrage (Kennzahl „Bezahlt im Monat“): ?von=YYYY-MM-DD&bis=YYYY-MM-DD, alle Zahlungen des Zeitraums
    const von = searchParams.get('von'); const bis = searchParams.get('bis');
    if (!invoiceId && von && bis) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(von) || !/^\d{4}-\d{2}-\d{2}$/.test(bis)) return NextResponse.json({ success: false, error: 'von/bis ungültig' }, { status: 400 });
      const rr = await fetch(`${url}/rest/v1/invoice_payments?payment_date=gte.${von}&payment_date=lte.${bis}&select=invoice_id,amount,payment_date&limit=5000`, { headers });
      if (!rr.ok) throw new Error(await rr.text());
      return NextResponse.json({ success: true, payments: await rr.json() });
    }
    if (!invoiceId) return NextResponse.json({ success: false, error: 'invoice_id erforderlich' }, { status: 400 });

    const res = await fetch(`${url}/rest/v1/invoice_payments?invoice_id=eq.${invoiceId}&select=*&order=payment_date.desc`, { headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, payments: await res.json() });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }

  try {
    const { invoice_id, amount, payment_date, note, request_key } = await req.json();
    const betrag = Number(amount);
    if (!invoice_id) return NextResponse.json({ success: false, error: 'invoice_id erforderlich' }, { status: 400 });
    if (!betrag || betrag <= 0) return NextResponse.json({ success: false, error: 'Betrag muss größer als 0 sein.' }, { status: 400 });

    // Atomar in der Datenbank (Phase 129): Zeilensperre auf der Rechnung, offener Betrag nach Gutschriften, Buchung und Status in EINER Transaktion.
    // Eine Wiederholung mit demselben Schlüssel (z. B. nach Netzwerkfehler) liefert das ursprüngliche Ergebnis und bucht nichts doppelt.
    const schluessel = (req.headers.get('idempotency-key') || (typeof request_key === 'string' ? request_key : '') || '').trim().slice(0, 100) || null;
    const rpc = await fetch(`${url}/rest/v1/rpc/faktura_zahlung_buchen`, {
      method: 'POST', headers,
      body: JSON.stringify({ p_invoice_id: invoice_id, p_amount: betrag, p_payment_date: payment_date || new Date().toISOString().slice(0, 10), p_note: note || null, p_request_key: schluessel }),
    });
    if (!rpc.ok) { const t = await rpc.text(); if (rpc.status === 404 || /PGRST202|Could not find the function/.test(t)) return migrationFehlt(); throw new Error(t); }
    const erg = await rpc.json();
    if (!erg?.ok) {
      switch (erg?.code) {
        case 'NICHT_GEFUNDEN': return NextResponse.json({ success: false, error: 'Rechnung nicht gefunden.' }, { status: 404 });
        case 'ZAHLUNG_AUF_STORNIERT': return NextResponse.json({ success: false, code: 'ZAHLUNG_AUF_STORNIERT', error: 'Auf eine stornierte Rechnung kann keine Zahlung gebucht werden. Bereits gebuchte Zahlungen bleiben im Verlauf erhalten.' }, { status: 409 });
        case 'KEY_KONFLIKT': return NextResponse.json({ success: false, code: 'KEY_KONFLIKT', error: 'Der Anfrageschlüssel wurde bereits mit anderen Angaben (Rechnung, Betrag oder Datum) verwendet.' }, { status: 422 });
        case 'UEBER_OFFEN': {
          const offen = Number(erg.offen) || 0; const gs = Number(erg.gutschrift) || 0;
          return NextResponse.json({
            success: false, code: 'UEBER_OFFEN',
            error: `Zahlung würde den offenen Betrag übersteigen (offen: ${offen.toFixed(2)} €${gs > 0 ? `, nach Gutschriften über ${gs.toFixed(2)} €` : ''}). Bei Überzahlung bitte den übersteigenden Betrag separat klären (z. B. Rückzahlung).`,
          }, { status: 400 });
        }
        default: return NextResponse.json({ success: false, error: 'Zahlung konnte nicht gebucht werden.' }, { status: 400 });
      }
    }
    return NextResponse.json({ success: true, paid_amount: Number(erg.paid_amount), vollstaendig_bezahlt: !!erg.vollstaendig_bezahlt, wiederholt: !!erg.wiederholt });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  const role = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });

    // Atomar (Phase 129): Zahlung entfernen, paid_amount und Status nach der Forderung (Gutschriften berücksichtigt); stornierte Rechnungen bleiben storniert
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ success: false, error: 'id ungültig' }, { status: 400 });
    const rpc = await fetch(`${url}/rest/v1/rpc/faktura_zahlung_loeschen`, { method: 'POST', headers, body: JSON.stringify({ p_payment_id: id }) });
    if (!rpc.ok) { const t = await rpc.text(); if (rpc.status === 404 || /PGRST202|Could not find the function/.test(t)) return migrationFehlt(); throw new Error(t); }
    const erg = await rpc.json();
    if (!erg?.ok) return NextResponse.json({ success: false, error: 'Zahlung nicht gefunden.' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
