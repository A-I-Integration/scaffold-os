import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { ladeBelegForderung } from '@/lib/forderung-server';

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
    const { invoice_id, amount, payment_date, note } = await req.json();
    const betrag = Number(amount);
    if (!invoice_id) return NextResponse.json({ success: false, error: 'invoice_id erforderlich' }, { status: 400 });
    if (!betrag || betrag <= 0) return NextResponse.json({ success: false, error: 'Betrag muss größer als 0 sein.' }, { status: 400 });

    const invRes = await fetch(`${url}/rest/v1/invoices?id=eq.${invoice_id}&select=id,invoice_number,invoice_type,due_date,gross_amount,paid_amount,status`, { headers });
    if (!invRes.ok) throw new Error(await invRes.text());
    const invRows = await invRes.json();
    const inv = invRows?.[0];
    if (!inv) return NextResponse.json({ success: false, error: 'Rechnung nicht gefunden.' }, { status: 404 });
    if (inv.status === 'storniert') return NextResponse.json({ success: false, code: 'ZAHLUNG_AUF_STORNIERT', error: 'Auf eine stornierte Rechnung kann keine Zahlung gebucht werden. Bereits gebuchte Zahlungen bleiben im Verlauf erhalten.' }, { status: 409 });

    const neuerBezahlterBetrag = Math.round((Number(inv.paid_amount) + betrag) * 100) / 100;
    // Zulässig ist höchstens der noch offene Betrag NACH Gutschriften (zentral, unabhängig von Baustelle/Ansicht); Lesefehler → nichts buchen
    const forderung = await ladeBelegForderung({ url, headers }, inv);
    if (!forderung) throw new Error('Gutschriften zur Rechnung nicht lesbar');
    if (betrag - forderung.offen > 0.01) {
      return NextResponse.json({
        success: false,
        error: `Zahlung würde den offenen Betrag übersteigen (offen: ${forderung.offen.toFixed(2)} €${forderung.gutschrift > 0 ? `, nach Gutschriften über ${forderung.gutschrift.toFixed(2)} €` : ''}). Bei Überzahlung bitte den übersteigenden Betrag separat klären (z. B. Rückzahlung).`,
      }, { status: 400 });
    }

    // Rechnung zuerst aktualisieren – nur, wenn der bezahlte Betrag seit dem Lesen unverändert ist.
    // So gehen zwei gleichzeitige Zahlungen nicht verloren (die zweite bekommt eine Meldung statt den Betrag zu überschreiben).
    // Status wird nur bei vollständigem Ausgleich auf "bezahlt" gesetzt.
    const vollstaendigBezahlt = forderung.offen - betrag <= 0.01;
    const invUpdRes = await fetch(`${url}/rest/v1/invoices?id=eq.${invoice_id}&status=neq.storniert&paid_amount=eq.${Number(inv.paid_amount)}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        paid_amount: neuerBezahlterBetrag,
        status: vollstaendigBezahlt ? 'bezahlt' : (inv.status === 'bezahlt' ? 'offen' : inv.status),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!invUpdRes.ok) throw new Error(await invUpdRes.text());
    if (!(await invUpdRes.json()).length) {
      return NextResponse.json({ success: false, error: 'Die Rechnung wurde gerade geändert (andere Buchung oder Storno). Bitte die Seite neu laden und erneut prüfen.' }, { status: 409 });
    }

    // Zahlung protokollieren; schlägt das fehl, wird der Betrag der Rechnung zurückgesetzt
    const payRes = await fetch(`${url}/rest/v1/invoice_payments`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ invoice_id, amount: betrag, payment_date: payment_date || new Date().toISOString().slice(0, 10), note: note || null }),
    });
    if (!payRes.ok) {
      await fetch(`${url}/rest/v1/invoices?id=eq.${invoice_id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ paid_amount: Number(inv.paid_amount), status: inv.status }),
      }).catch(() => {});
      throw new Error(await payRes.text());
    }

    // Nachprüfung gegen gleichzeitig angelegte Gutschriften: wurde zwischen Lesen und Buchen eine Gutschrift gespeichert, die den Rest deckt,
    // wird der Status hier nachgezogen (der Gegenpart, das Anlegen einer Gutschrift, gleicht seinerseits nach – wer zuletzt committet, sieht beides).
    let bezahltStatus = vollstaendigBezahlt;
    if (!vollstaendigBezahlt && inv.status !== 'storniert') {
      const nach = await ladeBelegForderung({ url, headers }, inv, neuerBezahlterBetrag);
      if (nach && nach.offen <= 0.01) {
        const sr = await fetch(`${url}/rest/v1/invoices?id=eq.${invoice_id}&status=in.(offen,ueberfaellig)`, {
          method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({ status: 'bezahlt', updated_at: new Date().toISOString() }),
        });
        bezahltStatus = sr.ok && ((await sr.json()) || []).length > 0;
      }
    }

    return NextResponse.json({ success: true, paid_amount: neuerBezahlterBetrag, vollstaendig_bezahlt: bezahltStatus });
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

    const payRes = await fetch(`${url}/rest/v1/invoice_payments?id=eq.${id}&select=invoice_id,amount`, { headers });
    if (!payRes.ok) throw new Error(await payRes.text());
    const payment = (await payRes.json())?.[0];
    if (!payment) return NextResponse.json({ success: false, error: 'Zahlung nicht gefunden.' }, { status: 404 });

    // FIX (Bug-Report, Phase 94, "Punkt 4"): status wurde hier bisher nicht
    // mitgeladen, das PATCH unten hat 'bezahlt'/'offen' aber UNBEDINGT
    // gesetzt - wurde die Zahlung einer bereits stornierten Rechnung
    // gelöscht (z.B. Korrektur einer Fehlbuchung), sprang der Status
    // stillschweigend von 'storniert' zurück auf 'offen'/'bezahlt'. Jetzt:
    // status wird mitgeladen, und die PATCH setzt status nur, wenn die
    // Rechnung aktuell NICHT storniert ist - 'storniert' bleibt geschützt.
    const invRes = await fetch(`${url}/rest/v1/invoices?id=eq.${payment.invoice_id}&select=id,invoice_number,invoice_type,due_date,gross_amount,paid_amount,status`, { headers });
    const inv = (await invRes.json())?.[0];

    await fetch(`${url}/rest/v1/invoice_payments?id=eq.${id}`, { method: 'DELETE', headers });

    if (inv) {
      const neuerBetrag = Math.max(0, Math.round((Number(inv.paid_amount) - Number(payment.amount)) * 100) / 100);
      // Status nach der zentralen Forderung (Gutschriften berücksichtigt); nicht lesbar → Status unverändert lassen statt zu raten
      // Für die Neuberechnung zählt die verbleibende Zahlungssumme, nicht der bisherige Status „bezahlt“
      const fNeu = await ladeBelegForderung({ url, headers }, { ...inv, status: inv.status === 'bezahlt' ? 'offen' : inv.status }, neuerBetrag);
      const vollstaendig = fNeu ? fNeu.offen <= 0.01 : inv.status === 'bezahlt';
      const patchBody: Record<string, any> = { paid_amount: neuerBetrag };
      if (inv.status !== 'storniert') {
        patchBody.status = vollstaendig ? 'bezahlt' : 'offen';
      }
      await fetch(`${url}/rest/v1/invoices?id=eq.${payment.invoice_id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify(patchBody),
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
