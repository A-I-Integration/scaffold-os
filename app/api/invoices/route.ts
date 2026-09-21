import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { trackImpact } from '@/lib/impact';
import { serverErrorResponse } from '@/lib/auth';

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

async function callerRole(): Promise<{ role: string | null; userId: string | null }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { role: null, userId: null };
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    return { role: profile?.role || null, userId: user.id };
  } catch {
    return { role: null, userId: null };
  }
}

// Phase 27: Pflicht-Verknüpfung Prüfung/Freigabe → Rechnung.
// Prüft, ob für dieses Projekt ein Dokumentationseintrag
// "Prüfung/Freigabe" mit freigegeben = true existiert.
async function hatFreigabe(projectId: string): Promise<boolean> {
  const res = await fetch(
    `${url}/rest/v1/project_events?project_id=eq.${projectId}&type=eq.pruefung_freigabe&select=pruefung_details`,
    { headers }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return rows.some((r: any) => r.pruefung_details?.freigegeben === true);
}

// ─── GET: alle Rechnungen laden ───
export async function GET() {
  const { role } = await callerRole();
  if (!role) {
    return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
  }
  try {
    const res = await fetch(
      `${url}/rest/v1/invoices?select=*&order=created_at.desc&limit=3000`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, invoices: rows });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

// ─── POST: Rechnung anlegen ───
export async function POST(req: NextRequest) {
  const { role, userId } = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, error: 'Nur Admin und Disposition dürfen Rechnungen anlegen.' },
      { status: 403 }
    );
  }
  try {
    const body = await req.json();
    const { project_id, customer_name, customer_address, positions, tax_rate, invoice_date, due_date, notes, invoice_type, reference_invoice_number, override_grund, customer_id: customerIdBody } = body;

    if (!customer_name) {
      return NextResponse.json({ success: false, error: 'Kundenname erforderlich.' }, { status: 400 });
    }
    if (!Array.isArray(positions) || positions.length === 0) {
      return NextResponse.json({ success: false, error: 'Mindestens eine Position erforderlich.' }, { status: 400 });
    }

    // Phase 27: Pflicht-Verknüpfung Prüfung/Freigabe → Rechnung. Gilt für JEDE
    // Rechnung zu einem Projekt (auch Zusatzrechnung, Mahnung-Auslöser, Gutschrift),
    // ausnahmslos – außer Admin ODER Disponent überschreibt es bewusst mit Begründung.
    const OVERRIDE_ROLES = ['admin', 'disponent'];
    let overrideVerwendet = false;
    if (project_id) {
      const freigegeben = await hatFreigabe(project_id);
      if (!freigegeben) {
        if (role && OVERRIDE_ROLES.includes(role) && override_grund && String(override_grund).trim()) {
          overrideVerwendet = true;
        } else if (role && OVERRIDE_ROLES.includes(role)) {
          return NextResponse.json({
            success: false,
            error: 'Für dieses Projekt liegt keine freigegebene Prüfung/Freigabe vor. Du kannst das mit Begründung überschreiben (override_grund).',
            code: 'FREIGABE_FEHLT_OVERRIDE_MOEGLICH',
          }, { status: 409 });
        } else {
          return NextResponse.json({
            success: false,
            error: 'Für dieses Projekt liegt keine freigegebene Prüfung/Freigabe vor. Bitte zuerst im Dokumentation-Modul dokumentieren, oder Admin/Disposition um eine begründete Überschreibung bitten.',
            code: 'FREIGABE_FEHLT',
          }, { status: 409 });
        }
      }
    }

    const istGutschrift = invoice_type === 'gutschrift';

    // Beträge serverseitig rechnen (Vertrauen ist gut, § 14 ist besser)
    // Bei Gutschriften: Positionen werden positiv erfasst (z.B. "Rabatt 200€"),
    // aber als Beleg mit negativem Betrag gebucht – so wirkt sie korrekt auf
    // die offene Summe und ist als Korrektur erkennbar (§14 UStG).
    const vorzeichen = istGutschrift ? -1 : 1;
    const net = vorzeichen * positions.reduce(
      (s: number, p: any) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0),
      0
    );
    const rate = tax_rate != null ? Number(tax_rate) : 19;
    const tax = Math.round(net * rate) / 100;
    const gross = Math.round((net + tax) * 100) / 100;
    const netRounded = Math.round(net * 100) / 100;

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

    // NEU (Phase 34): echte Kunde-Verknüpfung statt reinem Namensvergleich.
    // Direkt übergebene customer_id hat Vorrang; sonst vom verknüpften
    // Projekt übernehmen, falls dort eine hinterlegt ist.
    let customerId = customerIdBody || null;
    if (!customerId && project_id) {
      try {
        const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${project_id}&select=customer_id`, { headers });
        if (pRes.ok) customerId = (await pRes.json())?.[0]?.customer_id || null;
      } catch { /* optional */ }
    }

    // FIX (Bug-Report, Phase 93): Nummernvergabe UND Insert liefen bisher
    // als zwei getrennte Requests (erst next_invoice_number, dann POST
    // /invoices) - schlug der Insert fehl, war die Nummer schon vergeben:
    // Lücke im GoBD-Nummernkreis. Jetzt EIN einziger RPC-Aufruf
    // (create_invoice, supabase/phase-93-rechnung-atomar.sql), der
    // Nummernvergabe + Insert in derselben Transaktion macht - schlägt
    // der Insert fehl, wird die Nummer mit zurückgerollt statt zu
    // verbrennen.
    const resolvedInvoiceType = ['standard', 'abschlag', 'schluss', 'gutschrift'].includes(invoice_type)
      ? invoice_type
      : 'standard';
    // FIX (Bug-Report): due_date wurde bisher, wenn nicht explizit mitgeschickt
    // (z.B. beim automatischen "Rechnung erstellen" in Aufmaß-Schritt 6, das
    // nie ein due_date sendet), als null gespeichert. fmtDate() zeigt für
    // null nur "–" an – die Rechnung (PDF und Versand-E-Mail) hatte dann gar
    // kein Zahlungsziel. Gleicher Standard wie im manuellen Rechnungsformular
    // (/rechnungen, dort clientseitig vorbelegt): Rechnungsdatum + 14 Tage,
    // wenn kein due_date übergeben wurde.
    const resolvedInvoiceDate = invoice_date || new Date().toISOString().slice(0, 10);
    const resolvedDueDate = due_date || (() => {
      const d = new Date(resolvedInvoiceDate + 'T00:00:00');
      d.setDate(d.getDate() + 14);
      return d.toISOString().slice(0, 10);
    })();

    const res = await fetch(`${url}/rest/v1/rpc/create_invoice`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        p_prefix: istGutschrift ? 'GS' : 'RE',
        p_project_id: project_id || null,
        p_customer_id: customerId,
        p_customer_name: customer_name,
        p_customer_address: customer_address || null,
        p_positions: positions,
        p_net_amount: netRounded,
        p_tax_rate: rate,
        p_tax_amount: tax,
        p_gross_amount: gross,
        p_invoice_date: resolvedInvoiceDate,
        p_due_date: resolvedDueDate,
        p_notes: notes || null,
        p_company_snapshot: companySnapshot,
        // Phase 15-Fix: Rechnungstyp wirklich speichern (wurde bisher
        // zwar aus dem Request gelesen, aber nicht in die Datenbank
        // geschrieben – jede Rechnung landete als 'standard')
        // Phase 22: 'gutschrift' als vierter, eigener Typ.
        p_invoice_type: resolvedInvoiceType,
        // Phase 35: reference_invoice_number jetzt auch für normale Rechnungen
        // erlaubt – für "Neue Version ersetzt alte Rechnung" (siehe unten),
        // nicht mehr nur für Gutschriften.
        p_reference_invoice_number: reference_invoice_number || null,
      }),
    });
    if (!res.ok) throw new Error(await res.text());

    // create_invoice gibt eine einzelne invoices-Zeile zurück. PostgREST
    // liefert das Ergebnis einer RPC, die eine einzelne Tabellenzeile
    // zurückgibt, je nach Konfiguration entweder als Array mit einem
    // Element oder als einzelnes Objekt - beide Formen werden hier
    // akzeptiert, statt eine davon zu erraten.
    const rpcResult = await res.json();
    const invoiceRow = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    if (!invoiceRow?.id) throw new Error('Rechnung wurde angelegt, aber die Antwort der Datenbank hatte ein unerwartetes Format.');
    const rows = [invoiceRow]; // ab hier wie zuvor: rows[0] = angelegte Rechnung
    const invoiceNumber = invoiceRow.invoice_number;

    // Phase 27: Admin-Überschreibung protokollieren
    if (overrideVerwendet && rows[0]?.id) {
      try {
        await fetch(`${url}/rest/v1/invoice_freigabe_override`, {
          method: 'POST', headers,
          body: JSON.stringify({
            invoice_id: rows[0].id, project_id, admin_id: userId, grund: String(override_grund).trim(),
          }),
        });
      } catch { /* Protokoll-Fehler darf die erfolgreiche Rechnung nicht rückgängig machen */ }
    }

    // Phase 17: Impact-Tracking (blockiert nie, Fehler nur geloggt)
    await trackImpact('rechnung', gross, 'eur', {
      invoice_number: invoiceNumber,
      invoice_type: rows[0]?.invoice_type || 'standard',
    });

    return NextResponse.json({ success: true, invoice: rows[0], override_verwendet: overrideVerwendet });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

// ─── PATCH: Status ändern ───
export async function PATCH(req: NextRequest) {
  const { role } = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, error: 'Nur Admin und Disposition dürfen Rechnungen ändern.' },
      { status: 403 }
    );
  }
  try {
    const body = await req.json();
    const { id, status, reminder_level, notes, paid_amount } = body;

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
    if (notes !== undefined) patch.notes = notes;
    // NEU (Phase 38): paid_amount – reflektiert den tatsächlichen Zahlungs-
    // eingang, kein Eingriff in den ursprünglich ausgestellten Rechnungs-
    // inhalt (Positionen/Beträge bleiben unveränderbar, siehe oben).
    if (paid_amount != null) patch.paid_amount = Number(paid_amount);
    if (!status && reminder_level == null && notes === undefined && paid_amount == null) {
      return NextResponse.json({ success: false, error: 'Nichts zu ändern.' }, { status: 400 });
    }
    // Phase 35 (GoBD): Positionen/Beträge einer bereits ausgestellten Rechnung
    // werden absichtlich NICHT mehr per PATCH änderbar gemacht – eine Rechnung
    // muss nach Erstellung unveränderbar bleiben. Änderungen laufen jetzt über
    // "Neue Version anlegen" (POST einer neuen Rechnung mit Bezug + diese hier
    // auf "storniert" setzen), siehe Kunden-Detail.

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
    return serverErrorResponse(err);
  }
}

// ─── DELETE: Rechnung löschen (nur solange „offen") ───
export async function DELETE(req: NextRequest) {
  const { role } = await callerRole();
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
    return serverErrorResponse(err);
  }
}
