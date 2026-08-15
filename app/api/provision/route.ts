import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runProvision, loadTenant } from '@/lib/provision/orchestrate';
import { deleteSupabaseProject } from '@/lib/provision/supabase-mgmt';
import { deleteVercelProject } from '@/lib/provision/vercel';
import { deleteUptimeMonitor } from '@/lib/provision/uptimerobot';

// ============================================================
// SCAFFOLD OS – Kunden-Setup-Paket: Provisionierungs-API
//
// POST   → Neuen Kunden anlegen  { company_name, slug, admin_email, admin_name? }
//          ODER fortsetzen       { id, resume: true }
// GET    → Alle Kunden + Status (für die Admin-Seite)
// DELETE → Kunde deprovisionieren { id }  (Supabase-Projekt +
//          Vercel-Projekt löschen, Registry-Eintrag bleibt als
//          „cancelled" zur Dokumentation erhalten)
//
// DOPPELTE ABSICHERUNG:
// 1) Läuft nur auf der MASTER-Instanz (Env-Var MASTER_INSTANCE=true).
//    Kunden-Deployments haben diese Variable nicht → 404.
// 2) Aufrufer muss eingeloggt sein und Rolle „admin" haben
//    (gleiches Session-Muster wie /api/admin/users).
// ============================================================

// Supabase-Projekt + erstes Deployment dauern zusammen 2–4 Minuten.
// Braucht auf Vercel einen Plan mit ausreichender Function-Laufzeit
// (Pro: bis 300 s). Bei Timeout: einfach „Fortsetzen" klicken.
export const maxDuration = 300;

const masterUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const masterKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const masterHeaders = {
  apikey: masterKey,
  Authorization: `Bearer ${masterKey}`,
  'Content-Type': 'application/json',
};

// Ist das hier die Master-Instanz? (Nur dort MASTER_INSTANCE=true setzen!)
function isMaster(): boolean {
  return process.env.MASTER_INSTANCE === 'true';
}

// Aufrufer-Prüfung: nur admin (gleiches Muster wie /api/admin/users)
async function checkCaller(): Promise<NextResponse | null> {
  try {
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
      return NextResponse.json({ success: false, error: 'Keine Berechtigung (nur CEO)' }, { status: 403 });
    }
    return null;
  } catch {
    return NextResponse.json({ success: false, error: 'Session-Prüfung fehlgeschlagen' }, { status: 401 });
  }
}

function slugValid(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug);
}

// Felder, die die Admin-Seite sehen darf (KEINE Service-Keys!)
const PUBLIC_FIELDS = 'id,slug,company_name,admin_email,admin_name,status,provision_step,error_message,subdomain,plan,created_at,updated_at';

// ─── POST: Kunde anlegen oder fortsetzen ───
export async function POST(req: NextRequest) {
  if (!isMaster()) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  const denied = await checkCaller();
  if (denied) return denied;

  try {
    const body = await req.json();

    // ── Fortsetzen nach Fehler/Timeout ──
    if (body.resume && body.id) {
      const tenant = await runProvision(body.id);
      return NextResponse.json({ success: true, tenant: stripSecrets(tenant) });
    }

    // ── Neu anlegen ──
    const { company_name, slug, admin_email, admin_name } = body;
    if (!company_name || !slug || !admin_email) {
      return NextResponse.json(
        { success: false, error: 'Firmenname, Subdomain (Slug) und Admin-E-Mail sind Pflicht.' },
        { status: 400 }
      );
    }
    if (!slugValid(slug)) {
      return NextResponse.json(
        { success: false, error: 'Slug ungültig: nur a–z, 0–9 und Bindestriche, 3–32 Zeichen (z. B. „muster-bau").' },
        { status: 400 }
      );
    }

    // Slug schon vergeben?
    const dup = await fetch(`${masterUrl}/rest/v1/tenants?slug=eq.${encodeURIComponent(slug)}&select=id,status`, { headers: masterHeaders });
    const dupRows = dup.ok ? await dup.json() : [];
    if (dupRows?.length && dupRows[0].status !== 'cancelled') {
      return NextResponse.json({ success: false, error: `Die Subdomain „${slug}" ist bereits vergeben.` }, { status: 409 });
    }

    // Registry-Eintrag anlegen
    const ins = await fetch(`${masterUrl}/rest/v1/tenants`, {
      method: 'POST',
      headers: { ...masterHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        slug,
        company_name,
        admin_email,
        admin_name: admin_name || null,
        status: 'provisioning',
        provision_log: [{ ts: new Date().toISOString(), step: 'registry', msg: 'Registry-Eintrag angelegt.' }],
      }),
    });
    if (!ins.ok) throw new Error('Registry-Eintrag fehlgeschlagen: ' + (await ins.text()));
    const created = (await ins.json())?.[0];
    if (!created?.id) throw new Error('Registry-Eintrag angelegt, aber keine ID erhalten.');

    const tenant = await runProvision(created.id);
    return NextResponse.json({ success: true, tenant: stripSecrets(tenant) });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Unbekannter Fehler' }, { status: 500 });
  }
}

// ─── GET: Kundenliste für die Admin-Seite ───
export async function GET() {
  if (!isMaster()) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  const denied = await checkCaller();
  if (denied) return denied;

  try {
    const res = await fetch(
      `${masterUrl}/rest/v1/tenants?select=${PUBLIC_FIELDS}&order=created_at.desc`,
      { headers: masterHeaders }
    );
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, tenants: await res.json() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── DELETE: Kunde deprovisionieren ───
export async function DELETE(req: NextRequest) {
  if (!isMaster()) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  const denied = await checkCaller();
  if (denied) return denied;

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });

    const tenant = await loadTenant(id);
    const fehler: string[] = [];

    if (tenant.supabase_project_ref) {
      try { await deleteSupabaseProject(tenant.supabase_project_ref); }
      catch (e: any) { fehler.push(e.message); }
    }
    if (tenant.vercel_project_id) {
      try { await deleteVercelProject(tenant.vercel_project_id); }
      catch (e: any) { fehler.push(e.message); }
    }
    if (tenant.subdomain) {
      try { await deleteUptimeMonitor(tenant.subdomain); }
      catch (e: any) { fehler.push(e.message); }
    }

    await fetch(`${masterUrl}/rest/v1/tenants?id=eq.${id}`, {
      method: 'PATCH',
      headers: masterHeaders,
      body: JSON.stringify({
        status: 'cancelled',
        error_message: fehler.length ? fehler.join(' | ') : null,
        updated_at: new Date().toISOString(),
      }),
    });

    if (fehler.length) {
      return NextResponse.json({
        success: false,
        error: 'Teilweise gelöscht – bitte Reste von Hand prüfen: ' + fehler.join(' | '),
      }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Service-Keys nie an die Admin-Seite ausliefern
function stripSecrets(t: any) {
  const { supabase_service_role_key, supabase_anon_key, ...rest } = t;
  return rest;
}
