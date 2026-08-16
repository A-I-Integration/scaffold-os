import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Sprachnotiz-Transkription (Phase 18)
//
// POST (multipart/form-data, Feld „audio") → transkribiert eine
// auf der Baustelle gesprochene Notiz zu Text (Mistral Voxtral).
//
// Ablauf: Browser nimmt per MediaRecorder auf → diese Route →
// KI-Transkription → Text zurück an die App (wird ans
// Notizfeld angehängt). Die Audiodatei wird NICHT gespeichert –
// nur der Text bleibt im Projekt (datensparsam, DSGVO).
// ============================================================

async function callerRole(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    return profile?.role || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !['admin', 'bauleiter', 'disponent'].includes(role)) {
    return NextResponse.json({ success: false, error: 'Keine Berechtigung.' }, { status: 403 });
  }

  const apiKey = process.env.KI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'KI_API_KEY nicht hinterlegt.' }, { status: 400 });
  }
  const baseUrl = process.env.KI_BASE_URL || 'https://api.mistral.ai/v1';
  const model = process.env.KI_AUDIO_MODEL || 'voxtral-mini-latest';

  try {
    const form = await req.formData();
    const audio = form.get('audio') as File | null;
    if (!audio) {
      return NextResponse.json({ success: false, error: 'Keine Audiodatei übergeben.' }, { status: 400 });
    }
    // Sicherheitsgrenze: max. 15 MB (ca. 10 Minuten Sprache)
    if (audio.size > 15 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'Aufnahme zu groß (max. 15 MB).' }, { status: 400 });
    }

    const kiForm = new FormData();
    kiForm.append('file', audio, audio.name || 'notiz.webm');
    kiForm.append('model', model);
    kiForm.append('language', 'de');

    const kiRes = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: kiForm,
    });
    if (!kiRes.ok) throw new Error('Transkription fehlgeschlagen: ' + (await kiRes.text()));
    const kiJson = await kiRes.json();
    const text = (kiJson.text || '').trim();

    if (!text) {
      return NextResponse.json({ success: false, error: 'Nichts verstanden – bitte deutlicher sprechen oder näher ans Mikrofon.' }, { status: 422 });
    }

    return NextResponse.json({ success: true, text });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
