import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, requireOwnEmployeeOrAdmin, forbiddenResponse, serverErrorResponse } from '@/lib/auth';
import { urlaubskonto, urlaubsVorschau, type KontoEingabe, type UrlaubAbwesenheit } from '@/lib/urlaubskonto';

// ============================================================
// SCAFFOLD OS – Urlaubskonto
//
// GET ?employee_id=…                → Konto des Mitarbeiters (er selbst, Dispo, Chef)
// GET ?employee_id=…&von=…&bis=…    → zusätzlich die Wirkung eines neuen Antrags (Arbeitstage, bezahlt, unbezahlt)
// GET ?alle=1                       → Konten aller aktiven Mitarbeiter (nur Dispo und Chef)
//
// Es werden nur Urlaubstage ausgegeben, keine Löhne oder Personaldaten. Die Tabellen dahinter sind gesperrt (nur Service Role).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const fehler = (text: string, status = 400) => NextResponse.json({ success: false, error: text }, { status });
const heuteBerlin = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());

async function lies(pfad: string) {
  const r = await fetch(`${url}/rest/v1/${pfad}`, { headers });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
const urlaubsabwesenheiten = (zeilen: any[]): UrlaubAbwesenheit[] =>
  zeilen.filter((a) => a.type === 'vacation' && (a.status === 'approved' || a.status === 'pending'))
    .map((a) => ({ id: a.id, start_date: a.start_date, end_date: a.end_date, status: a.status }));

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams;
  try {
    if (q.get('alle') === '1') {
      const rolle = await pruefeRolle(['admin', 'disponent']);
      if (!rolle.ok) return rolle.response;
      const heute = heuteBerlin(), jahr = heute.slice(0, 4);
      const [ma, pers, anspruch, abw, kalender] = await Promise.all([
        lies('employees?status=eq.active&select=id,first_name,last_name&order=last_name.asc'),
        lies('employee_personal?select=employee_id,eintrittsdatum,austrittsdatum'),
        lies('employee_urlaubsanspruch?select=employee_id,tage_pro_jahr,gueltig_ab'),
        lies(`absences?type=eq.vacation&end_date=gte.${jahr}-01-01&start_date=lte.${jahr}-12-31&select=id,employee_id,start_date,end_date,type,status`),
        lies('betriebskalender?select=id,art,von,bis').catch(() => []), // fehlt die Tabelle noch (SQL Phase 136), läuft das Konto ohne Betriebskalender weiter
      ]);
      const konten = ma.map((m: any) => {
        const p = pers.find((x: any) => x.employee_id === m.id);
        const k: KontoEingabe = { anspruch: anspruch.filter((a: any) => a.employee_id === m.id), eintritt: p?.eintrittsdatum, austritt: p?.austrittsdatum, kalender };
        return { employee_id: m.id, name: `${m.first_name} ${m.last_name}`, konto: urlaubskonto(k, urlaubsabwesenheiten(abw.filter((a: any) => a.employee_id === m.id)), heute) };
      });
      return NextResponse.json({ success: true, konten });
    }

    const id = q.get('employee_id') || '';
    if (!UUID.test(id)) return fehler('employee_id erforderlich');
    const auth = await requireOwnEmployeeOrAdmin(id);
    if (!auth.allowed) return forbiddenResponse(auth.error);
    const [pers, anspruch, abw, kalender] = await Promise.all([
      lies(`employee_personal?employee_id=eq.${id}&select=eintrittsdatum,austrittsdatum`),
      lies(`employee_urlaubsanspruch?employee_id=eq.${id}&select=tage_pro_jahr,gueltig_ab`),
      lies(`absences?employee_id=eq.${id}&type=eq.vacation&select=id,start_date,end_date,type,status`),
      lies('betriebskalender?select=id,art,von,bis').catch(() => []), // fehlt die Tabelle noch (SQL Phase 136), läuft das Konto ohne Betriebskalender weiter
    ]);
    const k: KontoEingabe = { anspruch, eintritt: pers[0]?.eintrittsdatum, austritt: pers[0]?.austrittsdatum, kalender };
    const urlaube = urlaubsabwesenheiten(abw), heute = heuteBerlin();
    const von = q.get('von'), bis = q.get('bis');
    let vorschau;
    if (von || bis) {
      if (!von || !bis || !ISO.test(von) || !ISO.test(bis)) return fehler('von und bis als Datum angeben');
      if (bis < von) return fehler('„Bis“ darf nicht vor „Von“ liegen.');
      vorschau = urlaubsVorschau(k, urlaube, von, bis, heute);
    }
    return NextResponse.json({ success: true, konto: urlaubskonto(k, urlaube, heute), vorschau });
  } catch (err) {
    return serverErrorResponse(err, 'urlaubskonto/GET');
  }
}
