import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { trackImpact } from '@/lib/impact';

// ============================================================
// SCAFFOLD OS – Rechnungen API (Phase 13: Rechnungsmodul)
//
// GET    → alle Rechnungen (neueste zuerst)
// POST   → Rechnung anlegen (Rechnungsnummer automatisch per
//          Datenbank-Funktion next_invoice_number → RE-2026-0001 …)
// PATCH  → Status ändern (offen / bezahlt / ueberfaellig / storniert)
// DELETE → Rechnung löschen (nur wenn noch „offen")
//
// Muster wie /api/projects: Session-/Rollenprüfung über createClient,
// Daten über Supabase REST mit SERVICE_ROLE_KEY.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  'apikey': key,
  'Authorization': `Bearer ${key}`,
};

const WRITE_ROLES = ['admin', 'disponent'];

async function callerRole(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    return profile?.role || null;
  } catch {
    return null;
  }
}

// ─── GET: alle Rechnungen laden ───
export async function GET() {
  const role = await callerRole();
  if (!role) {
    return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
  }
  try {
    const res = await fetch(
      `${url}/rest/v1/invoices?select=*&order=created_at.desc`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, invoices: rows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── POST: Rechnung anlegen ───
export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, error: 'Nur Admin und Disposition dürfen Rechnungen anlegen.' },
      { status: 403 }
    );
  }
  try {
    const body = await req.json();
    const { project_id, customer_name, customer_address, positions, tax_rate, invoice_date, due_date, notes, invoice_type } = body;

    if (!customer_name) {
      return NextResponse.json({ success: false, error: 'Kundenname erforderlich.' }, { status: 400 });
    }
    if (!Array.isArray(positions) || positions.length === 0) {
      return NextResponse.json({ success: false, error: 'Mindestens eine Position erforderlich.' }, { status: 400 });
    }

    // Beträge serverseitig rechnen (Vertrauen ist gut, § 14 ist besser)
    const net = positions.reduce(
      (s: number, p: any) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0),
      0
    );
    const rate = tax_rate != null ? Number(tax_rate) : 19;
    const tax = Math.round(net * rate) / 100;
    const gross = Math.round((net + tax) * 100) / 100;
    const netRounded = Math.round(net * 100) / 100;

    // Fortlaufende Rechnungsnummer aus der Datenbank holen
    const numRes = await fetch(`${url}/rest/v1/rpc/next_invoice_number`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    if (!numRes.ok) throw new Error('Rechnungsnummer: ' + (await numRes.text()));
    const invoiceNumber = await numRes.json();

    // Phase 14: Firmen-Snapshot für die Rechnung (GoBD – die Rechnung
    // muss die zum Ausstellungszeitpunkt gültigen Firmendaten zeigen)
    let companySnapshot: any = null;
    try {
      const cRes = await fetch(
        `${url}/rest/v1/company_settings?id=eq.00000000-0000-0000-0000-000000000001&select=*`,
        { headers }
      );
      if (cRes.ok) {
        const cRows = await cRes.json();
        companySnapshot = cRows?.[0] || null;
      }
    } catch { /* Snapshot optional – Rechnung geht auch ohne */ }

    const res = await fetch(`${url}/rest/v1/invoices`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        invoice_number: invoiceNumber,
        project_id: project_id || null,
        customer_name,
        customer_address: customer_address || null,
        positions,
        net_amount: netRounded,
        tax_rate: rate,
        tax_amount: tax,
        gross_amount: gross,
        status: 'offen',
        invoice_date: invoice_date || new Date().toISOString().slice(0, 10),
        due_date: due_date || null,
        notes: notes || null,
        company_snapshot: companySnapshot,
        // Phase 15-Fix: Rechnungstyp wirklich speichern (wurde bisher
        // zwar aus dem Request gelesen, aber nicht in die Datenbank
        // geschrieben – jede Rechnung landete als 'standard')
        invoice_type: ['standard', 'abschlag', 'schluss'].includes(invoice_type)
          ? invoice_type
          : 'standard',
      }),
    });
    if (!res.ok) throw new Error(await res.text());

    const rows = await res.json();

    // Phase 17: Impact-Tracking (blockiert nie, Fehler nur geloggt)
    await trackImpact('rechnung', gross, 'eur', {
      invoice_number: invoiceNumber,
      invoice_type: rows[0]?.invoice_type || 'standard',
    });

    return NextResponse.json({ success: true, invoice: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── PATCH: Status ändern ───
export async function PATCH(req: NextRequest) {
  const role = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, error: 'Nur Admin und Disposition dürfen Rechnungen ändern.' },
      { status: 403 }
    );
  }
  try {
    const body = await req.json();
    const { id, status, reminder_level } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
    }
    if (status && !['offen', 'bezahlt', 'ueberfaellig', 'storniert'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Ungültiger Status.' },
        { status: 400 }
      );
    }

    // NEU (Phase 15): Mahnstufe 0–2 neben Status änderbar
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (status) patch.status = status;
    if (reminder_level != null) {
      const rl = Number(reminder_level);
      if (![0, 1, 2].includes(rl)) {
        return NextResponse.json({ success: false, error: 'Mahnstufe muss 0, 1 oder 2 sein.' }, { status: 400 });
      }
      patch.reminder_level = rl;
    }
    if (!status && reminder_level == null) {
      return NextResponse.json({ success: false, error: 'Nichts zu ändern (status oder reminder_level fehlt).' }, { status: 400 });
    }

    const res = await fetch(`${url}/rest/v1/invoices?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await res.text());

    const rows = await res.json();
    if (!rows?.length) {
      return NextResponse.json({ success: false, error: 'Rechnung nicht gefunden.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, invoice: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── DELETE: Rechnung löschen (nur solange „offen") ───
export async function DELETE(req: NextRequest) {
  const role = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, error: 'Nur Admin und Disposition dürfen Rechnungen löschen.' },
      { status: 403 }
    );
  }
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
    }

    // Stornieren statt Löschen, sobald gebucht/versendet (GoBD!)
    const check = await fetch(`${url}/rest/v1/invoices?id=eq.${id}&select=status`, { headers });
    if (!check.ok) throw new Error(await check.text());
    const rows = await check.json();
    if (!rows?.length) {
      return NextResponse.json({ success: false, error: 'Rechnung nicht gefunden.' }, { status: 404 });
    }
    if (rows[0].status !== 'offen') {
      return NextResponse.json(
        { success: false, error: 'Nur offene Rechnungen können gelöscht werden. Bereits versendete oder bezahlte Rechnungen bitte stornieren (GoBD).' },
        { status: 409 }
      );
    }

    const res = await fetch(`${url}/rest/v1/invoices?id=eq.${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
