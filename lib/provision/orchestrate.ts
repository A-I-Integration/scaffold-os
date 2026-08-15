// ============================================================
// SCAFFOLD OS – Kunden-Setup-Paket
// Provisionierungs-Orchestrator
//
// Ablauf pro Kunde (jeder Schritt ist wiederholbar / Resume-fähig,
// der Fortschritt steht in der tenants-Registry):
//
//   1. supabase_create   Eigenes Supabase-Projekt (Frankfurt)
//   2. supabase_wait     Warten bis healthy
//   3. supabase_keys     API-Keys abrufen
//   4. schema            Komplettes DB-Schema einspielen
//   5. admin_user        Admin-Login + Profil (Rolle admin)
//   6. vercel_project    Eigenes Vercel-Deployment (Repo verknüpft,
//                        Env-Vars direkt beim Anlegen gesetzt)
//   7. vercel_domain     kunde.scaffoldos.de einrichten
//   8. monitoring        UptimeRobot-Monitor (optional)
//   9. welcome_mail      Willkommens-Mail via Resend
//  10. smoke_test       Web-App + Datenbank erreichbar? (nur Protokoll)
//
// Läuft eine Function in ein Timeout, bleibt der Stand in der
// Registry erhalten – „Fortsetzen" macht einfach dort weiter.
// ============================================================

import {
  createSupabaseProject,
  waitForHealthy,
  getProjectApiKeys,
  runSqlOnProject,
  createTenantAdminUser,
} from './supabase-mgmt';
import { createVercelProject, addDomainToProject, triggerInitialDeployment } from './vercel';
import { createUptimeMonitor } from './uptimerobot';
import { smokeTest } from './smoketest';
import { KUNDEN_SCHEMA } from './kunden-schema';

export interface TenantRow {
  id: string;
  slug: string;
  company_name: string;
  admin_email: string;
  admin_name: string | null;
  status: string;
  provision_step: string | null;
  provision_log: { ts: string; step: string; msg: string }[];
  supabase_project_ref: string | null;
  supabase_url: string | null;
  supabase_anon_key: string | null;
  supabase_service_role_key: string | null;
  vercel_project_id: string | null;
  subdomain: string | null;
}

// Reihenfolge der Schritte
const STEPS = [
  'supabase_create',
  'supabase_wait',
  'supabase_keys',
  'schema',
  'admin_user',
  'vercel_project',
  'vercel_domain',
  'vercel_deploy',
  'monitoring',
  'welcome_mail',
  'smoke_test',
] as const;

// ─── Registry-Zugriff (MASTER-Datenbank, REST + Service-Key) ───
const masterUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const masterKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const masterHeaders = {
  apikey: masterKey,
  Authorization: `Bearer ${masterKey}`,
  'Content-Type': 'application/json',
};

export async function loadTenant(id: string): Promise<TenantRow> {
  const res = await fetch(`${masterUrl}/rest/v1/tenants?id=eq.${id}`, { headers: masterHeaders });
  if (!res.ok) throw new Error('Mandant konnte nicht geladen werden: ' + (await res.text()));
  const rows = await res.json();
  if (!rows?.length) throw new Error('Mandant nicht gefunden.');
  return rows[0];
}

