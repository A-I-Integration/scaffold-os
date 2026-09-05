import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Teilzahlungen (Phase 38)
//
// GET  ?invoice_id=... → Zahlungshistorie einer Rechnung
// POST { invoice_id, amount, payment_date?, note? } → Zahlung erfassen
//      (voll oder teilweise – rechnet paid_amount hoch, setzt status
//      erst bei vollständigem Ausgleich auf "bezahlt")
// DELETE ?id=... → einzelne (fehlerhafte) Zahlung stornieren
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

export async function GET(req: NextRequest) {
  const role = await callerRole();
  if (!role) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get('invoice_id');
    if (!invoiceId) return NextResponse.json({ success: false, error: 'invoice_id erforderlich' }, { status: 400 });

    const res = await fetch(`${url}/rest/v1/invoice_payments?invoice_id=eq.${invoiceId}&select=*&order=payment_date.desc`, { headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, payments: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }

  try {
    const { invoice_id, amount, payment_date, note } = await req.json();
    const betrag = Number(amount);
    if (!invoice_id) return NextResponse.json({ success: false, error: 'invoice_id erforderlich' }, { status: 400 });
    if (!betrag || betrag <= 0) return NextResponse.json({ success: false, error: 'Betrag muss größer als 0 sein.' }, { status: 400 });

    const invRes = await fetch(`${url}/rest/v1/invoices?id=eq.${invoice_id}&select=gross_amount,paid_amount,status`, { headers });
    if (!invRes.ok) throw new Error(await invRes.text());
    const invRows = await invRes.json();
    const inv = invRows?.[0];
    if (!inv) return NextResponse.json({ success: false, error: 'Rechnung nicht gefunden.' }, { status: 404 });
    if (inv.status === 'storniert') return NextResponse.json({ success: false, error: 'Stornierte Rechnungen können nicht mit Zahlungen versehen werden.' }, { status: 400 });

    const neuerBezahlterBetrag = Math.round((Number(inv.paid_amount) + betrag) * 100) / 100;
    if (neuerBezahlterBetrag - Number(inv.gross_amount) > 0.01) {
      return NextResponse.json({
        success: false,
        error: `Zahlung würde den Rechnungsbetrag übersteigen (offen: ${(Number(inv.gross_amount) - Number(inv.paid_amount)).toFixed(2)} €). Bei Überzahlung bitte den übersteigenden Betrag separat klären (z. B. Gutschrift oder Rückzahlung).`,
      }, { status: 400 });
    }

    // Zahlung protokollieren
    const payRes = await fetch(`${url}/rest/v1/invoice_payments`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ invoice_id, amount: betrag, payment_date: payment_date || new Date().toISOString().slice(0, 10), note: note || null }),
    });
    if (!payRes.ok) throw new Error(await payRes.text());

    // Rechnung aktualisieren: paid_amount hochzählen, Status nur bei
    // vollständigem Ausgleich auf "bezahlt" setzen.
    const vollstaendigBezahlt = Number(inv.gross_amount) - neuerBezahlterBetrag <= 0.01;
    const invUpdRes = await fetch(`${url}/rest/v1/invoices?id=eq.${invoice_id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({
        paid_amount: neuerBezahlterBetrag,
        status: vollstaendigBezahlt ? 'bezahlt' : (inv.status === 'bezahlt' ? 'offen' : inv.status),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!invUpdRes.ok) throw new Error(await invUpdRes.text());

    return NextResponse.json({ success: true, paid_amount: neuerBezahlterBetrag, vollstaendig_bezahlt: vollstaendigBezahlt });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
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

    const payRes = await fetch(`${url}/rest/v1/invoice_payments?id=eq.${id}&select=invoice_id,amount`, { headers });
    if (!payRes.ok) throw new Error(await payRes.text());
    const payment = (await payRes.json())?.[0];
    if (!payment) return NextResponse.json({ success: false, error: 'Zahlung nicht gefunden.' }, { status: 404 });

    const invRes = await fetch(`${url}/rest/v1/invoices?id=eq.${payment.invoice_id}&select=gross_amount,paid_amount`, { headers });
    const inv = (await invRes.json())?.[0];

    await fetch(`${url}/rest/v1/invoice_payments?id=eq.${id}`, { method: 'DELETE', headers });

    if (inv) {
      const neuerBetrag = Math.max(0, Math.round((Number(inv.paid_amount) - Number(payment.amount)) * 100) / 100);
      const vollstaendig = Number(inv.gross_amount) - neuerBetrag <= 0.01;
      await fetch(`${url}/rest/v1/invoices?id=eq.${payment.invoice_id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ paid_amount: neuerBetrag, status: vollstaendig ? 'bezahlt' : 'offen' }),
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
