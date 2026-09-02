import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Kunden-API (Kundenstamm, Phase 18-Tabelle)
//
// GET    → alle Kunden (alphabetisch)
// POST   → Kunde anlegen (Pflicht: name)
// PATCH  → Kunde bearbeiten (nur erlaubte Felder, Whitelist)
//
// Für admin UND disponent – darum eigene Route:
// /api/admin/data ist bewusst admin-only.
// Muster wie /api/invoices: Session-/Rollenprüfung über
// createClient, Daten über Supabase REST mit SERVICE_ROLE_KEY.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  'apikey': key,
  'Authorization': `Bearer ${key}`,
};

const ROLES = ['admin', 'disponent'];

// Felder, die angelegt / geändert werden dürfen (Whitelist)
const FELDER = ['name', 'contact_person', 'email', 'phone', 'street', 'zip', 'city', 'notes', 'is_active'];

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

function emailOk(email: any): boolean {
  if (email == null || email === '') return true; // leer ist erlaubt
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email));
}

// ─── GET: alle Kunden laden ───
export async function GET(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const query = id
      ? `id=eq.${id}&select=id,name,contact_person,email,phone,street,zip,city,notes,is_active,created_at`
      : `select=id,name,contact_person,email,phone,street,zip,city,notes,is_active,created_at&order=name`;
    const res = await fetch(`${url}/rest/v1/customers?${query}`, { headers });
    if (!res.ok) {
      const t = await res.text();
      // Tabelle fehlt (ältere Instanz ohne Phase-18-Migration)?
      if (res.status === 404 || t.includes('customers')) {
        return NextResponse.json(
          { success: false, error: 'KUNDENSTAMM_MIGRATION_FEHLT', detail: t },
          { status: 409 }
        );
      }
      throw new Error(t);
    }
    const rows = await res.json();
    return NextResponse.json({ success: true, kunden: rows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── POST: Kunde anlegen ───
export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const clean: Record<string, any> = {};
    for (const f of FELDER) {
      if (body[f] !== undefined && f !== 'is_active') clean[f] = body[f];
    }
    if (!clean.name || !String(clean.name).trim()) {
      return NextResponse.json({ success: false, error: 'Name ist Pflicht.' }, { status: 400 });
    }
    clean.name = String(clean.name).trim();
    if (!emailOk(clean.email)) {
      return NextResponse.json({ success: false, error: 'E-Mail-Adresse ungültig.' }, { status: 400 });
    }

    const res = await fetch(`${url}/rest/v1/customers`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(clean),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    return NextResponse.json({ success: true, kunde: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── PATCH: Kunde bearbeiten ───
export async function PATCH(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }
  try {
    const { id, updates } = await req.json();
    if (!id) {
      return NextResponse.json({ success: false, error: 'id fehlt' }, { status: 400 });
    }
    const clean: Record<string, any> = {};
    for (const f of FELDER) {
      if (updates && updates[f] !== undefined) clean[f] = updates[f];
    }
    if (clean.name !== undefined && !String(clean.name).trim()) {
      return NextResponse.json({ success: false, error: 'Name darf nicht leer sein.' }, { status: 400 });
    }
    if (!emailOk(clean.email)) {
      return NextResponse.json({ success: false, error: 'E-Mail-Adresse ungültig.' }, { status: 400 });
    }
    if (Object.keys(clean).length === 0) {
      return NextResponse.json({ success: false, error: 'Keine erlaubten Felder dabei.' }, { status: 400 });
    }
    clean.updated_at = new Date().toISOString();

    const res = await fetch(`${url}/rest/v1/customers?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(clean),
    });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    if (!rows?.length) {
      return NextResponse.json({ success: false, error: 'Kunde nicht gefunden.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, kunde: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
