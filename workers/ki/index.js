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
const OCR_MODEL = process.env.KI_OCR_MODEL || 'mistral-ocr-latest';

// ============================================================
// Phase 68-M: CAD-Analyse-Pipeline (Ports aus lib/grundriss-parsing.ts,
// identische Logik wie auf Vercel). Laeuft komplett im Worker:
// kein Tesseract in Serverless (war der 3-Minuten-Haenger), keine
// Vercel-Timeouts, Backoff 5/20/60 s bei 429.
// ============================================================
function parsePlanNumber(s) {
  const n = parseFloat(String(s).trim().replace(',', '.'));
  return isNaN(n) ? null : n;
}
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function valueInText(v, text) {
  const candidates = new Set();
  candidates.add(v.toFixed(2).replace('.', ','));
  candidates.add(v.toFixed(1).replace('.', ','));
  candidates.add(String(v));
  for (const c of candidates) {
    if (new RegExp(`(?<![\\d.,])${escapeRegExp(c)}(?![\\d])`).test(text)) return true;
  }
  return false;
}
function deterministicFromText(text) {
  const found = {};
  const hm = text.match(/(?:haus(?:ma[ßs])?|aussenma[ßs]|außenma[ßs]|gebaeude(?:ma[ßs])?|gebäude(?:ma[ßs])?|grundriss)\s*:?\s*(\d{1,3}[.,]\d{1,2})\s*[mx×*]\s*(\d{1,3}[.,]\d{1,2})/i);
  if (hm) { found.laenge = parsePlanNumber(hm[1]); found.breite = parsePlanNumber(hm[2]); }
  const trauf = text.match(/traufh[oö]he[^\d]{0,15}(\d{1,2}[.,]\d{1,2})/i);
  if (trauf) found.traufhoehe = parsePlanNumber(trauf[1]);
  const first = text.match(/firsth[oö]he[^\d]{0,15}(\d{1,2}[.,]\d{1,2})/i);
  if (first && !found.hoehe) found.hoehe = parsePlanNumber(first[1]);
  const dach = text.match(/\b(Satteldach|Flachdach|Pultdach|Walmdach|Mansarddach|Zeltdach)\b/i);
  if (dach) found.dachform = dach[1][0].toUpperCase() + dach[1].slice(1).toLowerCase();
  // Phase 68-I: GERÜSTPLAN-/FASSADENZEICHNUNGS-Muster
  const gl = text.match(/gerüst(?:länge|breite)[^\d]{0,15}(\d{1,3}[.,]\d{1,2})/i)
    || text.match(/(\d{1,3}[.,]\d{1,2})\s*m\s+gesamt/i);
  if (gl && !found.laenge) { const v = parsePlanNumber(gl[1]); if (v !== null && v >= 5) found.laenge = v; }
  const gho = text.match(/gerüsthöhe[^\d]{0,15}(\d{1,2}[.,]\d{1,2})/i)
    || text.match(/gesamthöhe[^\d]{0,15}(\d{1,2}[.,]\d{1,2})/i);
  if (gho && !found.hoehe) found.hoehe = parsePlanNumber(gho[1]);
  return found;
}
function pruefeUndFiltere(structured, ocrText) {
  const verworfen = [];
  const r = (k, v, min, max) => { if (v == null) return null; v = Number(v); if (!isNaN(v) && v >= min && v <= max) return v; verworfen.push(`${k}: ${v} m (unplausibel, erlaubt ${min}-${max} m)`); return null; };
  for (const k of ['laenge', 'breite', 'hoehe', 'hoehe_geschaetzt', 'traufhoehe']) {
    if (structured[k] != null) {
      const v = k === 'traufhoehe' ? r('Traufhöhe', structured[k], 2, 30) : r(k === 'hoehe_geschaetzt' ? 'Höhe (geschätzt)' : k, structured[k], 2, k === 'laenge' || k === 'breite' ? 80 : 40);
      if (v != null) {
        if (ocrText && !valueInText(v, ocrText) && !(structured.belege && structured.belege[k] && String(structured.belege[k]).trim().length > 3)) verworfen.push(`${k}: ${v} m (unbelegt)`);
        else if (!ocrText && structured.belege && structured.belege[k] && String(structured.belege[k]).trim().length > 3) structured[k] = v;
        else if (ocrText) structured[k] = v;
      } else structured[k] = null;
    }
  }
  const dach = structured.dachform;
  if (dach != null && !/^(Satteldach|Flachdach|Pultdach|Walmdach|Mansarddach|Zeltdach)$/.test(dach)) { verworfen.push(`Dachform: ${dach}`); structured.dachform = null; }
  if (structured.geschosse != null) {
    const g = Number(structured.geschosse);
    if (!isNaN(g) && g >= 1 && g <= 15) structured.geschosse = g; else { verworfen.push(`Geschosse: ${structured.geschosse}`); structured.geschosse = null; }
  }
  if (ocrText) { const det = deterministicFromText(ocrText); for (const k of ['laenge', 'breite', 'hoehe', 'traufhoehe']) if (det[k] != null) structured[k] = det[k]; }
  return verworfen;
}
const CAD_PROMPT = (ocrText) => `Du bist ein erfahrener Gerüstbau-Planer. Analysiere diese Grundrisse/Baupläne${ocrText ? ' (Bilder und/oder per OCR extrahierter Plan-Text, siehe unten)' : ''}.

Antworte AUSSCHLIESSLICH als JSON-Objekt mit genau diesen Feldern:
{
  "laenge": <Außenmaß Gebäudelänge in Metern als Zahl – NUR das Gesamt-Außenmaß, sonst null>,
  "breite": <Außenmaß Gebäudebreite in Metern als Zahl – gleiche Regel wie laenge>,
  "hoehe": <Gebäudehöhe in Metern als Zahl – NUR wenn vermaßt, sonst null>,
  "traufhoehe": <Traufhöhe in Metern als Zahl – NUR wenn vermaßt, sonst null>,
  "geschosse": <Anzahl Geschosse als Zahl, wenn erkennbar, sonst null>,
  "dachform": "<Satteldach, Flachdach, Pultdach, Walmdach, Mansarddach, Zeltdach — oder null>",
  "belege": { "laenge": "<wörtliches Zitat aus dem Plan oder null>", "breite": "<...>", "hoehe": "<...>", "traufhoehe": "<...>", "dachform": "<...>" },
  "zusammenfassung": "<2-3 Sätze: Gebäudeform, Maße, Besonderheiten>"
}

STRENGE REGELN:
1. JEDER Zahlenwert braucht einen Eintrag in "belege" (wörtliches Zitat), sonst null.
2. NIEMALS RECHNEN: keine Addition von Bemaßungsketten, keine Schätzung.
3. laenge/breite = Gesamt-Außenmaß, niemals Innenraum-Maße.
4. Kein Text außerhalb des JSON.
5. Wenn ein Wert im Plan NICHT steht: immer null liefern – niemals 0.

SPEZIALFALL GERÜSTPLAN / FASSADENZEICHNUNG (Seitenansicht statt Grundriss):
- Horizontale Ausdehnung: "Gerüstlänge", "Gerüstbreite: X m", "X,XX m gesamt"
  -> laenge. Feldweite und Feldanzahl sind NUR Detailmaße – sie NICHT
  als laenge verwenden, außer der Gesamtwert ist vermaßt.
- Vertikale Ausdehnung: "Gerüsthöhe", "X,XX m Gesamthöhe" -> hoehe.
- Gebäudebreite/Tiefe ist in einer Fassadenansicht meist NICHT erkennbar:
  dann breite: null liefern (korrekt – nicht 0, nicht raten).${ocrText ? `\n\nEXTRAHIERTER PLAN-TEXT (OCR):${ocrText}` : ''}`;

