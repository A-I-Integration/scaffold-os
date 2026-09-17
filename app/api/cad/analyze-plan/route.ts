import { NextRequest, NextResponse } from 'next/server';
import { kiRateLimitPruefen } from '@/lib/rate-limit';
import { kiFetchMitRetry, KI_UEBERLASTET_MELDUNG } from '@/lib/ki-fetch';
import { createClient } from '@/lib/supabase/server';
import { pruefeUndFiltere, versucheDirektenPdfText, deterministicFromText, versucheLokalenBildText } from '@/lib/grundriss-parsing';
import { serverErrorResponse } from '@/lib/auth';
import { uuid } from '@/lib/validation';

// Phase 68-K: ki_jobs-Zugriff laeuft ueber die REST-API mit Service-Role-Key
// (RLS auf ki_jobs hat keine Policies -> SSR-Client koennte nicht schreiben).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const restHeaders = {
  'Content-Type': 'application/json',
  apikey: SERVICE_KEY!,
  Authorization: `Bearer ${SERVICE_KEY!}`,
};

// ============================================================
// SCAFFOLD OS – CAD: Grundriss/Foto hochladen und auswerten (Phase 41)
//
// Eigenständige, einfachere Variante von /api/grundriss-analyse (die
// ist an eine Aufmaß-Session mit project_media-Einträgen gebunden –
// CAD hat kein Projekt, solange noch kein Angebot angelegt wurde).
// Nimmt direkt die Storage-Pfade der gerade hochgeladenen Datei(en),
// nutzt aber dieselbe, sorgfältige Anti-Halluzinations-Prüfung
// (lib/grundriss-parsing.ts) – keine zweite, abweichende Logik.
//
// POST { files: { storage_path: string; file_type: string }[] }
// → { success, laenge, breite, hoehe, traufhoehe, dachform, geschosse, ... }
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });

    // Phase 63: KI-Rate-Limit (pro Nutzer, Default 20/Min)
    const rl = await kiRateLimitPruefen(req, user.id);
    if (!rl.ok) return rl.response;

    const { files } = await req.json();
    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ success: false, error: 'Keine Datei erhalten.' }, { status: 400 });
    }

    const apiKey = process.env.KI_API_KEY;
    const baseUrl = process.env.KI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.KI_VISION_MODEL || 'mistral-small-2506';
    const ocrModel = process.env.KI_OCR_MODEL || 'mistral-ocr-latest';
    if (!apiKey) return NextResponse.json({ success: false, error: 'KI ist nicht konfiguriert (KI_API_KEY fehlt).' }, { status: 500 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const images = files.filter((f: any) => f.file_type?.startsWith('image/'));
    const pdfs = files.filter((f: any) => f.file_type === 'application/pdf');

    let ocrText = '';
    const pdfErrors: string[] = [];
    for (const pdf of pdfs) {
      const docUrl = `${supabaseUrl}/storage/v1/object/public/project-media/${pdf.storage_path}`;
      try {
        // NEU: zuerst versuchen, echten Text direkt aus der PDF zu lesen –
        // ganz ohne KI (kein Rate-Limit-Risiko, sofort). Nur wenn das
        // nichts liefert (z.B. eingescannte Bild-PDF), auf KI-OCR zurückfallen.
        const pdfRes = await fetch(docUrl);
        const direkterText = pdfRes.ok ? await versucheDirektenPdfText(Buffer.from(await pdfRes.arrayBuffer())) : '';
        if (direkterText) {
          ocrText += `\n\n--- PDF-Plan (direkt gelesen, ohne KI) ---\n${direkterText}`;
          continue;
        }

        const ocrRes = await kiFetchMitRetry(`${baseUrl}/ocr`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: ocrModel, document: { type: 'document_url', document_url: docUrl } }),
        });
        if (!ocrRes.ok) { pdfErrors.push(`OCR (${ocrRes.status}): ${(await ocrRes.text()).slice(0, 150)}`); continue; }
        const ocrJson = await ocrRes.json();
        const pages: string[] = (ocrJson.pages || []).map((p: any) => p.markdown || '').filter(Boolean);
        if (pages.length) ocrText += `\n\n--- PDF-Plan (KI-OCR) ---\n${pages.join('\n\n')}`;
      } catch (e: any) { pdfErrors.push(`OCR fehlgeschlagen: ${e.message}`); }
    }

    // NEU: bei Bildern zuerst lokale Texterkennung versuchen – klassische
    // OCR (keine KI), läuft komplett bei uns, kein Rate-Limit-Risiko.
    // Nur Bilder, bei denen das nichts Brauchbares liefert (z.B. sehr
    // unruhige Fotos), gehen weiterhin an die KI-Bildanalyse.
    const bilderFuerVision: typeof images = [];
    for (const bild of images) {
      const imgUrl = `${supabaseUrl}/storage/v1/object/public/project-media/${bild.storage_path}`;
      try {
        const bildRes = await fetch(imgUrl);
        const lokalerText = bildRes.ok ? await versucheLokalenBildText(Buffer.from(await bildRes.arrayBuffer())) : '';
        if (lokalerText) {
          ocrText += `\n\n--- Bild-Plan (lokal gelesen, ohne KI) ---\n${lokalerText}`;
        } else {
          bilderFuerVision.push(bild);
        }
      } catch { bilderFuerVision.push(bild); }
    }

    if (bilderFuerVision.length === 0 && !ocrText) {
      const detail = pdfErrors.length ? ` (${pdfErrors.join(' | ')})` : '';
      return NextResponse.json({ success: false, error: `Keine auswertbare Datei${detail}. Tipp: als Foto/PNG hochladen.` }, { status: 422 });
    }

    // Wenn KEIN Bild mehr die KI-Bildanalyse braucht (alle lokal gelesen
    // oder es waren nur PDFs) und der Text schon Länge UND Breite
    // eindeutig per Muster liefert, lohnt sich der KI-Aufruf nicht.
    if (bilderFuerVision.length === 0 && ocrText) {
      const det = deterministicFromText(ocrText);
      if (typeof det.laenge === 'number' && typeof det.breite === 'number') {
        const structured: Record<string, any> = { ...det };
        const verworfen = pruefeUndFiltere(structured, ocrText);
        return NextResponse.json({
          success: true,
          laenge: structured.laenge ?? null, breite: structured.breite ?? null,
          hoehe: structured.hoehe ?? structured.hoehe_geschaetzt ?? null,
          hoeheGeschaetzt: structured.hoehe == null && structured.hoehe_geschaetzt != null,
          traufhoehe: structured.traufhoehe ?? null, dachform: structured.dachform ?? null,
          geschosse: structured.geschosse ?? null,
          zusammenfassung: 'Direkt aus dem Plan-Text erkannt (ohne KI-Aufruf).',
          verworfen, ohneKi: true,
        });
      }
    }

    const imageUrls = bilderFuerVision.map((m: any) => `${supabaseUrl}/storage/v1/object/public/project-media/${m.storage_path}`);

    const prompt = `Du bist ein erfahrener Gerüstbau-Planer. Analysiere diese Grundrisse/Baupläne${ocrText ? ' (Bilder und/oder per OCR extrahierter Plan-Text, siehe unten)' : ''}.

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

    const content: any[] = [{ type: 'text', text: prompt }];
    for (const url of imageUrls) content.push({ type: 'image_url', image_url: { url } });

    // Phase 68-K: Die Vision-KI laeuft in die Warteschlange (ki_jobs).
    // Grund: Der synchrone Aufruf dauert 60-90s+ (Vision-Bilder) und wurde
    // von Vercel nach ~60s abgeschossen -> leere Antwort, kryptischer
    // Browser-Fehler ("The string did not match the expected pattern").
    // Der Hetzner-Worker reicht payload.request 1:1 an Mistral durch
    // (Weg A aus Phase 66) - KEINE Worker-Aenderung noetig. OCR-Text wird
    // in payload.meta mitgegeben, das GET-Polling macht das Post-Processing.
    const jobRes = await fetch(`${SUPABASE_URL}/rest/v1/ki_jobs`, {
      method: 'POST',
      headers: { ...restHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        type: 'cad-analyse',
        project_id: null,
        payload: {
          request: {
            model,
            messages: [{ role: 'user', content }],
            temperature: 0.2,
            max_tokens: 1000,
            response_format: { type: 'json_object' },
          },
          meta: { ocrText: ocrText || '' },
        },
        erstellt_von: user.id,
      }),
    });
    if (!jobRes.ok) throw new Error(`ki_jobs-Insert fehlgeschlagen: ${jobRes.status}`);
    const rows = await jobRes.json();
    return NextResponse.json({ success: true, jobId: rows[0].id, status: 'queued' });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

// ─── GET: Job-Status pollen, bei 'done' Post-Processing (Phase 68-K) ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });

    const jobId = req.nextUrl.searchParams.get('jobId');
    if (!jobId || !uuid.safeParse(jobId).success) {
      return NextResponse.json({ success: false, error: 'Gültige jobId als Query-Param nötig.' }, { status: 400 });
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/ki_jobs?id=eq.${jobId}&select=status,result,error,payload`, { headers: restHeaders });
    if (!res.ok) throw new Error(`ki_jobs-Select fehlgeschlagen: ${res.status}`);
    const rows = await res.json();
    if (!rows.length) return NextResponse.json({ success: false, error: 'Job nicht gefunden.' }, { status: 404 });
    const job = rows[0];

    if (job.status === 'error') {
      return NextResponse.json({ success: false, status: 'error', error: job.error || 'KI-Analyse fehlgeschlagen' }, { status: 500 });
    }
    if (job.status !== 'done') {
      return NextResponse.json({ success: true, status: job.status, jobId });
    }

    // Post-Processing = exakt die frühere POST-Logik (KI-JSON parsen,
    // deterministische Werte mergen, plausibilisieren).
    const raw = (job.result?.text || '').trim();
    if (!raw) return NextResponse.json({ success: false, error: 'KI hat keine Antwort geliefert' }, { status: 502 });

    let structured: Record<string, any>;
    try { structured = JSON.parse(raw); } catch { structured = { zusammenfassung: raw }; }

    const ocrText = job.payload?.meta?.ocrText || '';
    const verworfen = pruefeUndFiltere(structured, ocrText);

    return NextResponse.json({
      success: true,
      status: 'done',
      laenge: structured.laenge ?? null, breite: structured.breite ?? null,
      hoehe: structured.hoehe ?? structured.hoehe_geschaetzt ?? null,
      hoeheGeschaetzt: structured.hoehe == null && structured.hoehe_geschaetzt != null,
      traufhoehe: structured.traufhoehe ?? null, dachform: structured.dachform ?? null,
      geschosse: structured.geschosse ?? null,
      zusammenfassung: structured.zusammenfassung || '',
      verworfen,
    });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
