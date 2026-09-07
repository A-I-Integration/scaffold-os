import { NextRequest, NextResponse } from 'next/server';
import { kiFetchMitRetry, KI_UEBERLASTET_MELDUNG } from '@/lib/ki-fetch';
import { createClient } from '@/lib/supabase/server';
import { deterministicFromText, escapeRegExp, pruefeUndFiltere } from '@/lib/grundriss-parsing';

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
        const ocrRes = await kiFetchMitRetry(`${baseUrl}/ocr`, {
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
  "laenge": <Außenmaß Gebäudelänge in Metern als Zahl – NUR das Gesamt-Außenmaß (Angabe "Hausmaß"/"Außenmaß" oder äußerste Bemaßungskette), sonst null>,
  "breite": <Außenmaß Gebäudebreite in Metern als Zahl – gleiche Regel wie laenge>,
  "hoehe": <Gebäudehöhe in Metern als Zahl – NUR wenn vermaßt (z. B. Schnitt/Ansicht im Plan), sonst null>,
  "traufhoehe": <Traufhöhe in Metern als Zahl – NUR wenn vermaßt, sonst null>,
  "geschosse": <Anzahl Geschosse als Zahl, wenn im Plan erkennbar (z. B. "EG + OG" = 2, "3-geschossig" = 3), sonst null>,
  "dachform": "<einer dieser Werte: Satteldach, Flachdach, Pultdach, Walmdach, Mansarddach, Zeltdach — oder null wenn nicht erkennbar>",
  "hauseingaenge": <Anzahl erkennbarer Hauseingänge als Zahl, oder null>,
  "garagen": <true/false — Garage oder Nebengebäude im Plan eingezeichnet oder beschriftet?>,
  "durchfahrt": <true/false — Durchfahrt oder Durchgang im Gebäude?>,
  "hindernisse": ["<Liste aus: Erker, Balkon, Wintergarten, Kamin, Gaube, Markise — nur was im Plan wirklich eingezeichnet oder beschriftet ist>"],
  "belege": {
    "laenge": "<wörtlich zitierte Beschriftung aus dem Plan, z. B. \"Hausmaß: 10,00 × 12,00 m\" — oder null>",
    "breite": "<ebenso>", "hoehe": "<ebenso>", "traufhoehe": "<ebenso>", "dachform": "<ebenso>"
  },
  "zusammenfassung": "<2-3 Sätze: Gebäudeform, Maße, Besonderheiten>",
  "hinweise": "<Stichpunkte: Was der Bauleiter bei der Gerüstplanung beachten sollte>"
}

STRENGE REGELN:
1. JEDER Zahlenwert (laenge, breite, hoehe, traufhoehe) braucht einen Eintrag in "belege": die wörtlich zitierte Bemaßung/Beschriftung, aus der er stammt. Kein Beleg → null.
2. NIEMALS RECHNEN: keine Addition von Bemaßungsketten, keine Umrechnung, keine Schätzung. Jede Zahl muss EXAKT so im Plan stehen.
3. laenge/breite = Gesamt-Außenmaß ("Hausmaß"/"Außenmaß" oder äußerste Bemaßungskette). Innenraum-Maße (Zimmer, Wände) NIEMALS.
4. Bei mehreren Geschoss-Plänen mit gleichem Außenmaß: einmal übernehmen, Geschosse zählen.
5. Nichts erfinden: Garage/Erker/Dachform nur wenn eingezeichnet oder beschriftet. Im Zweifel null bzw. leere Liste.
6. Kein Text außerhalb des JSON.${ocrText ? `\n\nEXTRAHIERTER PLAN-TEXT (OCR):${ocrText}` : ''}`;

    const content: any[] = [{ type: 'text', text: prompt }];
    for (const url of imageUrls) {
      content.push({ type: 'image_url', image_url: { url } });
    }

    const kiRes = await kiFetchMitRetry(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        temperature: 0.2,
        max_tokens: 1400,
        response_format: { type: 'json_object' },
      }),
    });

    if (!kiRes.ok) {
      if (kiRes.status === 429) {
        return NextResponse.json({ success: false, error: KI_UEBERLASTET_MELDUNG }, { status: 429 });
      }
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

    // ─── Deterministik + Anti-Halluzination + Plausibilität (gemeinsame Logik) ───
    const verworfen: string[] = pruefeUndFiltere(structured, ocrText);
    // Route-spezifisch (nur hier gebraucht, nicht im einfacheren CAD-Upload):
    // Dachform-Beleg wird schon oben geprüft; hier noch Hindernisse/Garage/Durchfahrt.
    if (ocrText) {
      if (Array.isArray(structured.hindernisse)) {
        const belegte = structured.hindernisse.filter((h: any) =>
          typeof h === 'string' && new RegExp(escapeRegExp(h), 'i').test(ocrText));
        const gestrichene = structured.hindernisse.filter((h: any) => !belegte.includes(h));
        if (gestrichene.length) verworfen.push(`Hindernisse ohne Plan-Beleg: ${gestrichene.join(', ')}`);
        structured.hindernisse = belegte;
      }
      if (structured.garagen === true && !/garage|nebengebäude|carport/i.test(ocrText)) {
        verworfen.push('Garage/Nebengebäude (im Plan-Text nicht belegt)');
        structured.garagen = false;
      }
      if (structured.durchfahrt === true && !/durchfahrt|durchgang/i.test(ocrText)) {
        verworfen.push('Durchfahrt (im Plan-Text nicht belegt)');
        structured.durchfahrt = false;
      }
    }
    // (Höhe/Traufhöhe-Tausch und Höhe-Schätzung je Geschoss laufen bereits
    // gemeinsam in pruefeUndFiltere() oben – hier nicht mehr doppelt.)

    const analysis = [
      structured.zusammenfassung || '',
      structured.hinweise ? `\nHINWEISE:\n${structured.hinweise}` : '',
    ].filter(Boolean).join('\n');

    return NextResponse.json({
      success: true,
      analysis,
      structured,
      verworfen: verworfen.length ? verworfen : undefined,
      analyzedCount: media.length,
      pdfErrors: pdfErrors.length ? pdfErrors : undefined,
      model,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Unbekannter Fehler' }, { status: 500 });
  }
}
