// ============================================================
// SCAFFOLD OS – KI-Umdisposition bei Ausfällen
//
// buildUmdispositionSuggestion(dateISO):
//   Holt Touren des Tages, betroffene Fahrer (krank/urlaub) und
//   verfügbare Mitarbeiter inkl. Skills und lässt Mistral einen
//   Ersatzplan vorschlagen. Wird genutzt von:
//     • /api/umdisposition (Button in der Planung)
//     • lib/notify.ts (automatisch bei Krankmeldung per Mail)
//
// Wirft bei Problemen KEINE Exception nach außen, sondern gibt
// null zurück – ein KI-Ausfall darf nie Abläufe blockieren.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

export interface UmdispositionVorschlag {
  tour: string;
  betroffen: string;
  ersatz: string;
  begruendung: string;
}

export interface UmdispositionResult {
  zusammenfassung: string;
  vorschlaege: UmdispositionVorschlag[];
  warnungen: string[];
}

async function rest(path: string) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function buildUmdispositionSuggestion(dateISO: string): Promise<UmdispositionResult | null> {
  const apiKey = process.env.KI_API_KEY;
  if (!apiKey) return null;

  try {
    const baseUrl = process.env.KI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.KI_MODEL || 'gpt-4o-mini';

    const [tours, stops, absences, employees, skills, drivers] = await Promise.all([
      rest(`tours?planned_date=eq.${dateISO}&status=in.(planned,in_progress)&select=id,name,status,vehicle:vehicle_id(name),driver:driver_id(id,name,employee_id)`),
      rest(`tour_stops?select=tour_id,address,stop_order&status=eq.pending&order=stop_order.asc`),
      rest(`absences?status=eq.approved&start_date=lte.${dateISO}&end_date=gte.${dateISO}&select=employee_id,type,start_date,end_date,employee:employee_id(id,first_name,last_name)`),
      rest(`employees?status=eq.active&select=id,first_name,last_name&order=last_name`),
      rest(`employee_skills?select=employee_id,skill_name,level`),
      rest(`drivers?is_active=eq.true&select=id,name,employee_id`),
    ]);

    const absentIds = new Set((absences || []).map((a: any) => a.employee_id));

    // Betroffene Touren: Fahrer ist abwesend
    const affected = (tours || []).filter((t: any) => t.driver?.employee_id && absentIds.has(t.driver.employee_id));
    if (affected.length === 0) {
      return {
        zusammenfassung: `Keine Touren am ${dateISO} von den Abwesenheiten betroffen – keine Umdisposition nötig.`,
        vorschlaege: [],
        warnungen: [],
      };
    }

    const absentNames = new Map((absences || []).map((a: any) => [
      a.employee_id,
      `${a.employee?.first_name || ''} ${a.employee?.last_name || ''}`.trim() || 'Unbekannt',
    ]));
    const driverEmpIds = new Set((drivers || []).map((d: any) => d.employee_id).filter(Boolean));

    const available = (employees || [])
      .filter((e: any) => !absentIds.has(e.id))
      .map((e: any) => {
        const s = (skills || []).filter((sk: any) => sk.employee_id === e.id).map((sk: any) => sk.skill_name);
        const isDriver = driverEmpIds.has(e.id);
        return `${e.first_name} ${e.last_name}${isDriver ? ' (Fahrer)' : ''}${s.length ? ' — Skills: ' + s.join(', ') : ''}`;
      });

    const tourLines = affected.map((t: any) => {
      const tourStops = (stops || []).filter((s: any) => s.tour_id === t.id);
      return `Tour "${t.name}" — Fahrer: ${t.driver?.name || '?'} (ABWESEND: ${absentNames.get(t.driver?.employee_id) || 'ja'}), Fahrzeug: ${t.vehicle?.name || '?'}, Stopps: ${tourStops.map((s: any) => s.address).join(' → ') || 'keine'}`;
    }).join('\n');

    const prompt = `Du bist der Disponent eines Gerüstbau-Betriebs. Für den ${dateISO} fallen Fahrer aus. Schlage die beste Umdisposition vor.

BETROFFENE TOUREN:
${tourLines}

ABWESEND AM ${dateISO}:
${(absences || []).map((a: any) => `${absentNames.get(a.employee_id)} (${a.type === 'sick' ? 'krank' : a.type})`).join('\n')}

VERFÜGBARE MITARBEITER:
${available.join('\n') || '(keine)'}

REGELN:
- Jede betroffene Tour braucht einen Ersatzfahrer (bevorzugt eingetragene Fahrer).
- Berücksichtige Skills, wenn sie zur Tour passen müssen.
- Wenn niemand passt: sage es klar in den Warnungen statt zu erfinden.

Antworte AUSSCHLIESSLICH als JSON:
{
  "zusammenfassung": "<1-2 Sätze Gesamtlage>",
  "vorschlaege": [
    { "tour": "<Tourname>", "betroffen": "<abwesender Fahrer>", "ersatz": "<vorgeschlagener Ersatz>", "begruendung": "<1 Satz>" }
  ],
  "warnungen": ["<z.B. Tour X kann nicht besetzt werden>"]
}`;

    const kiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      }),
    });

    if (!kiRes.ok) return null;
    const kiJson = await kiRes.json();
    const raw = kiJson.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return {
      zusammenfassung: parsed.zusammenfassung || '',
      vorschlaege: Array.isArray(parsed.vorschlaege) ? parsed.vorschlaege : [],
      warnungen: Array.isArray(parsed.warnungen) ? parsed.warnungen : [],
    };
  } catch {
    return null; // KI-Ausfall darf nie etwas blockieren
  }
}
