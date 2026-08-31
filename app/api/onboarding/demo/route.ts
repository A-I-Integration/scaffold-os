import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Onboarding: Demo-Daten laden (Phase 16)
//
// POST → Legt Beispiel-Daten an (Fahrzeug, Fahrer, Lagerartikel,
//        System-Lagerartikel RA-001…, Mitarbeiter, Kunden, Demo-
//        Projekt + Beispiel-Rechnung), damit neue Kunden die App
//        gefüllt sehen. NUR Admin. Mehrfach-Aufruf ist sicher:
//        Bereits vorhandene Demo-Daten (am Präfix "DEMO-" bzw. an
//        den System-SKUs erkennbar) werden übersprungen. Einzelne
//        Blöcke scheitern still (fehler-Array), wenn auf einer
//        älteren Instanz eine Tabelle noch nicht existiert.
//
// Muster: Session-Check über createClient, Daten über Supabase
// REST mit SERVICE_ROLE_KEY.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  'apikey': key,
  'Authorization': `Bearer ${key}`,
};

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

async function restGet(table: string, query: string): Promise<any[]> {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, { headers });
  if (!res.ok) throw new Error(`${table}: ${await res.text()}`);
  return res.json();
}

async function restPost(table: string, rows: any[]): Promise<void> {
  if (!rows.length) return;
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${table}: ${await res.text()}`);
}

export async function POST() {
  const role = await callerRole();
  if (role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Nur Admin darf Demo-Daten laden.' },
      { status: 403 }
    );
  }

  try {
    const angelegt: string[] = [];
    const fehler: string[] = [];

    // ── Fahrzeug ──
    const vehicles = await restGet('vehicles', "license_plate=like.DEMO-*&select=id");
    if (!vehicles.length) {
      await restPost('vehicles', [{
        name: 'DEMO-Mercedes Sprinter',
        license_plate: 'DEMO-GS 100',
        status: 'verfuegbar',
      }]);
      angelegt.push('Fahrzeug');
    }

    // ── Fahrer ──
    const drivers = await restGet('drivers', "name=like.DEMO*&select=id");
    if (!drivers.length) {
      await restPost('drivers', [{ name: 'DEMO Max Mustermann' }]);
      angelegt.push('Fahrer');
    }

    // ── Lagerartikel ──
    const inv = await restGet('inventory', "sku=like.DEMO-*&select=id");
    if (!inv.length) {
      await restPost('inventory', [
        { sku: 'DEMO-RAHMEN', name: 'Stahlrahmen 2,00 m', category: 'Rahmen', quantity: 400, min_stock: 50, reorder_point: 100, unit: 'Stk', unit_price: 42.5 },
        { sku: 'DEMO-BELAG', name: 'Holzbelag 3,07 m', category: 'Beläge', quantity: 250, min_stock: 40, reorder_point: 80, unit: 'Stk', unit_price: 28.9 },
        { sku: 'DEMO-ANKER', name: 'Gerüstanker 40 cm', category: 'Anker', quantity: 800, min_stock: 100, reorder_point: 200, unit: 'Stk', unit_price: 3.2 },
        { sku: 'DEMO-NETZ', name: 'Schutznetz 3 x 10 m', category: 'Zubehör', quantity: 60, min_stock: 10, reorder_point: 20, unit: 'Stk', unit_price: 18.5 },
      ]);
      angelegt.push('Lagerartikel');
    }

    // ── Demo-Projekt ──
    const projects = await restGet('projects', "name=like.DEMO*&select=id");
    if (!projects.length) {
      await restPost('projects', [{
        name: 'DEMO Fassadengerüst Musterstraße 12',
        adresse: 'Musterstraße 12, 60311 Frankfurt am Main',
        status: 'active',
        data: {
          stepData: {
            kunde: 'DEMO Bauherr GmbH',
            laenge: 20, hoehe: 8, breite: 2.5,
            geruesttyp: 'Fassadengerüst', dauer: 4,
          },
          angebotsStatus: 'erstellt',
        },
      }]);
      angelegt.push('Projekt');
    }

    // ── Mitarbeiter (mit Stundensätzen für die Kalkulation) ──
    // Eigener try/catch je Block: Fehlt auf einer älteren Instanz
    // eine Tabelle, laufen die übrigen Blöcke trotzdem weiter.
    try {
      const emps = await restGet('employees', "last_name=like.DEMO*&select=id");
      if (!emps.length) {
        await restPost('employees', [
          { first_name: 'DEMO', last_name: 'DEMO Vorarbeiter', role: 'vorarbeiter', hourly_rate: 38.5, status: 'active', weekly_hours: 40 },
          { first_name: 'DEMO', last_name: 'DEMO Monteur', role: 'monteur', hourly_rate: 32.0, status: 'active', weekly_hours: 40 },
        ]);
        angelegt.push('Mitarbeiter');
      }
    } catch { fehler.push('Mitarbeiter'); }

    // ── Kunden (Tabelle aus Phase-18-Migration, ggf. nicht vorhanden) ──
    try {
      const cust = await restGet('customers', "name=like.DEMO*&select=id");
      if (!cust.length) {
        await restPost('customers', [
          { name: 'DEMO Bauherr GmbH', contact_person: 'Hans Beispiel', email: 'demo-bauherr@example.com', phone: '069 123456', street: 'Musterstraße 12', zip: '60311', city: 'Frankfurt am Main' },
          { name: 'DEMO Stadtwerke Musterstadt', contact_person: 'Petra Muster', email: 'demo-stadtwerke@example.com', phone: '069 654321', street: 'Rathausplatz 1', zip: '60313', city: 'Frankfurt am Main' },
        ]);
        angelegt.push('Kunden');
      }
    } catch { fehler.push('Kunden'); }

    // ── Lagerartikel mit System-SKUs ──
    // RA-001, AB-001 … sind die festen Artikel-Codes der Kalkulation:
    // Nur mit diesen SKUs ziehen Lager-Stückpreise in Angebote.
    try {
      const sysInv = await restGet('inventory', "sku=eq.RA-001&select=id");
      if (!sysInv.length) {
        await restPost('inventory', [
          { sku: 'RA-001', name: 'Stahlrahmen 2,00 × 0,73 m', category: 'Rahmen', quantity: 400, min_stock: 50, reorder_point: 100, unit: 'Stk', unit_price: 42.5 },
          { sku: 'AB-001', name: 'Holzbelag 3,07 m', category: 'Beläge', quantity: 250, min_stock: 40, reorder_point: 80, unit: 'Stk', unit_price: 28.9 },
          { sku: 'DI-001', name: 'Diagonale 2,00 m', category: 'Versteifung', quantity: 300, min_stock: 40, reorder_point: 80, unit: 'Stk', unit_price: 12.8 },
          { sku: 'GE-001', name: 'Geländerholm 3,07 m', category: 'Geländer', quantity: 500, min_stock: 60, reorder_point: 120, unit: 'Stk', unit_price: 9.6 },
          { sku: 'AN-001', name: 'Gerüstanker 40 cm', category: 'Anker', quantity: 800, min_stock: 100, reorder_point: 200, unit: 'Stk', unit_price: 3.2 },
        ]);
        angelegt.push('System-Lagerartikel');
      }
    } catch { fehler.push('System-Lagerartikel'); }

    // ── Beispiel-Rechnung zum Demo-Projekt ──
    // Nummer über die DB-Funktion next_invoice_number (wie /api/invoices).
    try {
      const inv = await restGet('invoices', "customer_name=like.DEMO*&select=id");
      if (!inv.length) {
        const numRes = await fetch(`${url}/rest/v1/rpc/next_invoice_number`, {
          method: 'POST', headers, body: JSON.stringify({}),
        });
        if (!numRes.ok) throw new Error(await numRes.text());
        const invoiceNumber = await numRes.json();
        const positions = [
          { bezeichnung: 'Fassadengerüst 160 m² inkl. Auf- und Abbau', menge: 160, einheit: 'm²', einzelpreis: 9.9 },
          { bezeichnung: 'Anfahrt / Transportpauschale', menge: 1, einheit: 'psch', einzelpreis: 150 },
        ];
        const net = Math.round(positions.reduce((s, p) => s + p.menge * p.einzelpreis, 0) * 100) / 100;
        const tax = Math.round(net * 0.19 * 100) / 100;
        const heute = new Date().toISOString().slice(0, 10);
        const faellig = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        await restPost('invoices', [{
          invoice_number: invoiceNumber,
          customer_name: 'DEMO Bauherr GmbH',
          customer_address: 'Musterstraße 12, 60311 Frankfurt am Main',
          positions,
          net_amount: net,
          tax_rate: 19,
          tax_amount: tax,
          gross_amount: Math.round((net + tax) * 100) / 100,
          status: 'offen',
          invoice_date: heute,
          due_date: faellig,
          invoice_type: 'standard',
          notes: 'DEMO-Beispielrechnung',
        }]);
        angelegt.push('Rechnung');
      }
    } catch { fehler.push('Rechnung'); }

    return NextResponse.json({
      success: true,
      angelegt,
      fehler,
      schonVorhanden: angelegt.length === 0,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
