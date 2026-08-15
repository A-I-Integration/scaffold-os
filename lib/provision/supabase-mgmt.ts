// ============================================================
// SCAFFOLD OS – Kunden-Setup-Paket
// Supabase Management API (nur fetch, kein createClient!)
//
// Braucht Env-Vars auf der MASTER-Instanz:
//   SUPABASE_MANAGEMENT_TOKEN  (Personal Access Token aus dem
//                               Supabase-Dashboard → Account → Access Tokens)
//   SUPABASE_ORG_ID            (Organisation-ID, steht in der Dashboard-URL)
// Optional:
//   SUPABASE_REGION            (Standard: eu-central-1 = Frankfurt)
// ============================================================

const MGMT = 'https://api.supabase.com/v1';

function mgmtHeaders() {
  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;
  if (!token) throw new Error('SUPABASE_MANAGEMENT_TOKEN fehlt (Env-Var auf der Master-Instanz setzen).');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export interface SupabaseProjectInfo {
  ref: string;
  url: string;
}

// ─── Projekt anlegen ───
// Gibt die Projekt-Referenz (ref) zurück. Das Projekt braucht danach
// noch 1–3 Minuten, bis es healthy ist → waitForHealthy().
export async function createSupabaseProject(slug: string): Promise<{ ref: string; dbPass: string }> {
  const orgId = process.env.SUPABASE_ORG_ID;
  if (!orgId) throw new Error('SUPABASE_ORG_ID fehlt (Env-Var auf der Master-Instanz setzen).');

  // DB-Passwort pro Kunde zufällig generieren (wird nicht im Code gespeichert,
  // steht danach nur noch verschlüsselt in der tenants-Registry)
  const dbPass = 'So' + crypto.randomUUID().replace(/-/g, '') + '!x';

  const res = await fetch(`${MGMT}/projects`, {
    method: 'POST',
    headers: mgmtHeaders(),
    body: JSON.stringify({
      name: `scaffold-os-${slug}`,
      organization_id: orgId,
      region: process.env.SUPABASE_REGION || 'eu-central-1', // Frankfurt
      db_pass: dbPass,
    }),
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Supabase-Projekt konnte nicht angelegt werden: ${json.message || JSON.stringify(json)}`);
  }
  const ref = json.id || json.ref;
  if (!ref) throw new Error('Supabase-Projekt angelegt, aber keine Projekt-Referenz erhalten.');
  return { ref, dbPass };
}

// ─── Warten, bis das Projekt healthy ist ───
// maxWaitSeconds begrenzt die Laufzeit (Vercel-Function-Timeout!).
// Bei Überschreitung: Fehler werfen → der Schritt ist wiederholbar (Resume).
export async function waitForHealthy(ref: string, maxWaitSeconds = 240): Promise<void> {
  const started = Date.now();
  while (true) {
    const res = await fetch(`${MGMT}/projects/${ref}`, { headers: mgmtHeaders() });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && (json.status === 'ACTIVE_HEALTHY' || json.status === 'ACTIVE')) {
      return;
    }
    if ((Date.now() - started) / 1000 > maxWaitSeconds) {
      throw new Error('Zeitüberschreitung beim Warten auf das Supabase-Projekt. Einfach „Fortsetzen" klicken – der Schritt läuft weiter.');
    }
    await new Promise((r) => setTimeout(r, 10000)); // 10 s zwischen den Checks
  }
}

// ─── API-Keys des neuen Projekts abrufen ───
// Supabase stellt gerade von JWT-Keys (anon/service_role) auf
// publishable/secret-Keys um – wir akzeptieren defensiv beide.
export async function getProjectApiKeys(ref: string): Promise<{ url: string; anonKey: string; serviceKey: string }> {
  const res = await fetch(`${MGMT}/projects/${ref}/api-keys`, { headers: mgmtHeaders() });
  const json: any = await res.json().catch(() => ([]));
  if (!res.ok) {
    throw new Error(`API-Keys konnten nicht abgerufen werden: ${json.message || JSON.stringify(json)}`);
  }

  const keys: any[] = Array.isArray(json) ? json : json.api_keys || [];
  const findKey = (patterns: RegExp[]) =>
    keys.find((k) => patterns.some((p) => p.test(`${k.name || ''} ${k.tags?.join(' ') || ''}`)))?.api_key;

  const anonKey = findKey([/anon/i, /publishable/i]);
  const serviceKey = findKey([/service_role/i, /secret/i]);
  if (!anonKey || !serviceKey) {
    throw new Error('API-Keys erhalten, aber anon/service_role nicht gefunden. Antwort prüfen.');
  }
  return { url: `https://${ref}.supabase.co`, anonKey, serviceKey };
}

// ─── SQL auf dem Kunden-Projekt ausführen (Schema einspielen) ───
export async function runSqlOnProject(ref: string, sql: string): Promise<void> {
  const res = await fetch(`${MGMT}/projects/${ref}/database/query`, {
    method: 'POST',
    headers: mgmtHeaders(),
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Schema konnte nicht eingespielt werden: ${text}`);
  }
}

// ─── Admin-User im Kunden-Projekt anlegen ───
// Gleiches Muster wie app/api/admin/users/route.ts:
// 1) Auth-User über die Admin-API, 2) Profil per REST upserten.
export async function createTenantAdminUser(
  tenantUrl: string,
  serviceKey: string,
  email: string,
  password: string,
  fullName: string
): Promise<string> {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  const authRes = await fetch(`${tenantUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const authJson: any = await authRes.json().catch(() => ({}));
  if (!authRes.ok) {
    const msg = authJson.msg || authJson.message || authJson.error_description || JSON.stringify(authJson);
    throw new Error('Kunden-Admin-Login konnte nicht angelegt werden: ' + msg);
  }
  const userId = authJson.id;
  if (!userId) throw new Error('Kunden-Login angelegt, aber keine User-ID erhalten.');

  const profileRes = await fetch(`${tenantUrl}/rest/v1/profiles`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: userId,
      full_name: fullName,
      email,
      role: 'admin',
      created_at: new Date().toISOString(),
    }),
  });
  if (!profileRes.ok) {
    throw new Error('Kunden-Login wurde angelegt, aber das Profil nicht: ' + (await profileRes.text()));
  }

  return userId;
}

// ─── Projekt pausieren (Kill-Switch bei Kündigung/Nichtzahlung) ───
// Pausieren stoppt Datenbank + API der Kundeninstanz komplett.
// Alles bleibt erhalten – /restore macht die Sperrung rückgängig.
export async function pauseSupabaseProject(ref: string): Promise<void> {
  const res = await fetch(`${MGMT}/projects/${ref}/pause`, {
    method: 'POST',
    headers: mgmtHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    // Schon pausiert oder Projekt weg → kein harter Fehler
    if (res.status === 404 || /already|paused/i.test(text)) return;
    throw new Error(`Supabase-Projekt konnte nicht pausiert werden: ${text}`);
  }
}

// ─── Projekt wieder aktivieren (Zahlung eingegangen) ───
export async function restoreSupabaseProject(ref: string): Promise<void> {
  const res = await fetch(`${MGMT}/projects/${ref}/restore`, {
    method: 'POST',
    headers: mgmtHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 404 || /already|active|healthy/i.test(text)) return;
    throw new Error(`Supabase-Projekt konnte nicht reaktiviert werden: ${text}`);
  }
}

// ─── Projekt löschen (Deprovisionierung) ───
export async function deleteSupabaseProject(ref: string): Promise<void> {
  const res = await fetch(`${MGMT}/projects/${ref}`, {
    method: 'DELETE',
    headers: mgmtHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    // 404 = schon weg → kein Fehler
    if (res.status !== 404) throw new Error(`Supabase-Projekt konnte nicht gelöscht werden: ${text}`);
  }
}
