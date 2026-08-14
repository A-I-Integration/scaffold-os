// ============================================================
// SCAFFOLD OS – Kunden-Setup-Paket
// Vercel API (nur fetch)
//
// Braucht Env-Vars auf der MASTER-Instanz:
//   VERCEL_TOKEN      (Vercel → Account Settings → Tokens)
// Optional:
//   VERCEL_TEAM_ID    (nur falls das Projekt in einem Team liegt;
//                      bei persönlichem Account leer lassen)
//   VERCEL_GIT_REPO   (Standard: A-I-Integration/scaffold-os)
//
// WICHTIG: Die Env-Vars des Kunden werden DIREKT beim Anlegen
// des Projekts mitgegeben (environmentVariables). Grund:
// NEXT_PUBLIC_*-Variablen werden beim BUILD eingebrannt – kämen
// sie erst nach dem ersten Deploy dazu, wäre der erste Build
// ohne Supabase-Anbindung gebaut worden.
// ============================================================

const VERCEL = 'https://api.vercel.com';

function vercelHeaders() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN fehlt (Env-Var auf der Master-Instanz setzen).');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function teamQuery(): string {
  const teamId = process.env.VERCEL_TEAM_ID;
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
}

export interface VercelEnvVar {
  key: string;
  value: string;
  secret?: boolean; // true → 'encrypted', false → 'plain'
}

// ─── Kunden-Projekt anlegen (mit Repo-Verknüpfung + Env-Vars) ───
// Durch die gitRepository-Verknüpfung startet Vercel automatisch
// das erste Production-Deployment von main – und jedes spätere
// Push auf main aktualisiert ALLE Kunden-Deployments mit.
export async function createVercelProject(slug: string, envVars: VercelEnvVar[]): Promise<string> {
  const repo = process.env.VERCEL_GIT_REPO || 'A-I-Integration/scaffold-os';

  const res = await fetch(`${VERCEL}/v11/projects${teamQuery()}`, {
    method: 'POST',
    headers: vercelHeaders(),
    body: JSON.stringify({
      name: `scaffold-os-${slug}`,
      framework: 'nextjs',
      gitRepository: { type: 'github', repo },
      environmentVariables: envVars.map((v) => ({
        key: v.key,
        value: v.value,
        target: ['production', 'preview'],
        type: v.secret === false ? 'plain' : 'encrypted',
      })),
    }),
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error?.message || json.message || JSON.stringify(json);
    throw new Error(`Vercel-Projekt konnte nicht angelegt werden: ${msg}`);
  }
  if (!json.id) throw new Error('Vercel-Projekt angelegt, aber keine Projekt-ID erhalten.');
  return json.id;
}

// ─── Subdomain auf das Kunden-Projekt zeigen lassen ───
// Da die Nameserver von scaffoldos.de bei Vercel liegen, legt
// Vercel den DNS-Eintrag automatisch an und stellt das
// SSL-Zertifikat aus – kein manueller DNS-Schritt nötig.
export async function addDomainToProject(projectId: string, hostname: string): Promise<void> {
  const res = await fetch(`${VERCEL}/v10/projects/${encodeURIComponent(projectId)}/domains${teamQuery()}`, {
    method: 'POST',
    headers: vercelHeaders(),
    body: JSON.stringify({ name: hostname }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error?.message || json.message || JSON.stringify(json);
    throw new Error(`Subdomain ${hostname} konnte nicht eingerichtet werden: ${msg}`);
  }
}

// ─── Erstes Deployment explizit starten ───
// API-anglegte Projekte lösen das erste Deployment nicht immer
// automatisch aus – ohne diesen Schritt bliebe die Kunden-Seite
// auf 404 stehen, bis das nächste Mal auf main gepusht wird.
export async function triggerInitialDeployment(projectId: string, slug: string): Promise<void> {
  const repo = process.env.VERCEL_GIT_REPO || 'A-I-Integration/scaffold-os';
  const res = await fetch(`${VERCEL}/v13/deployments${teamQuery()}`, {
    method: 'POST',
    headers: vercelHeaders(),
    body: JSON.stringify({
      name: `scaffold-os-${slug}`,
      project: projectId,
      target: 'production',
      gitSource: { type: 'github', repo, ref: 'main' },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  // 409/400 „deployment already running" ist ok – dann läuft er schon
  if (!res.ok && res.status !== 409) {
    const msg = json.error?.message || json.message || JSON.stringify(json);
    if (!String(msg).includes('already')) {
      throw new Error(`Erstes Deployment konnte nicht gestartet werden: ${msg}`);
    }
  }
}

// ─── Projekt löschen (Deprovisionierung) ───
export async function deleteVercelProject(projectId: string): Promise<void> {
  const res = await fetch(`${VERCEL}/v9/projects/${encodeURIComponent(projectId)}${teamQuery()}`, {
    method: 'DELETE',
    headers: vercelHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Vercel-Projekt konnte nicht gelöscht werden: ${text}`);
  }
}
