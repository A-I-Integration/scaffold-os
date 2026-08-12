import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ─── POST: KI-Grundriss-Analyse ───
// Nimmt eine sessionId, holt die hochgeladenen Grundrisse aus
// project_media (Pfad temp/{sessionId}/grundrisse/) und lässt sie
// von einem Vision-Modell auswerten:
//   - Bilder (JPG/PNG)  → direkt als image_url an das Vision-Modell
//   - PDF-Pläne         → vorher Text-Extraktion per Mistral-OCR,
//                         der Text geht als Kontext mit in die Analyse
// Ergebnis: strukturierte Felder (Maße, Dachform, Eingänge …),
// die Schritt 2 des Aufmaßes vorbefüllt. Gleiches Env-Muster wie
// /api/foto-analyse (KI_API_KEY / KI_BASE_URL / KI_VISION_MODEL,
// OCR-Modell separat über KI_OCR_MODEL einstellbar).
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.KI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'KI_API_KEY ist noch nicht hinterlegt (Vercel → Settings → Environment Variables).',
      }, { status: 400 });
    }
    const baseUrl = process.env.KI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.KI_VISION_MODEL || 'mistral-small-2506';
    const ocrModel = process.env.KI_OCR_MODEL || 'mistral-ocr-latest';

    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId fehlt' }, { status: 400 });
    }

    // Eingeloggter Nutzer? (Aufmaß ist nur für admin/bauleiter freigegeben)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });
    }

    // Grundrisse der Session holen (max. 4 für die Analyse)
    const { data: media, error: dbError } = await supabase
      .from('project_media')
      .select('storage_path, file_type')
      .eq('session_id', sessionId)
      .like('storage_path', '%/grundrisse/%')
      .order('created_at', { ascending: true })
      .limit(4);

    if (dbError) {
      return NextResponse.json({ success: false, error: `DB-Fehler: ${dbError.message}` }, { status: 500 });
    }
    if (!media || media.length === 0) {
      return NextResponse.json({ success: false, error: 'Keine Grundrisse in dieser Session gefunden' }, { status: 404 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const images = media.filter((m) => m.file_type?.startsWith('image/'));
    const pdfs = media.filter((m) => m.file_type === 'application/pdf');

    // ─── PDFs: Text per Mistral-OCR extrahieren ───
    let ocrText = '';
    const pdfErrors: string[] = [];
    for (const pdf of pdfs) {
      const docUrl = `${supabaseUrl}/storage/v1/object/public/project-media/${pdf.storage_path}`;
      try {
        const ocrRes = await fetch(`${baseUrl}/ocr`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ocrModel,
            document: { type: 'document_url', document_url: docUrl },
          }),
        });
        if (!ocrRes.ok) {
          const t = await ocrRes.text();
          pdfErrors.push(`OCR (${ocrRes.status}): ${t.slice(0, 150)}`);
          continue;
        }
        const ocrJson = await ocrRes.json();
        const pages: string[] = (ocrJson.pages || []).map((p: any) => p.markdown || '').filter(Boolean);
        if (pages.length) ocrText += `\n\n--- PDF-Plan ---\n${pages.join('\n\n')}`;
      } catch (e: any) {
        pdfErrors.push(`OCR fehlgeschlagen: ${e.message}`);
      }
    }

    if (images.length === 0 && !ocrText) {
      const detail = pdfErrors.length ? ` (${pdfErrors.join(' | ')})` : '';
      return NextResponse.json({
        success: false,
        error: `Keine auswertbaren Grundrisse gefunden${detail}. Tipp: Plan als Foto/PNG hochladen.`,
      }, { status: 422 });
    }

    const imageUrls = images.map((m) =>
      `${supabaseUrl}/storage/v1/object/public/project-media/${m.storage_path}`
    );

    const prompt = `Du bist ein erfahrener Gerüstbau-Planer. Analysiere diese Grundrisse/Baupläne${ocrText ? ' (Bilder und/oder per OCR extrahierter Plan-Text, siehe unten)' : ''}.

Antworte AUSSCHLIESSLICH als JSON-Objekt mit genau diesen Feldern:
{
  "laenge": <Gebäudelänge in Metern als Zahl – NUR wenn im Plan eindeutig vermaßt, sonst null>,
  "breite": <Gebäudebreite in Metern als Zahl – NUR wenn eindeutig vermaßt, sonst null>,
  "hoehe": <Gebäudehöhe in Metern als Zahl – NUR wenn vermaßt (z. B. Schnitt/Ansicht im Plan), sonst null>,
  "traufhoehe": <Traufhöhe in Metern als Zahl – NUR wenn vermaßt, sonst null>,
  "dachform": "<einer dieser Werte: Satteldach, Flachdach, Pultdach, Walmdach, Mansarddach, Zeltdach — oder null wenn nicht erkennbar>",
  "hauseingaenge": <Anzahl erkennbarer Hauseingänge als Zahl, oder null>,
  "garagen": <true/false — Garage oder Nebengebäude im Plan?>,
  "durchfahrt": <true/false — Durchfahrt oder Durchgang im Gebäude?>,
  "hindernisse": ["<Liste aus: Erker, Balkon, Wintergarten, Kamin, Gaube, Markise — nur was im Plan wirklich eingezeichnet ist>"],
  "zusammenfassung": "<2-3 Sätze: Gebäudeform, Maße, Besonderheiten>",
  "hinweise": "<Stichpunkte: Was der Bauleiter bei der Gerüstplanung beachten sollte>"
}

Regeln: Maße NUR übernehmen, wenn sie im Plan explizit als Bemaßung stehen (nicht schätzen!). Im Zweifel null bzw. leere Liste. Kein Text außerhalb des JSON.${ocrText ? `\n\nEXTRAHIERTER PLAN-TEXT (OCR):${ocrText}` : ''}`;

    const content: any[] = [{ type: 'text', text: prompt }];
    for (const url of imageUrls) {
      content.push({ type: 'image_url', image_url: { url } });
    }

    const kiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        temperature: 0.2,
        max_tokens: 900,
        response_format: { type: 'json_object' },
      }),
    });

    if (!kiRes.ok) {
      const errText = await kiRes.text();
      return NextResponse.json({
        success: false,
        error: `KI-Fehler (${kiRes.status}): ${errText.slice(0, 300)}`,
      }, { status: 502 });
    }

    const kiJson = await kiRes.json();
    const raw = kiJson.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return NextResponse.json({ success: false, error: 'KI hat keine Antwort geliefert' }, { status: 502 });
    }

    // Strukturierte Antwort parsen (Fallback: Rohtext als Zusammenfassung)
    let structured: Record<string, any>;
    try {
      structured = JSON.parse(raw);
    } catch {
      structured = { zusammenfassung: raw, hinweise: '', hindernisse: [] };
    }

    const analysis = [
      structured.zusammenfassung || '',
      structured.hinweise ? `\nHINWEISE:\n${structured.hinweise}` : '',
    ].filter(Boolean).join('\n');

    return NextResponse.json({
      success: true,
      analysis,
      structured,
      analyzedCount: media.length,
      pdfErrors: pdfErrors.length ? pdfErrors : undefined,
      model,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Unbekannter Fehler' }, { status: 500 });
  }
}
