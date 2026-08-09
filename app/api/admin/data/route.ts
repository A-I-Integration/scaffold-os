import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Admin-API: Datenpflege
// • GET    → alle Bereiche auf einmal (Projekte, Lager, …)
// • PATCH  → Datensatz bearbeiten (nur erlaubte Felder!)
// • DELETE → Datensatz löschen (mit Tabellen-Whitelist)
//
// SICHERHEIT: Nur admin. Der Aufrufer wird über seine
// Session geprüft. Tabellen- und Feldnamen sind fest
// hinterlegt – frei erfunden werden kann nichts.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

// Welche Tabelle darf welche Felder ändern? (Whitelist)
const EDITABLE: Record<string, string[]> = {
  projects:         ['name', 'adresse', 'status'],
  inventory:        ['name', 'quantity', 'unit_price', 'min_stock', 'is_active'],
  transport_orders: ['quantity', 'status', 'priority'],
  tours:            ['name', 'planned_date', 'planned_start_time', 'status'],
  vehicles:         ['name', 'license_plate', 'is_active'],
  drivers:          ['name', 'is_active'],
};

// Prüft, ob der Aufrufer admin ist. null = ok, sonst Fehler-Response.
async function checkAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Nur für CEO/Admin' }, { status: 403 });
  }
  return null;
}

// ─── GET: Alle Bereiche laden ───
export async function GET() {
  const denied = await checkAdmin();
  if (denied) return denied;

  try {
    const [projects, inventory, transports, tours, vehicles, drivers] = await Promise.all([
      fetch(`${url}/rest/v1/projects?select=id,name,adresse,status,created_at&order=created_at.desc`, { headers }),
      fetch(`${url}/rest/v1/inventory?select=id,name,quantity,unit_price,min_stock,is_active&order=name`, { headers }),
      fetch(`${url}/rest/v1/transport_orders?select=id,quantity,status,priority,created_at,inventory:inventory_id(name),to_project:to_project_id(name)&order=created_at.desc`, { headers }),
      fetch(`${url}/rest/v1/tours?select=id,name,status,planned_date,planned_start_time,driver:driver_id(name),vehicle:vehicle_id(name)&order=planned_date.desc`, { headers }),
      fetch(`${url}/rest/v1/vehicles?select=id,name,license_plate,is_active&order=name`, { headers }),
      fetch(`${url}/rest/v1/drivers?select=id,name,is_active,employee:employee_id(first_name,last_name)&order=name`, { headers }),
    ]);

    for (const [i, res] of [projects, inventory, transports, tours, vehicles, drivers].entries()) {
      if (!res.ok) throw new Error(`Bereich ${i + 1}: ` + await res.text());
    }

    return NextResponse.json({
      success: true,
      projects: await projects.json(),
      inventory: await inventory.json(),
      transports: await transports.json(),
      tours: await tours.json(),
      vehicles: await vehicles.json(),
      drivers: await drivers.json(),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── PATCH: Datensatz bearbeiten ───
export async function PATCH(req: NextRequest) {
  const denied = await checkAdmin();
  if (denied) return denied;

  try {
    const { table, id, updates } = await req.json();
    const allowedFields = EDITABLE[table];
    if (!allowedFields) {
      return NextResponse.json({ success: false, error: 'Tabelle nicht erlaubt' }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID fehlt' }, { status: 400 });
    }

    // Nur erlaubte Felder durchlassen
    const clean: Record<string, any> = {};
    for (const f of allowedFields) {
      if (updates && updates[f] !== undefined) clean[f] = updates[f];
    }
    if (Object.keys(clean).length === 0) {
      return NextResponse.json({ success: false, error: 'Keine erlaubten Felder dabei' }, { status: 400 });
    }

    const res = await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(clean),
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, row: (await res.json())?.[0] || null });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── DELETE: Datensatz löschen ───
export async function DELETE(req: NextRequest) {
  const denied = await checkAdmin();
  if (denied) return denied;

  try {
    const { table, id } = await req.json();
    if (!EDITABLE[table]) {
      return NextResponse.json({ success: false, error: 'Tabelle nicht erlaubt' }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID fehlt' }, { status: 400 });
    }

    const res = await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const t = await res.text();
      // Häufigster Fall: Der Datensatz wird noch woanders benutzt (z.B. Projekt in einem Transport)
      if (t.includes('foreign key') || t.includes('violates')) {
        return NextResponse.json({
          success: false,
          error: 'Datensatz wird noch benutzt (z.B. in einer Tour oder einem Transport). Erst die abhängigen Einträge löschen.',
        }, { status: 409 });
      }
      throw new Error(t);
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
