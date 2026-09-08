// ============================================================
// SCAFFOLD OS – KI-Team-Vorschlag für neue, noch nicht zugewiesene
// Aufträge (Phase 43)
//
// Anders als lib/umdisposition.ts (Umdisposition bei Ausfall eines
// bereits eingeteilten Fahrers) geht es hier um die ERST-Zuteilung:
// welche verfügbaren, passenden Mitarbeiter für einen neuen Auftrag
// an einem bestimmten Datum vorschlagen. Reiner Vorschlag – die
// tatsächliche Zuweisung bleibt ein separater, von einem Menschen
// bestätigter Schritt (bestehende AuftragsTeam-Komponente).
// ============================================================

import { kiFetchMitRetry, KI_UEBERLASTET_MELDUNG } from './ki-fetch';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function rest(path: string) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  if (!res.ok) return [];
  return res.json();
}

export interface TeamVorschlag {
  vorschlaege: { employee_id: string; name: string; rolle: string; begruendung: string }[];
  hinweis: string;
}

export async function buildTeamVorschlag(projectId: string, datumISO: string, gewerke: string[]): Promise<TeamVorschlag | { fehler: string }> {
  const apiKey = process.env.KI_API_KEY;
  if (!apiKey) return { fehler: 'KI_API_KEY fehlt (Vercel → Environment Variables).' };
  const baseUrl = process.env.KI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.KI_MODEL || 'gpt-4o-mini';

  const [employees, skills, absences, alleZuweisungen, alleProjekte] = await Promise.all([
    rest(`employees?status=eq.active&select=id,first_name,last_name`),
    rest(`employee_skills?select=employee_id,skill_name,level`),
    rest(`absences?status=eq.approved&start_date=lte.${datumISO}&end_date=gte.${datumISO}&select=employee_id`),
    rest(`project_assignments?select=employee_id,project_id`),
    rest(`projects?select=id,data`),
  ]);

  const abwesendIds = new Set(absences.map((a: any) => a.employee_id));
  // Bereits an einem Auftrag am selben Tag eingeteilt (grobe Näherung
  // über projektbeginn – Aufmaß erfasst kein Enddatum pro Zuweisung).
  const projektDatum = new Map(alleProjekte.map((p: any) => [p.id, p.data?.step1?.projektbeginn]));
  const beschaeftigtIds = new Set(
    alleZuweisungen.filter((z: any) => projektDatum.get(z.project_id) === datumISO).map((z: any) => z.employee_id)
  );

  const verfuegbar = employees
    .filter((e: any) => !abwesendIds.has(e.id) && !beschaeftigtIds.has(e.id))
    .map((e: any) => ({
      id: e.id, name: `${e.first_name} ${e.last_name}`,
      skills: skills.filter((s: any) => s.employee_id === e.id).map((s: any) => `${s.skill_name} (Lv.${s.level})`),
    }));

  if (verfuegbar.length === 0) {
    return { vorschlaege: [], hinweis: `Am ${datumISO} sind keine Mitarbeiter verfügbar (alle abwesend oder anderweitig eingeteilt).` };
  }

  const prompt = `Du hilfst bei der Personaleinteilung für einen Gerüstbau-Auftrag am ${datumISO}.
Benötigte Gewerke/Art der Arbeit: ${gewerke.join(', ') || 'nicht näher angegeben'}.

Verfügbare Mitarbeiter (nicht abwesend, nicht anderweitig am selben Tag eingeteilt):
${verfuegbar.map((v: any) => `- ${v.name} (id: ${v.id}) – Skills: ${v.skills.join(', ') || 'keine erfasst'}`).join('\n')}

Schlage 2-4 Mitarbeiter für dieses Team vor (typische Kolonnengröße). Antworte NUR als JSON:
{ "vorschlaege": [ { "employee_id": "...", "name": "...", "rolle": "z.B. Kolonnenführer/Helfer", "begruendung": "kurz, 1 Satz" } ], "hinweis": "1-2 Sätze Gesamteinschätzung" }
Nutze NUR die employee_id-Werte aus der Liste oben, erfinde keine.`;

  const res = await kiFetchMitRetry(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 500, response_format: { type: 'json_object' } }),
  });
  if (res.status === 429) return { fehler: KI_UEBERLASTET_MELDUNG };
  if (!res.ok) return { fehler: `KI-Fehler (${res.status}): ${(await res.text()).slice(0, 200)}` };

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) return { fehler: 'KI hat keine Antwort geliefert.' };

  try {
    const parsed = JSON.parse(raw);
    // Anti-Halluzination: nur Vorschläge behalten, deren employee_id
    // tatsächlich in der verfügbaren Liste vorkommt.
    const gueltigeIds = new Set(verfuegbar.map((v: any) => v.id));
    const vorschlaege = (parsed.vorschlaege || []).filter((v: any) => gueltigeIds.has(v.employee_id));
    return { vorschlaege, hinweis: parsed.hinweis || '' };
  } catch {
    return { fehler: 'KI-Antwort konnte nicht gelesen werden.' };
  }
}