async function extrahierePdfText(buffer) {
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    const text = (data.text || '').trim();
    return text.length >= 30 ? text : '';
  } catch { return ''; }
}

async function verarbeiteCadAnalyseJob(tenant, job) {
  const files = job.payload?.input?.files || [];
  let ocrText = '';
  const imageUrls = [];
  for (const f of files) {
    const url = `${tenant.supabaseUrl}/storage/v1/object/public/project-media/${f.storage_path}`;
    if ((f.file_type || '').includes('pdf')) {
      const dl = await fetch(url);
      if (dl.ok) {
        const buf = Buffer.from(await dl.arrayBuffer());
        let text = await extrahierePdfText(buf);
        if (!text) {
          // Gescannter PDF -> KI-OCR (Worker hat Zeit + Backoff)
          const ocrRes = await kiFetch(`${KI_BASE_URL}/ocr`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KI_API_KEY}` },
            body: JSON.stringify({ model: OCR_MODEL, document: { type: 'document_url', document_url: url } }),
          });
          const ocrJson = await ocrRes.json();
          text = (ocrJson.pages || []).map((p) => p.markdown || p.text || '').join('\n').trim();
        }
        if (text) ocrText += (ocrText ? '\n' : '') + text;
      }
    } else if ((f.file_type || '').startsWith('image/')) {
      // KEINE Tesseract-OCR mehr (war der 3-Minuten-Haenger): Die
      // Vision-KI liest das Bild direkt, Validierung laeuft ueber belege.
      imageUrls.push(url);
    }
  }

  // Deterministischer Schnellpfad (nur bei OCR-Text moeglich)
  if (ocrText) {
    const det = deterministicFromText(ocrText);
    if (det.laenge && det.breite) {
      const antwort = {
        laenge: det.laenge, breite: det.breite, hoehe: det.hoehe ?? null,
        hoeheGeschaetzt: false, traufhoehe: det.traufhoehe ?? null,
        dachform: det.dachform ?? null, geschosse: null,
        zusammenfassung: 'Direkt aus dem Plan-Text erkannt (ohne KI).',
        verworfen: [], ohneKi: true,
      };
      await fetch(`${tenant.supabaseUrl}/rest/v1/ki_jobs?id=eq.${job.id}`, {
        method: 'PATCH', headers: { ...restHeaders(tenant.serviceKey), Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'done', result: { antwort }, fertig_am: new Date().toISOString() }),
      });
      console.log(`[ki-worker] ${tenant.name}: Job ${job.id} (cad-analyse) fertig (deterministisch)`);
      return;
    }
  }

  // Vision-KI-Pfad
  const prompt = CAD_PROMPT(ocrText);
  const content = [{ type: 'text', text: prompt }];
  for (const url of imageUrls) content.push({ type: 'image_url', image_url: { url } });

  const res = await kiFetch(`${KI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KI_API_KEY}` },
    body: JSON.stringify({ model: VISION_MODEL, messages: [{ role: 'user', content }], temperature: 0.2, max_tokens: 1000, response_format: { type: 'json_object' } }),
  });
  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content || '').trim();
  if (!raw) throw new Error('Vision-KI lieferte keine Antwort');
  let structured;
  try { structured = JSON.parse(raw); } catch { structured = { zusammenfassung: raw }; }
  const verworfen = pruefeUndFiltere(structured, ocrText);
  const antwort = {
    laenge: structured.laenge ?? null, breite: structured.breite ?? null,
    hoehe: structured.hoehe ?? structured.hoehe_geschaetzt ?? null,
    hoeheGeschaetzt: structured.hoehe == null && structured.hoehe_geschaetzt != null,
    traufhoehe: structured.traufhoehe ?? null, dachform: structured.dachform ?? null,
    geschosse: structured.geschosse ?? null,
    zusammenfassung: structured.zusammenfassung || '',
    verworfen, ohneKi: false,
  };
  await fetch(`${tenant.supabaseUrl}/rest/v1/ki_jobs?id=eq.${job.id}`, {
    method: 'PATCH', headers: { ...restHeaders(tenant.serviceKey), Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'done', result: { antwort }, versuche: job.versuche + 1, fertig_am: new Date().toISOString() }),
  });
  console.log(`[ki-worker] ${tenant.name}: Job ${job.id} (cad-analyse) fertig (Vision)`);
}

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
  // Phase 68-M: CAD-Analyse laeuft komplett im Worker (Download, OCR,
  // deterministisch, Vision, Validierung) - eigenes Ergebnisformat.
  if (job.type === 'cad-analyse' && job.payload?.input?.files && !job.payload?.request) {
    return verarbeiteCadAnalyseJob(tenant, job);
  }
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
