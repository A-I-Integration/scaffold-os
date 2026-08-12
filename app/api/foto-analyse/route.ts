import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ─── POST: KI-Foto-Analyse (Mistral Vision) ───
// Nimmt eine sessionId, holt die hochgeladenen Baustellen-Fotos aus
// project_media und lässt sie von einem Vision-Modell analysieren.
// Ergebnis: Fassaden-Beschreibung, erkannte Hindernisse, Hinweise
// für die Gerüstplanung. Nutzt denselben KI_API_KEY wie die Prognose,
// Modell separat über KI_VISION_MODEL einstellbar.
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

    // Fotos der Session holen (nur Bilder, max. 4 für die Analyse)
    const { data: media, error: dbError } = await supabase
      .from('project_media')
      .select('storage_path, file_type')
      .eq('session_id', sessionId)
      .like('file_type', 'image/%')
      .not('storage_path', 'like', '%/grundrisse/%') // Grundrisse gehören zur Grundriss-KI
      .order('created_at', { ascending: true })
      .limit(4);

    if (dbError) {
      return NextResponse.json({ success: false, error: `DB-Fehler: ${dbError.message}` }, { status: 500 });
    }
    if (!media || media.length === 0) {
      return NextResponse.json({ success: false, error: 'Keine Fotos in dieser Session gefunden' }, { status: 404 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const imageUrls = media.map((m) =>
      `${supabaseUrl}/storage/v1/object/public/project-media/${m.storage_path}`
    );

    const prompt = `Du bist ein erfahrener Gerüstbau-Planer. Analysiere diese Baustellen-Fotos.

Antworte AUSSCHLIESSLICH als JSON-Objekt mit genau diesen Feldern:
{
  "fassade": "<einer dieser Werte: Klinker, WDVS, Beton, Naturstein, Glas, Holz, Putz, Denkmalschutz — oder null wenn nicht erkennbar>",
  "dachform": "<einer dieser Werte: Satteldach, Flachdach, Pultdach, Walmdach, Mansarddach, Zeltdach — oder null wenn nicht erkennbar>",
  "hindernisse": ["<Liste aus: Erker, Balkon, Wintergarten, Kamin, Gaube, Markise — nur was wirklich zu sehen ist>"],
  "hauseingaenge": <Anzahl sichtbarer Hauseingänge als Zahl, oder null>,
  "garagen": <true/false — Garage oder Nebengebäude sichtbar?>,
  "werbeanlagen": <true/false — Werbeanlage/Schild an der Fassade?>,
  "durchfahrt": <true/false — Durchfahrt oder Durchgang im Gebäude sichtbar?>,
  "zusammenfassung": "<2-3 Sätze: Fassade, Zustand, Besonderheiten>",
  "hinweise": "<Stichpunkte: Was der Bauleiter bei der Gerüstplanung beachten sollte>"
}

Regeln: Nur erkennbare Dinge eintragen, im Zweifel null bzw. leere Liste. Keine Maße schätzen. Kein Text außerhalb des JSON.`;

    const kiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
          ],
        }],
        temperature: 0.3,
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
      model,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Unbekannter Fehler' }, { status: 500 });
  }
}
