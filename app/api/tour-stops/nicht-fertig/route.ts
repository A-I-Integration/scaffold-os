import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, serverErrorResponse, forbiddenResponse } from '@/lib/auth';
import { darfStoppAendern, eigeneEmployeeId } from '@/lib/touren/berechtigung';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// ============================================================
// SCAFFOLD OS – "Nicht fertig geworden" (Phase 90)
//
// Setzt einen Tour-Stopp auf status='skipped' UND merkt den
// zuständigen Mitarbeiter automatisch für den nächsten freien Werktag
// beim selben Projekt in der Wochenplanung (taeglicher_einsatz) vor,
// damit der offene Rest nicht untergeht ("Beides zusammenführen" /
// "Automatisch für nächsten freien Tag vormerken", Nutzer-Vorgabe).
//
// Bewusst NICHT über POST /api/wochenplanung: dieser Endpunkt ist auf
// admin/disponent/bauleiter beschränkt, hier soll aber JEDER
// Mitarbeiter, der laut Tour für den Stopp zuständig ist (siehe
// darfStoppAendern), sich selbst vormerken können.
// ============================================================

export async function POST(req: Request) {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const body = await req.json();
    const { stopId } = body;
    if (!stopId) {
      return NextResponse.json({ success: false, error: 'stopId erforderlich' }, { status: 400 });
    }

    const stoppRes = await fetch(`${url}/rest/v1/tour_stops?id=eq.${stopId}&select=tour_id,project_id`, { headers });
    if (!stoppRes.ok) throw new Error(await stoppRes.text());
    const stoppRows = await stoppRes.json();
    const stopp = stoppRows?.[0];
    if (!stopp) {
      return NextResponse.json({ success: false, error: 'Stopp nicht gefunden.' }, { status: 404 });
    }

    if (!(await darfStoppAendern(stopp.tour_id))) {
      return forbiddenResponse('Du bist für diese Tour nicht zuständig.');
    }

    const patchRes = await fetch(`${url}/rest/v1/tour_stops?id=eq.${stopId}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'skipped' }),
    });
    if (!patchRes.ok) throw new Error(await patchRes.text());

    // Ohne verknüpftes Projekt (z.B. ein reiner Materialtransport-Stopp
    // ohne Baustellen-Bezug) gibt es nichts, wofür ein Folgetag Sinn
    // ergibt - Status ist gesetzt, fertig.
    if (!stopp.project_id) {
      return NextResponse.json({ success: true, vorgemerkt: null });
    }

    const employeeId = await eigeneEmployeeId();
    if (!employeeId) {
      return NextResponse.json({ success: true, vorgemerkt: null });
    }

    // Nächsten freien Werktag suchen: Mo-Fr, kein bestehender Einsatz,
    // keine genehmigte Abwesenheit. Sicherheitsgrenze 30 Kalendertage.
    let vorgemerkt: string | null = null;
    const heute = new Date();
    for (let i = 1; i <= 30 && !vorgemerkt; i++) {
      const kandidat = new Date(heute);
      kandidat.setDate(kandidat.getDate() + i);
      const wochentag = kandidat.getDay();
      if (wochentag === 0 || wochentag === 6) continue;
      const iso = kandidat.toISOString().slice(0, 10);

      const [einsatzRes, abwesenheitRes] = await Promise.all([
        fetch(`${url}/rest/v1/taeglicher_einsatz?employee_id=eq.${employeeId}&einsatz_datum=eq.${iso}&select=employee_id&limit=1`, { headers }),
        fetch(`${url}/rest/v1/absences?employee_id=eq.${employeeId}&status=eq.approved&start_date=lte.${iso}&end_date=gte.${iso}&select=id&limit=1`, { headers }),
      ]);
      // Im Zweifel (Fehler beim Prüfen) diesen Tag NICHT belegen - lieber
      // einen Tag später erneut versuchen, als versehentlich doppelt planen.
      const belegt = einsatzRes.ok ? (await einsatzRes.json()).length > 0 : true;
      const abwesend = abwesenheitRes.ok ? (await abwesenheitRes.json()).length > 0 : false;
      if (belegt || abwesend) continue;

      const upsertRes = await fetch(`${url}/rest/v1/taeglicher_einsatz?on_conflict=employee_id,einsatz_datum`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          employee_id: employeeId,
          einsatz_datum: iso,
          project_id: stopp.project_id,
          notiz: 'Automatisch vorgemerkt: nicht fertig geworden',
          updated_at: new Date().toISOString(),
        }),
      });
      if (upsertRes.ok) vorgemerkt = iso;
    }

    // Team-Zuweisung sicherstellen (gleiches Muster wie in
    // /api/wochenplanung POST), damit der Mitarbeiter auf der
    // Baustellenseite als zuständig auftaucht.
    if (vorgemerkt) {
      const vorhandenRes = await fetch(`${url}/rest/v1/project_assignments?project_id=eq.${stopp.project_id}&employee_id=eq.${employeeId}&select=id`, { headers });
      const vorhanden = vorhandenRes.ok ? await vorhandenRes.json() : [];
      if (vorhanden.length === 0) {
        await fetch(`${url}/rest/v1/project_assignments`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ project_id: stopp.project_id, employee_id: employeeId, rolle: 'helfer' }),
        }).catch(() => { /* nicht kritisch - Vormerkung bleibt trotzdem gespeichert */ });
      }
    }

    return NextResponse.json({ success: true, vorgemerkt });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