async function patchTenant(id: string, fields: Record<string, any>): Promise<void> {
  const res = await fetch(`${masterUrl}/rest/v1/tenants?id=eq.${id}`, {
    method: 'PATCH',
    headers: masterHeaders,
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error('Registry-Update fehlgeschlagen: ' + (await res.text()));
}

// Der Storage-Dienst eines frischen Projekts legt seine Tabellen
// (storage.objects, storage.buckets, …) erst kurz NACH dem Healthy-Status an.
// Unser Schema enthält Storage-Policies + Bucket → ohne Warten: 42P01.
async function waitForStorage(ref: string): Promise<void> {
  const versuche = 5; // ~50 s Budget (Hobby-Grenze beachten), Rest per Resume
  for (let i = 0; i < versuche; i++) {
    try {
      await runSqlOnProject(ref, 'select 1 from storage.objects limit 1');
      return; // Storage ist da
    } catch {
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
  throw new Error('Storage-Dienst des neuen Projekts noch nicht bereit – bitte gleich nochmal „Fortsetzen" klicken.');
}

// ─── Hauptfunktion: Provisionierung (mit Resume) ───
export async function runProvision(tenantId: string): Promise<TenantRow> {
  let t = await loadTenant(tenantId);
  const log = Array.isArray(t.provision_log) ? [...t.provision_log] : [];
  const baseDomain = process.env.PROVISION_BASE_DOMAIN || 'scaffoldos.de';
  const hostname = t.subdomain || `${t.slug}.${baseDomain}`;

  const note = async (step: string, msg: string) => {
    log.push({ ts: new Date().toISOString(), step, msg });
    await patchTenant(tenantId, { provision_log: log });
  };

  const stepDone = (step: string) => {
    const doneIdx = STEPS.indexOf((t.provision_step || '') as any);
    return doneIdx >= STEPS.indexOf(step as any);
  };

  // Schutz: Platzhalter-Schema darf nie auf eine echte Kunden-DB losgelassen werden
  if (KUNDEN_SCHEMA.includes('PLACEHOLDER_NICHT_PRODUKTIV')) {
    await patchTenant(tenantId, {
      status: 'error',
      error_message: 'supabase/kunden-schema.sql ist noch der Platzhalter. Bitte zuerst den vollständigen Schema-Dump einfügen (siehe Anleitung).',
    });
    throw new Error('Kunden-Schema ist noch der Platzhalter – Provisionierung gestoppt.');
  }

  await patchTenant(tenantId, { status: 'provisioning', error_message: null });

  try {
    // ─── 1+2) Supabase-Projekt anlegen & abwarten ───
    if (!stepDone('supabase_create')) {
      const { ref, dbPass } = await createSupabaseProject(t.slug);
      t = { ...t, supabase_project_ref: ref };
      await patchTenant(tenantId, { supabase_project_ref: ref, provision_step: 'supabase_create' });
      await note('supabase_create', `Projekt ${ref} angelegt (Region Frankfurt).`);
      void dbPass; // wird bewusst nicht persistiert
    }
    if (!stepDone('supabase_wait')) {
      await waitForHealthy(t.supabase_project_ref!);
      await patchTenant(tenantId, { provision_step: 'supabase_wait' });
      await note('supabase_wait', 'Projekt ist healthy.');
    }

    // ─── 3) API-Keys ───
    if (!stepDone('supabase_keys')) {
      const keys = await getProjectApiKeys(t.supabase_project_ref!);
      t = { ...t, supabase_url: keys.url, supabase_anon_key: keys.anonKey, supabase_service_role_key: keys.serviceKey };
      await patchTenant(tenantId, {
        supabase_url: keys.url,
        supabase_anon_key: keys.anonKey,
        supabase_service_role_key: keys.serviceKey,
        provision_step: 'supabase_keys',
      });
      await note('supabase_keys', 'API-Keys gespeichert.');
    }

    // ─── 4) Schema einspielen (vorher auf Storage-Tabellen warten) ───
    if (!stepDone('schema')) {
      await waitForStorage(t.supabase_project_ref!);
      await runSqlOnProject(t.supabase_project_ref!, KUNDEN_SCHEMA);
      await patchTenant(tenantId, { provision_step: 'schema' });
      await note('schema', 'DB-Schema eingespielt.');
    }

    // ─── 5) Admin-User ───
    const tempPassword = 'So!' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const adminJustCreated = !stepDone('admin_user');
    if (adminJustCreated) {
      await createTenantAdminUser(
        t.supabase_url!,
        t.supabase_service_role_key!,
        t.admin_email,
        tempPassword,
        t.admin_name || t.company_name
      );
      await patchTenant(tenantId, { provision_step: 'admin_user' });
      await note('admin_user', `Admin-Login für ${t.admin_email} angelegt.`);
    }

    // ─── 6) Vercel-Projekt ───
    if (!stepDone('vercel_project')) {
      const envVars = [
        { key: 'NEXT_PUBLIC_SUPABASE_URL', value: t.supabase_url!, secret: false },
        { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: t.supabase_anon_key!, secret: false },
        { key: 'SUPABASE_SERVICE_ROLE_KEY', value: t.supabase_service_role_key!, secret: true },
        { key: 'NEXT_PUBLIC_APP_URL', value: `https://${hostname}`, secret: false },
        // Gemeinsam genutzte Integrationen vom Master durchreichen
        // (nur wenn auf der Master-Instanz gesetzt – Werte verlassen
        // die Serverumgebung nie Richtung Chat/Client)
        ...(['KI_API_KEY', 'KI_BASE_URL', 'KI_MODEL', 'RESEND_API_KEY']
          .filter((k) => process.env[k])
          .map((k) => ({ key: k, value: process.env[k] as string, secret: true }))),
      ];
      const projectId = await createVercelProject(t.slug, envVars);
      t = { ...t, vercel_project_id: projectId };
      await patchTenant(tenantId, { vercel_project_id: projectId, provision_step: 'vercel_project' });
      await note('vercel_project', `Vercel-Projekt scaffold-os-${t.slug} angelegt, erstes Deployment läuft.`);
    }

    // ─── 7) Subdomain ───
    if (!stepDone('vercel_domain')) {
      await addDomainToProject(t.vercel_project_id!, hostname);
      await patchTenant(tenantId, { subdomain: hostname, provision_step: 'vercel_domain' });
      await note('vercel_domain', `${hostname} eingerichtet (DNS + SSL automatisch).`);
    }

    // ─── 7b) Erstes Deployment explizit anstoßen ───
    if (!stepDone('vercel_deploy')) {
      await triggerInitialDeployment(t.vercel_project_id!, t.slug);
      await patchTenant(tenantId, { provision_step: 'vercel_deploy' });
      await note('vercel_deploy', 'Erstes Deployment gestartet.');
    }

    // ─── 7c) Uptime-Monitor anlegen (Sprint 1, optional) ───
    if (!stepDone('monitoring')) {
      try {
        await createUptimeMonitor(hostname, t.company_name || t.slug);
        await note('monitoring', `Uptime-Monitor für ${hostname} angelegt.`);
      } catch (err: any) {
        // Monitoring ist optional – darf die Einrichtung nie blockieren
        await note('monitoring', `Monitor-Anlage übersprungen: ${err.message}`);
      }
      await patchTenant(tenantId, { provision_step: 'monitoring' });
    }

    // ─── 8) Willkommens-Mail ───
    if (!stepDone('welcome_mail')) {
      // Bei Resume nach Schritt 5: das gemerkte Start-Passwort aus dem
      // vorherigen Lauf ist verloren → Passwort neu setzen, damit das
      // in der Mail stehende Passwort garantiert gültig ist.
      if (!adminJustCreated) {
        await resetTenantAdminPassword(t.supabase_url!, t.supabase_service_role_key!, t.admin_email, tempPassword);
        await note('welcome_mail', 'Start-Passwort wurde neu gesetzt (Fortsetzung nach Unterbrechung).');
      }
      await sendWelcomeMail(t, hostname, tempPassword);
      await patchTenant(tenantId, { provision_step: 'welcome_mail' });
      await note('welcome_mail', `Willkommens-Mail an ${t.admin_email} gesendet.`);
    }

    // ─── 9) Smoke-Test: Läuft die neue Instanz wirklich? ───
    // Nie blockierend – Warnungen landen nur im Protokoll.
    if (!stepDone('smoke_test')) {
      try {
        const erg = await smokeTest(hostname, t.supabase_url!, t.supabase_anon_key!);
        if (erg.warnungen.length === 0) {
          await note('smoke_test', `Smoke-Test bestanden: Web-App HTTP ${erg.webapp_status}, Datenbank antwortet.`);
        } else {
          for (const w of erg.warnungen) await note('smoke_test', `WARNUNG: ${w}`);
        }
      } catch (err: any) {
        await note('smoke_test', `Smoke-Test übersprungen: ${err.message}`);
      }
      await patchTenant(tenantId, { provision_step: 'smoke_test' });
    }

    await patchTenant(tenantId, { status: 'active', error_message: null });
    return await loadTenant(tenantId);
  } catch (err: any) {
    await patchTenant(tenantId, { status: 'error', error_message: err.message || 'Unbekannter Fehler' });
    await note('error', err.message || 'Unbekannter Fehler');
    throw err;
  }
}

// ─── Passwort des Kunden-Admins neu setzen (nur bei Resume nötig) ───
async function resetTenantAdminPassword(
  tenantUrl: string,
  serviceKey: string,
  email: string,
  newPassword: string
): Promise<void> {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  // User per E-Mail suchen
  const listRes = await fetch(`${tenantUrl}/auth/v1/admin/users?page=1&per_page=1000`, { headers });
  const listJson: any = await listRes.json().catch(() => ({}));
  if (!listRes.ok) throw new Error('Kunden-Benutzerliste konnte nicht gelesen werden.');
  const users: any[] = listJson.users || listJson || [];
  const user = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`Admin-User ${email} im Kunden-Projekt nicht gefunden.`);

  const putRes = await fetch(`${tenantUrl}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password: newPassword }),
  });
  if (!putRes.ok) throw new Error('Passwort konnte nicht neu gesetzt werden: ' + (await putRes.text()));
}

// ─── Willkommens-Mail via Resend ───
async function sendWelcomeMail(t: TenantRow, hostname: string, tempPassword: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY nicht konfiguriert – Willkommens-Mail kann nicht gesendet werden.');

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const loginUrl = `https://${hostname}/login`;

  const { error } = await resend.emails.send({
    from: 'SCAFFOLD OS <noreply@scaffoldos.de>',
    to: [t.admin_email],
    subject: 'Ihr SCAFFOLD OS Zugang ist bereit',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">SCAFFOLD OS</h2>
        <p>Hallo${t.admin_name ? ' ' + t.admin_name : ''},</p>
        <p>Ihre SCAFFOLD OS Installation für <strong>${t.company_name}</strong> ist fertig eingerichtet.</p>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Ihre Adresse:</strong> <a href="https://${hostname}">https://${hostname}</a></p>
          <p style="margin: 8px 0 0;"><strong>E-Mail:</strong> ${t.admin_email}</p>
          <p style="margin: 8px 0 0;"><strong>Start-Passwort:</strong> ${tempPassword}</p>
        </div>
        <a href="${loginUrl}" style="display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0;">Jetzt anmelden</a>
        <p><strong>Wichtig:</strong> Ändern Sie das Passwort nach der ersten Anmeldung über „Passwort vergessen" auf der Login-Seite.</p>
        <p style="color: #64748b; font-size: 12px; margin-top: 30px;">
          Diese E-Mail wurde automatisch von SCAFFOLD OS versendet.<br>
          Bei Fragen antworten Sie einfach auf diese E-Mail.
        </p>
      </div>
    `,
  });
  if (error) throw new Error('Willkommens-Mail fehlgeschlagen: ' + error.message);
}
