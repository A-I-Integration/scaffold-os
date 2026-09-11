import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { kiFetchMitRetry, KI_UEBERLASTET_MELDUNG } from '@/lib/ki-fetch';

// ============================================================
// SCAFFOLD OS – KI-Vorschlag für die Wochenplanung (Phase 54)
//
// Findet freie Tage (kein Einsatz, keine Abwesenheit) und offene,
// unzugewiesene Projekte, schlägt per KI eine sinnvolle Zuordnung vor.
// Reiner Vorschlag mit "Übernehmen"-Knopf je Zeile – keine automatische
// Änderung, wie bei den anderen KI-Funktionen in dieser App auch.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function rest(path: string) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  if (!res.ok) return [];
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });

    const { start, ende } = await req.json();
    if (!start || !ende) return NextResponse.json({ success: false, error: 'start und ende erforderlich' }, { status: 400 });

    const [employees, einsaetze, absences, projects] = await Promise.all([
      rest(`employees?status=eq.active&select=id,first_name,last_name`),
      rest(`taeglicher_einsatz?einsatz_datum=gte.${start}&einsatz_datum=lte.${ende}&select=employee_id,einsatz_datum,project_id`),
      rest(`absences?status=eq.approved&start_date=lte.${ende}&end_date=gte.${start}&select=employee_id,start_date,end_date`),
      rest(`projects?status=eq.active&select=id,name`),
    ]);

    // Freie Tage je Mitarbeiter ermitteln (Mo-Fr, kein Einsatz, keine Abwesenheit)
    const tage: string[] = [];
    for (let d = new Date(start); d <= new Date(ende); d.setDate(d.getDate() + 1)) {
      const wochentag = d.getDay();
      if (wochentag !== 0 && wochentag !== 6) tage.push(d.toISOString().slice(0, 10));
    }
    const freieTage: { employee_id: string; name: string; datum: string }[] = [];
    for (const emp of employees) {
      for (const datum of tage) {
        const hatEinsatz = einsaetze.some((e: any) => e.employee_id === emp.id && e.einsatz_datum === datum);
        const hatAbwesenheit = absences.some((a: any) => a.employee_id === emp.id && a.start_date <= datum && a.end_date >= datum);
        if (!hatEinsatz && !hatAbwesenheit) freieTage.push({ employee_id: emp.id, name: `${emp.first_name} ${emp.last_name}`, datum });
      }
    }

    const zugewieseneProjektIds = new Set(einsaetze.map((e: any) => e.project_id).filter(Boolean));
    const offeneProjekte = projects.filter((p: any) => !zugewieseneProjektIds.has(p.id));

    if (freieTage.length === 0 || offeneProjekte.length === 0) {
      return NextResponse.json({ success: true, hinweis: freieTage.length === 0 ? 'Alle Mitarbeiter sind diese Woche bereits verplant oder abwesend.' : 'Keine offenen, unzugewiesenen Projekte diese Woche.', vorschlaege: [] });
    }

    const apiKey = process.env.KI_API_KEY;
    if (!apiKey) return NextResponse.json({ success: false, error: 'KI_API_KEY fehlt' }, { status: 500 });
    const baseUrl = process.env.KI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.KI_MODEL || 'gpt-4o-mini';

    const prompt = `Wochenplanung für einen Gerüstbau-Betrieb, Zeitraum ${start} bis ${ende}.

Freie Tage (Mitarbeiter ohne Einsatz, ohne Abwesenheit):
${freieTage.map((f) => `- ${f.name} (id: ${f.employee_id}) am ${f.datum}`).join('\n')}

Offene, noch niemandem zugewiesene Projekte:
${offeneProjekte.map((p: any) => `- ${p.name} (id: ${p.id})`).join('\n')}

Schlage sinnvolle Zuordnungen vor (welcher Mitarbeiter an welchem Tag zu welchem Projekt). Antworte NUR als JSON:
{ "vorschlaege": [ { "employee_id": "...", "datum": "YYYY-MM-DD", "project_id": "...", "text": "kurzer Satz" } ], "hinweis": "1-2 Sätze Gesamteinschätzung" }
Nutze NUR die employee_id/project_id-Werte aus den Listen oben, erfinde keine. Maximal 8 Vorschläge.`;

    const res = await kiFetchMitRetry(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 800, response_format: { type: 'json_object' } }),
    });
    if (res.status === 429) return NextResponse.json({ success: false, error: KI_UEBERLASTET_MELDUNG }, { status: 429 });
    if (!res.ok) return NextResponse.json({ success: false, error: `KI-Fehler (${res.status})` }, { status: 502 });

    const kiJson = await res.json();
    const raw = kiJson.choices?.[0]?.message?.content;
    if (!raw) return NextResponse.json({ success: false, error: 'KI hat keine Antwort geliefert' }, { status: 502 });

    const parsed = JSON.parse(raw);
    // Anti-Halluzination: nur Vorschläge mit echten IDs aus den Listen behalten
    const gueltigeMitarbeiter = new Set(freieTage.map((f) => f.employee_id));
    const gueltigeProjekte = new Set(offeneProjekte.map((p: any) => p.id));
    const vorschlaege = (parsed.vorschlaege || []).filter((v: any) => gueltigeMitarbeiter.has(v.employee_id) && gueltigeProjekte.has(v.project_id));

    return NextResponse.json({ success: true, vorschlaege, hinweis: parsed.hinweis || '' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
