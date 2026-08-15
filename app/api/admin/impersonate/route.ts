import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Impersonation (Phase 17)
//
// POST { tenant_id } → Erzeugt einen einmaligen Magic-Link, der
// den Master-Admin DIREKT als Admin der Kunden-Instanz einloggt –
// ohne deren Passwort zu kennen.
//
// Sicherheit:
//   • Nur auf der MASTER-Instanz verfügbar (MASTER_INSTANCE=true)
//   • Nur für eingeloggte Nutzer mit Rolle 'admin' (Master)
//   • Jeder Aufruf wird im provision_log des Kunden protokolliert
//     (Audit-Trail: wann wurde sich als dieser Kunde eingeloggt)
//
// Technik: Supabase Admin API generate_link (type=magiclink) auf
// dem KUNDEN-Projekt – der Link funktioniert genau einmal.
// ============================================================

const masterUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const masterKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const masterHeaders = {
  'Content-Type': 'application/json',
  'apikey': masterKey,
  'Authorization': `Bearer ${masterKey}`,
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

export async function POST(req: NextRequest) {
  // Nur Master-Instanz + nur Master-Admin
  if (process.env.MASTER_INSTANCE !== 'true') {
    return NextResponse.json({ success: false, error: 'Nur auf der Master-Instanz verfügbar.' }, { status: 403 });
  }
  const role = await callerRole();
  if (role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Nur Admin.' }, { status: 403 });
  }

  try {
    const { tenant_id } = await req.json();
    if (!tenant_id) {
      return NextResponse.json({ success: false, error: 'tenant_id fehlt.' }, { status: 400 });
    }

    // Kunde aus der Registry laden
    const res = await fetch(
      `${masterUrl}/rest/v1/tenants?id=eq.${tenant_id}&select=id,slug,admin_email,supabase_url,supabase_service_role_key,subdomain,status,provision_log`,
      { headers: masterHeaders }
    );
    if (!res.ok) throw new Error(await res.text());
    const t = (await res.json())?.[0];
    if (!t) return NextResponse.json({ success: false, error: 'Kunde nicht gefunden.' }, { status: 404 });
    if (!t.supabase_url || !t.supabase_service_role_key || !t.subdomain) {
      return NextResponse.json({ success: false, error: 'Instanz ist noch nicht vollständig eingerichtet.' }, { status: 400 });
    }
    if (t.status === 'gesperrt') {
      return NextResponse.json({ success: false, error: 'Instanz ist pausiert (Gesperrt) – Login technisch nicht möglich.' }, { status: 400 });
    }

    const hostname = `${t.subdomain}.scaffoldos.de`;

    // Magic-Link auf dem KUNDEN-Projekt erzeugen (Admin API)
    const linkRes = await fetch(`${t.supabase_url}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': t.supabase_service_role_key,
        'Authorization': `Bearer ${t.supabase_service_role_key}`,
      },
      body: JSON.stringify({
        type: 'magiclink',
        email: t.admin_email,
        options: { redirect: `https://${hostname}/dashboard` },
      }),
    });
    if (!linkRes.ok) throw new Error(`Supabase: ${await linkRes.text()}`);
    const linkData = await linkRes.json();
    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) throw new Error('Kein Login-Link erhalten.');

    // Audit-Trail: Eintrag ins provision_log des Kunden
    const log = Array.isArray(t.provision_log) ? t.provision_log : [];
    log.push({
      ts: new Date().toISOString(),
      step: 'impersonation',
      msg: `Master-Admin hat sich als ${t.admin_email} eingeloggt (Support-Zugriff).`,
    });
    await fetch(`${masterUrl}/rest/v1/tenants?id=eq.${tenant_id}`, {
      method: 'PATCH',
      headers: masterHeaders,
      body: JSON.stringify({ provision_log: log }),
    });

    return NextResponse.json({ success: true, login_url: actionLink, hostname });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
