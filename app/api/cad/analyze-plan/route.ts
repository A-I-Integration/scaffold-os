import { NextRequest, NextResponse } from 'next/server';
import { kiFetchMitRetry, KI_UEBERLASTET_MELDUNG } from '@/lib/ki-fetch';
import { createClient } from '@/lib/supabase/server';
import { pruefeUndFiltere, versucheDirektenPdfText, deterministicFromText } from '@/lib/grundriss-parsing';

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

    if (images.length === 0 && !ocrText) {
      const detail = pdfErrors.length ? ` (${pdfErrors.join(' | ')})` : '';
      return NextResponse.json({ success: false, error: `Keine auswertbare Datei${detail}. Tipp: als Foto/PNG hochladen.` }, { status: 422 });
    }

    // NEU: Wenn NUR eine PDF hochgeladen wurde (kein Bild, das eine
    // Vision-Analyse bräuchte) und der direkt/ohne-KI gelesene Text schon
    // Länge UND Breite eindeutig per Muster liefert, lohnt sich der
    // zusätzliche KI-Aufruf nicht – direkt mit dem Musterergebnis antworten.
    if (images.length === 0 && ocrText) {
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

    const imageUrls = images.map((m: any) => `${supabaseUrl}/storage/v1/object/public/project-media/${m.storage_path}`);

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
4. Kein Text außerhalb des JSON.${ocrText ? `\n\nEXTRAHIERTER PLAN-TEXT (OCR):${ocrText}` : ''}`;

    const content: any[] = [{ type: 'text', text: prompt }];
    for (const url of imageUrls) content.push({ type: 'image_url', image_url: { url } });

    const kiRes = await kiFetchMitRetry(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content }], temperature: 0.2, max_tokens: 1000, response_format: { type: 'json_object' } }),
    });
    if (!kiRes.ok) {
      if (kiRes.status === 429) return NextResponse.json({ success: false, error: KI_UEBERLASTET_MELDUNG }, { status: 429 });
      return NextResponse.json({ success: false, error: `KI-Fehler (${kiRes.status}): ${(await kiRes.text()).slice(0, 300)}` }, { status: 502 });
    }

    const kiJson = await kiRes.json();
    const raw = kiJson.choices?.[0]?.message?.content?.trim();
    if (!raw) return NextResponse.json({ success: false, error: 'KI hat keine Antwort geliefert' }, { status: 502 });

    let structured: Record<string, any>;
    try { structured = JSON.parse(raw); } catch { structured = { zusammenfassung: raw }; }

    const verworfen = pruefeUndFiltere(structured, ocrText);

    return NextResponse.json({
      success: true,
      laenge: structured.laenge ?? null, breite: structured.breite ?? null,
      hoehe: structured.hoehe ?? structured.hoehe_geschaetzt ?? null,
      hoeheGeschaetzt: structured.hoehe == null && structured.hoehe_geschaetzt != null,
      traufhoehe: structured.traufhoehe ?? null, dachform: structured.dachform ?? null,
      geschosse: structured.geschosse ?? null,
      zusammenfassung: structured.zusammenfassung || '',
      verworfen,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
