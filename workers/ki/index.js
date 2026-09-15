// ============================================================
// SCAFFOLD OS – KI-Queue-Worker (Phase 65) — läuft auf Hetzner
//
// Polli alle Tenants (gleiches TENANTS-Format wie punktwolke),
// holt queued ki_jobs, verarbeitet sie SERIELL pro Instanz
// (1 Job nach dem anderen → kein Rate-Limit-Problem bei Mistral),
// schreibt Ergebnis oder Fehler zurück.
//
// Architektur-Entscheidung (CTO): SERIELL statt parallel.
// 15.000 Dateien = 15.000 Jobs in der Queue, der Worker ackert
// sie Schritt für Schritt ab. Lieber dauert ein Batch 2 Stunden,
// als dass wir bei Mistral 429er fahren und nichts fertig wird.
// Parallelität kommt später horizontal (2. Worker-Container).
//
// Env (auf Hetzner, pro Container):
//   TENANTS=[{"name":"kunde1","supabaseUrl":"https://….supabase.co","serviceKey":"eyJ…"}]
//   KI_BASE_URL=https://api.mistral.ai/v1
//   KI_API_KEY=…
//   KI_MODEL=mistral-large-latest
//   POLL_INTERVAL_S=15
//   VISION_MODEL=mistral-medium-latest
// ============================================================

// Phase 66b: Tenant-Format-Normalisierung. Der punktwolke-Worker nutzt
// url/key, dieser Worker supabaseUrl/serviceKey — wir akzeptieren BEIDE,
// damit dieselbe TENANTS-Env-Variable für alle Worker gilt.
const TENANTS = JSON.parse(process.env.TENANTS || '[]').map((t) => ({
  name: t.name,
  supabaseUrl: t.supabaseUrl || t.url,
  serviceKey: t.serviceKey || t.key,
}));
const KI_BASE_URL = process.env.KI_BASE_URL || 'https://api.mistral.ai/v1';
const KI_API_KEY = process.env.KI_API_KEY || '';
const KI_MODEL = process.env.KI_MODEL || 'mistral-large-latest';
const VISION_MODEL = process.env.VISION_MODEL || 'mistral-medium-latest';
const POLL_INTERVAL_S = parseInt(process.env.POLL_INTERVAL_S || '15', 10);

if (!TENANTS.length) { console.error('[ki-worker] TENANTS leer'); process.exit(1); }
if (!KI_API_KEY) { console.error('[ki-worker] KI_API_KEY fehlt'); process.exit(1); }

const restHeaders = (key) => ({
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
});

