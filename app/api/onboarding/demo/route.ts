import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Onboarding: Demo-Daten laden (Phase 16)
//
// POST → Legt Beispiel-Daten an (Fahrzeug, Fahrer, Lagerartikel,
//        Demo-Projekt), damit neue Kunden die App gefüllt sehen.
//        NUR Admin. Mehrfach-Aufruf ist sicher: Bereits vorhandene
//        Demo-Daten (am Präfix "DEMO-" erkennbar) werden übersprungen.
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

    return NextResponse.json({
      success: true,
      angelegt,
      schonVorhanden: angelegt.length === 0,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
