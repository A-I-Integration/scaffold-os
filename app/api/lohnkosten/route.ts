import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { leseAlleZeilen } from '@/lib/zeit-validierung';
import { berechneLohnkosten, monatsGrenzen, type ZeitBuchung } from '@/lib/stundenzettel';
import type { Stundenlohn } from '@/lib/stundenlohn';
import { verteileSpesen } from '@/lib/spesen-zentral';
import { ladeSpesenTage } from '@/lib/spesen-server';

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
    const buchungsUrl = (sp: string) => `${url}/rest/v1/time_entries?select=${sp}&work_date=gte.${g.von}&work_date=lte.${g.bis}&order=work_date.asc`;
    let buchungen: ZeitBuchung[];
    try { buchungen = await leseAlleZeilen<ZeitBuchung>(buchungsUrl('id,employee_id,project_id,work_date,hours,spesen_euro'), headers); }
    catch { buchungen = await leseAlleZeilen<ZeitBuchung>(buchungsUrl('id,employee_id,project_id,work_date,hours'), headers); } // Spesen-Spalte fehlt in älteren Datenbanken
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
    // Spesen aus der zentralen Verteilung (Tagesberechnung vor Handeingabe, je Tag nur ein Betrag), nach Stunden auf die Baustellen des Tages verteilt
    const { tage: spesenTage } = await ladeSpesenTage(g.von, g.bis);
    const sv = verteileSpesen(buchungen, spesenTage);
    const spesenJe = new Map<string, { gesamt: number; ma: Map<string, number> }>();
    buchungen.forEach((b, i) => {
      const betrag = sv.jeBuchung[i]; if (!(betrag > 0)) return;
      const z = spesenJe.get(b.project_id ?? '') ?? { gesamt: 0, ma: new Map() };
      z.gesamt = Math.round((z.gesamt + betrag) * 100) / 100;
      z.ma.set(b.employee_id, Math.round(((z.ma.get(b.employee_id) || 0) + betrag) * 100) / 100);
      spesenJe.set(b.project_id ?? '', z);
    });
    const liste = k.baustellen.map((b) => ({ ...b }));
    for (const pid of spesenJe.keys()) if (!liste.some((b) => (b.projectId ?? '') === pid)) liste.push({ projectId: pid || null, stunden: 0, kosten: 0, mitarbeiter: [] });
    return NextResponse.json({
      success: true, monat: g.von.slice(0, 7),
      baustellen: liste.map((b) => {
        const sp = spesenJe.get(b.projectId ?? '');
        const ma = b.mitarbeiter.map((m) => ({ ...m, name: namen[m.employeeId] || 'Mitarbeiter', spesen: sp?.ma.get(m.employeeId) || 0 }));
        for (const [id, betrag] of sp?.ma ?? []) if (!ma.some((m) => m.employeeId === id)) ma.push({ employeeId: id, stunden: 0, kosten: 0, name: namen[id] || 'Mitarbeiter', spesen: betrag });
        return { projectId: b.projectId, name: b.projectId ? projekte[b.projectId] || 'Baustelle' : 'Ohne Baustelle', stunden: b.stunden, kosten: b.kosten, spesen: sp?.gesamt || 0, mitarbeiter: ma };
      }),
      ohneLohn: { stunden: k.ohneLohn.stunden, mitarbeiter: k.ohneLohn.mitarbeiter.map((m) => ({ ...m, name: namen[m.employeeId] || 'Mitarbeiter' })) },
      summe: { ...k.summe, spesen: Math.round([...spesenJe.values()].reduce((s, x) => s + x.gesamt, 0) * 100) / 100 },
      spesenOhneZuordnung: sv.ohneZuordnung.map((o) => ({ ...o, name: namen[o.employee_id] || 'Mitarbeiter' })),
    });
  } catch (err) {
    return serverErrorResponse(err, 'lohnkosten/GET');
  }
}
