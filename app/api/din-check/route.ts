import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – DIN EN 12811 KI-Check (Phase 18)
//
// POST { projekt_id } → Prüft die Aufmaß-Daten eines Projekts
// gegen die Kernanforderungen der DIN EN 12811 (Gerüste:
// Leistungsanforderungen, Entwurf, Konstruktion).
//
// WICHTIG (EU AI Act / Haftung): Das ist ein KI-HINWEIS,
// keine Statik und keine Abnahme. Die fachliche Prüfung und
// Verantwortung bleibt immer beim Gerüstbauer-Fachbetrieb.
// Das wird auch in der UI so ausgesagt.
//
// Ergebnis wird im Projekt (data.dinCheck) gespeichert.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  'apikey': key,
  'Authorization': `Bearer ${key}`,
};

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
  const model = process.env.KI_MODEL || 'mistral-small-2506';

  try {
    const { projekt_id } = await req.json();
    if (!projekt_id) {
      return NextResponse.json({ success: false, error: 'projekt_id fehlt.' }, { status: 400 });
    }

    // Projektdaten laden
    const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${projekt_id}&select=id,name,data`, { headers });
    if (!pRes.ok) throw new Error(await pRes.text());
    const rows = await pRes.json();
    const projekt = rows?.[0];
    if (!projekt) {
      return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 });
    }

    const d = projekt.data || {};
    const s1 = d.step1 || d.s1 || {};
    const s2 = d.step2 || d.s2 || {};
    const s3 = d.step3 || d.s3 || {};
    const s6 = d.step6 || d.s6 || {};
    const ki = s6.kiResult || s6.ki_result || d.kiResult || {};

    // Nur die für die Prüfung relevanten Fakten, kompakt
    const fakten = {
      projekt: projekt.name,
      adresse: s1.adresse || null,
      gebaeude: {
        hoehe_m: s2.hoehe ?? s2.gebaeudehoehe ?? null,
        laenge_m: s2.laenge ?? null,
        breite_m: s2.breite ?? null,
        dachform: s2.dachform ?? null,
        fassade: s2.fassade ?? null,
        hindernisse: s2.hindernisse ?? null,
      },
      geruest: {
        system: s3.system ?? s3.geruestsystem ?? null,
        lastklasse: s3.lastklasse ?? null,
        breite_klasse: s3.geruestbreite ?? s3.breite ?? null,
        verwendung: s3.verwendung ?? s3.zweck ?? null,
      },
      ki_material: {
        rahmen: ki.frames ?? ki.rahmen ?? null,
        belaegen_m2: ki.decksArea ?? ki.belag_flaeche ?? null,
        anker: ki.anchors ?? ki.anker ?? null,
        netze_m2: ki.netsArea ?? ki.netz_flaeche ?? null,
      },
      besonderheiten: d.fotoAnalyse?.zusammenfassung ?? d.fotoAnalyse?.hinweise ?? null,
    };

    const prompt = `Du bist ein erfahrener Gerüstbau-Fachplaner. Prüfe die folgenden Aufmaß-Daten gegen die Kernanforderungen von DIN EN 12811-1 (Gerüste – Leistungsanforderungen, Entwurf, Bemessung), DIN EN 12810-1/-2 (Fassadengerüste aus vorgefertigten Bauteilen – nur relevant, wenn ein Systemgerüst/Rahmengerüst verwendet wird) und TRBS 2121-1 (Gefährdungen von Personen durch Absturz bei Bereitstellung und Benutzung von Gerüsten).

PRÜFE diese Punkte (festes Gerüst):
1. Lastklasse passend zur Verwendung (z. B. LK 3 für typische Fassadenarbeiten, LK 4+ bei Materiallagerung auf dem Gerüst) – DIN EN 12811-1
2. Verankerung/Anker: ausreichende Ankerdichte bei der Gebäudehöhe (Faustregel: ab etwa 8 m Höhe Verankerung erforderlich, Dichte steigt mit Höhe und Windzone) – DIN EN 12811-1
3. Breitenklasse des Gerüsts passend zur Nutzung – DIN EN 12811-1
4. Seitenschutz (Geländerholm, Zwischenholm, Bordbrett – dreiteiliger Seitenschutz) bei Arbeitsbelägen über 1 m Absturzhöhe – TRBS 2121-1
5. Fangvorrichtungen/Netze bei entsprechender Höhe oder Dachrand – TRBS 2121-1
6. Zugänge/Aufstiege und Treppen oder Leitersteige – DIN EN 12811-1 / TRBS 2121-1
7. Beläge: durchgehend, ausreichende Fläche für Lastklasse – DIN EN 12811-1
8. Absturzsicherung während Auf-/Abbau (vorlaufender Seitenschutz oder PSAgA, solange der endgültige Seitenschutz noch fehlt) – TRBS 2121-1
9. Sofern Systemgerüst (Rahmengerüst): passende Bauteile/Systemfreigabe des Herstellers gemäß DIN EN 12810, sonst "unbekannt"
10. Besonderheiten aus den Fotos (Hindernisse, Durchfahrten → Konsolen/Schirme nötig?)

FAKTEN ZUM PROJEKT:
${JSON.stringify(fakten, null, 2)}

Antworte AUSSCHLIESSLICH als JSON:
{
  "checks": [
    { "regel": "<kurzer Titel>", "norm": "<z.B. DIN EN 12811-1 oder TRBS 2121-1>", "status": "<ok|warnung|kritisch|unbekannt>", "hinweis": "<1-2 Sätze, konkret auf DIESES Projekt bezogen>" }
  ],
  "zusammenfassung": "<2-3 Sätze Gesamteinschätzung>"
}

Regeln:
- Genau die 10 Prüfpunkte oben, in dieser Reihenfolge.
- "unbekannt" wenn Daten fehlen – NICHT raten. Erfinde KEINE Normwerte, die nicht aus den Fakten oder allgemein bekannten Faustregeln ableitbar sind.
- "kritisch" nur bei klarem Sicherheitsproblem, "warnung" bei zu prüfenden Punkten.
- Erinnere in der Zusammenfassung daran, dass dies ein KI-Hinweis ist, keine Prüfung durch eine befähigte Person nach TRBS 2121-1 ersetzt und keine Abnahme darstellt.
- Deutsch, sachlich, kein Text außerhalb des JSON.`;

    const kiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });
    if (!kiRes.ok) throw new Error('KI-Anfrage fehlgeschlagen: ' + (await kiRes.text()));
    const kiJson = await kiRes.json();
    const roh = kiJson.choices?.[0]?.message?.content || '{}';
    const ergebnis = JSON.parse(roh);

    const dinCheck = {
      geprueft_am: new Date().toISOString(),
      modell: model,
      checks: Array.isArray(ergebnis.checks) ? ergebnis.checks : [],
      zusammenfassung: ergebnis.zusammenfassung || '',
    };

    // Im Projekt speichern (data mergen, nichts geht verloren)
    await fetch(`${url}/rest/v1/projects?id=eq.${projekt_id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ data: { ...d, dinCheck } }),
    });

    return NextResponse.json({ success: true, dinCheck });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
