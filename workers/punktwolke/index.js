'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// SCAFFOLD OS – Punktwolken-Worker (läuft als Docker-Container, z. B. Hetzner)
//
// Funktionsweise:
//   1. Frontend lädt große Scans DIREKT zu Supabase Storage hoch und legt einen
//      project_media-Eintrag mit metadata.status = 'queued' an.
//   2. Dieser Worker pollt alle konfigurierten Instanzen nach 'queued'-Jobs,
//      lädt die Datei, rechnet die Analyse und schreibt das Ergebnis in
//      metadata.measurements (status 'done' bzw. 'error').
//   3. Das Frontend pollt den Eintrag, bis status 'done' ist.
//
// Konfiguration über Umgebungsvariablen:
//   TENANTS       – JSON-Array: [{"name":"master","url":"https://xyz.supabase.co","key":"<SERVICE_ROLE_KEY>"}]
//                   (mehrere Mandanten = mehrere Einträge; Worker betreut alle)
//   POLL_INTERVAL – Sekunden zwischen Durchläufen (Standard: 15)
//
// Sicherheit: Service-Keys liegen nur in der Container-Umgebung, nie im Image.
// ─────────────────────────────────────────────────────────────────────────────

const { analysiere } = require('./analyse');

const POLL_INTERVAL = (parseInt(process.env.POLL_INTERVAL || '15', 10)) * 1000;

let TENANTS;
try {
  TENANTS = JSON.parse(process.env.TENANTS || '[]');
  if (!Array.isArray(TENANTS) || TENANTS.length === 0) throw new Error('leer');
} catch {
  console.error('[worker] FEHLER: TENANTS fehlt oder ist kein gültiges JSON-Array.');
  process.exit(1);
}

const headers = (t) => ({
  apikey: t.key,
  Authorization: `Bearer ${t.key}`,
});

async function holeOffeneJobs(t) {
  const url = `${t.url}/rest/v1/project_media?file_type=like.scan/*&metadata->>status=eq.queued&select=*&order=created_at.asc&limit=5`;
  const res = await fetch(url, { headers: headers(t), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`REST ${res.status}`);
  return res.json();
}

async function ladeDatei(t, pfad) {
  const res = await fetch(`${t.url}/storage/v1/object/project-media/${pfad}`, {
    headers: headers(t),
    signal: AbortSignal.timeout(120000), // große Dateien: 2 min Download-Budget
  });
  if (!res.ok) throw new Error(`Storage ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function schreibeErgebnis(t, id, metadata) {
  const res = await fetch(`${t.url}/rest/v1/project_media?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers(t), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ metadata }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`PATCH ${res.status}`);
}

async function verarbeiteJob(t, job) {
  const ext = job.file_type.split('/')[1];
  console.log(`[worker] ${t.name}: Job ${job.id} (${job.file_name}, ${(job.metadata?.size / 1e6).toFixed(1)} MB)`);

  // Als 'processing' markieren (verhindert Doppelverarbeitung bei mehreren Workern)
  await schreibeErgebnis(t, job.id, { ...job.metadata, status: 'processing' });

  try {
    const buffer = await ladeDatei(t, job.storage_path);
    const measurements = analysiere(buffer, ext);
    await schreibeErgebnis(t, job.id, {
      ...job.metadata,
      status: 'done',
      measurements,
      analysiert_am: new Date().toISOString(),
      worker: 'punktwolke/1.0',
    });
    console.log(`[worker] ${t.name}: Job ${job.id} fertig – ${measurements.ebenen?.length ?? 0} Ebenen, Höhe ${measurements.heightM.toFixed(2)} m`);
  } catch (err) {
    await schreibeErgebnis(t, job.id, {
      ...job.metadata,
      status: 'error',
      fehler: err.message,
      analysiert_am: new Date().toISOString(),
    });
    console.error(`[worker] ${t.name}: Job ${job.id} FEHLER: ${err.message}`);
  }
}

async function durchlauf() {
  for (const t of TENANTS) {
    try {
      const jobs = await holeOffeneJobs(t);
      for (const job of jobs) await verarbeiteJob(t, job); // seriell: ein Job nach dem anderen
    } catch (err) {
      console.error(`[worker] ${t.name}: Instanz nicht erreichbar (${err.message}) – weiter mit nächster`);
    }
  }
}

console.log(`[worker] Gestartet. ${TENANTS.length} Instanz(en), Intervall ${POLL_INTERVAL / 1000}s.`);
durchlauf();
setInterval(durchlauf, POLL_INTERVAL);