// ─── KI-Aufruf mit Retry (429 + 5xx, Backoff 5/20/60 s) ───
async function kiFetch(url, init, versuche = 3) {
  let delay = 5000;
  for (let i = 1; ; i++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) {
      if (i >= versuche) throw new Error(`KI ${res.status} nach ${i} Versuchen`);
      console.log(`[ki-worker] ${res.status}, Retry in ${delay / 1000}s`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= 4;
      continue;
    }
    throw new Error(`KI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

// ─── Bilder einer Session aus dem Storage laden → Vision-Content ───
async function ladeBilder(tenant, bucket, pfade) {
  const teile = [];
  for (const pfad of pfade) {
    const res = await fetch(`${tenant.supabaseUrl}/storage/v1/object/${bucket}/${pfad}`);
    if (!res.ok) throw new Error(`Storage-Load fehlgeschlagen: ${pfad} (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    teile.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}` },
    });
  }
  return teile;
}

// ─── Jobtyp → Prompt + Modell ───
function jobConfig(job) {
  const input = job.payload?.input || {};
  // Phase 66+: Wenn die API-Route einen FERTIGEN Request abgelegt hat
  // (payload.request.messages), wird der 1:1 an die KI durchgereicht.
  // Prompt-Logik lebt damit weiterhin in den Routen, nicht hier.
  if (job.payload?.request && Array.isArray(job.payload.request.messages)) {
    return {
      model: job.payload.request.model || KI_MODEL,
      build: async () => job.payload.request.messages,
      requestExtras: job.payload.request,
    };
  }
  switch (job.type) {
    case 'foto-analyse':
      return {
        model: VISION_MODEL,
        build: async (tenant) => [{
          role: 'user',
          content: [
            { type: 'text', text: 'Analysiere diese Aufmaßfotos. Erstelle eine strukturierte Stückliste (Position, Menge, Einheit, Beschreibung) als JSON-Array.' },
            ...(await ladeBilder(tenant, input.bucket || 'project-media', input.files || [])),
          ],
        }],
      };
    case 'grundriss-analyse':
      return {
        model: VISION_MODEL,
        build: async (tenant) => [{
          role: 'user',
          content: [
            { type: 'text', text: 'Analysiere diesen Grundriss-Scan. Extrahiere Räume, Maße (m) und Wände als JSON.' },
            ...(await ladeBilder(tenant, input.bucket || 'project-media', input.files || [])),
          ],
        }],
      };
    case 'cad-analyse':
      return {
        model: KI_MODEL,
        build: async () => [{
          role: 'user',
          content: `Analysiere diese CAD-Struktur-Daten:\n${JSON.stringify(input.structure || {}).slice(0, 12000)}`,
        }],
      };
    default:
      throw new Error(`Unbekannter Jobtyp: ${job.type}`);
  }
}

async function verarbeiteJob(tenant, job) {
  const cfg = jobConfig(job);
  const messages = await cfg.build(tenant);
  // requestExtras (temperature/response_format/max_tokens) aus dem
  // fertigen Request übernehmen, Defaults als Fallback.
  const extras = cfg.requestExtras || {};

  const res = await kiFetch(`${KI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KI_API_KEY}` },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: extras.temperature ?? 0.3,
      max_tokens: extras.max_tokens ?? 4096,
      ...(extras.response_format ? { response_format: extras.response_format } : {}),
    }),
  });
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';

  const patch = await fetch(`${tenant.supabaseUrl}/rest/v1/ki_jobs?id=eq.${job.id}`, {
    method: 'PATCH',
    headers: { ...restHeaders(tenant.serviceKey), Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'done',
      result: { text, model: cfg.model, tokens: data.usage || null },
      model: cfg.model,
      versuche: job.versuche + 1,
      fertig_am: new Date().toISOString(),
    }),
  });
  if (!patch.ok) throw new Error(`Patch done fehlgeschlagen: ${patch.status}`);
  console.log(`[ki-worker] ${tenant.name}: Job ${job.id} (${job.type}) fertig`);
}

async function markiereFehler(tenant, job, fehler) {
  const fertig = (job.versuche + 1) >= job.max_versuche;
  await fetch(`${tenant.supabaseUrl}/rest/v1/ki_jobs?id=eq.${job.id}`, {
    method: 'PATCH',
    headers: { ...restHeaders(tenant.serviceKey), Prefer: 'return=minimal' },
    body: JSON.stringify(fertig
      ? { status: 'error', error: String(fehler).slice(0, 1000), versuche: job.versuche + 1, fertig_am: new Date().toISOString() }
      : { status: 'queued', error: String(fehler).slice(0, 1000), versuche: job.versuche + 1 }),
  });
  console.error(`[ki-worker] ${tenant.name}: Job ${job.id} Versuch ${job.versuche + 1}/${job.max_versuche}: ${fehler}`);
}

// ─── Hauptloop: pro Tenant seriell nacheinander ───
async function run() {
  for (const tenant of TENANTS) {
    try {
      const res = await fetch(
        `${tenant.supabaseUrl}/rest/v1/ki_jobs?status=eq.queued&order=erstellt_am.asc&limit=1`,
        { headers: restHeaders(tenant.serviceKey) },
      );
      if (!res.ok) { console.error(`[ki-worker] ${tenant.name}: Poll ${res.status}`); continue; }
      const jobs = await res.json();
      if (!jobs.length) continue;

      const job = jobs[0];
      // Atomares Claim: nur wer queued→processing dreht, darf arbeiten
      const claim = await fetch(`${tenant.supabaseUrl}/rest/v1/ki_jobs?id=eq.${job.id}&status=eq.queued`, {
        method: 'PATCH',
        headers: { ...restHeaders(tenant.serviceKey), Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'processing', gestartet_am: new Date().toISOString() }),
      });
      if (!claim.ok || (await claim.text()) === '[]') continue; // wurde gerade woanders geclaimt

      try {
        await verarbeiteJob(tenant, job);
      } catch (fehler) {
        await markiereFehler(tenant, job, fehler);
      }
    } catch (fehler) {
      console.error(`[ki-worker] ${tenant.name}: ${fehler}`);
    }
  }
}

console.log(`[ki-worker] Start. ${TENANTS.length} Tenant(s), Poll alle ${POLL_INTERVAL_S}s, Modell ${KI_MODEL}`);
run();
setInterval(run, POLL_INTERVAL_S * 1000);
