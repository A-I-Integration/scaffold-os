import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { leseAlleZeilen } from '@/lib/zeit-validierung';
import { berechneLohnkosten, monatsGrenzen, type ZeitBuchung } from '@/lib/stundenzettel';
import type { Stundenlohn } from '@/lib/stundenlohn';

// ============================================================
// SCAFFOLD OS – Lohnkosten je Baustelle (Bereich Personal)
// GET ?monat=YYYY-MM → direkte Lohnkosten je Baustelle und Mitarbeiter (Netto-Stunden × Stundenlohn am Arbeitstag).
// Nur Admin (Chef): enthält Löhne. Stunden ohne hinterlegten Lohn werden getrennt ausgewiesen.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

export async function GET(req: NextRequest) {
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  const g = monatsGrenzen(new URL(req.url).searchParams.get('monat') || '');
  if (!g) return NextResponse.json({ success: false, error: 'monat im Format JJJJ-MM erforderlich' }, { status: 400 });
  try {
    const buchungen = await leseAlleZeilen<ZeitBuchung>(
      `${url}/rest/v1/time_entries?select=id,employee_id,project_id,work_date,hours&work_date=gte.${g.von}&work_date=lte.${g.bis}&order=work_date.asc`, headers);
    const mitarbeiterIds = [...new Set(buchungen.map((b) => b.employee_id))];
    const projektIds = [...new Set(buchungen.map((b) => b.project_id).filter(Boolean))] as string[];
    const loehne: Record<string, Pick<Stundenlohn, 'stundenlohn' | 'gueltig_ab'>[]> = {};
    const namen: Record<string, string> = {};
    if (mitarbeiterIds.length) {
      const liste = mitarbeiterIds.join(',');
      const [lr, er] = await Promise.all([
        fetch(`${url}/rest/v1/employee_wages?employee_id=in.(${liste})&select=employee_id,stundenlohn,gueltig_ab`, { headers }),
        fetch(`${url}/rest/v1/employees?id=in.(${liste})&select=id,first_name,last_name`, { headers }),
      ]);
      if (!lr.ok) throw new Error(await lr.text());
      if (!er.ok) throw new Error(await er.text());
      for (const l of await lr.json()) (loehne[l.employee_id] ??= []).push({ stundenlohn: Number(l.stundenlohn), gueltig_ab: l.gueltig_ab });
      for (const e of await er.json()) namen[e.id] = `${e.first_name} ${e.last_name}`.trim();
    }
    const projekte: Record<string, string> = {};
    if (projektIds.length) {
      const pr = await fetch(`${url}/rest/v1/projects?id=in.(${projektIds.join(',')})&select=id,name`, { headers });
      if (!pr.ok) throw new Error(await pr.text());
      for (const p of await pr.json()) projekte[p.id] = p.name || 'Baustelle';
    }
    const k = berechneLohnkosten(buchungen, loehne);
    return NextResponse.json({
      success: true, monat: g.von.slice(0, 7),
      baustellen: k.baustellen.map((b) => ({
        projectId: b.projectId, name: b.projectId ? projekte[b.projectId] || 'Baustelle' : 'Ohne Baustelle', stunden: b.stunden, kosten: b.kosten,
        mitarbeiter: b.mitarbeiter.map((m) => ({ ...m, name: namen[m.employeeId] || 'Mitarbeiter' })),
      })),
      ohneLohn: { stunden: k.ohneLohn.stunden, mitarbeiter: k.ohneLohn.mitarbeiter.map((m) => ({ ...m, name: namen[m.employeeId] || 'Mitarbeiter' })) },
      summe: k.summe,
    });
  } catch (err) {
    return serverErrorResponse(err, 'lohnkosten/GET');
  }
}
