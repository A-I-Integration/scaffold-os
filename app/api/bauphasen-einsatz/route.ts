import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { validiere, uuid } from '@/lib/validation';

// ============================================================
// SCAFFOLD OS – Bauphasen: Personalvorschlag in die Wochenplanung eintragen
//
// POST { project_id, eintraege: [{ employee_id, einsatz_datum }] }
// Trägt GENAU diese Tage ein (anders als die Wochenplanung, die den Einsatz über die ganze Projektdauer fortschreibt).
// Ein Mitarbeiter, der an dem Tag schon auf einer ANDEREN Baustelle eingeplant ist, wird übersprungen, nie überschrieben.
// Nur Admin und Disposition.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const SCHREIB_ROLLEN = ['admin', 'disponent'];

const schema = z.object({
  project_id: uuid,
  eintraege: z.array(z.object({ employee_id: uuid, einsatz_datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).min(1).max(400),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile?.role || !SCHREIB_ROLLEN.includes(profile.role)) {
      return NextResponse.json({ success: false, error: 'Nur Admin und Disposition dürfen Mitarbeiter in die Wochenplanung eintragen.' }, { status: 403 });
    }
    const parsed = validiere(schema, await req.json());
    if (!parsed.ok) return parsed.response;
    const { project_id, eintraege } = parsed.data;

    const tage = eintraege.map((e) => e.einsatz_datum).sort();
    const ids = [...new Set(eintraege.map((e) => e.employee_id))];
    const bestehendRes = await fetch(
      `${url}/rest/v1/taeglicher_einsatz?einsatz_datum=gte.${tage[0]}&einsatz_datum=lte.${tage[tage.length - 1]}&employee_id=in.(${ids.join(',')})&select=employee_id,einsatz_datum,project_id`,
      { headers },
    );
    if (!bestehendRes.ok) throw new Error(await bestehendRes.text());
    const bestehend: { employee_id: string; einsatz_datum: string; project_id: string | null }[] = await bestehendRes.json();
    const belegt = new Map(bestehend.map((b) => [`${b.employee_id}|${b.einsatz_datum}`, b.project_id]));

    const eintragen: { employee_id: string; einsatz_datum: string; project_id: string; notiz: string; updated_at: string }[] = [];
    const uebersprungen: { employee_id: string; einsatz_datum: string; grund: string }[] = [];
    for (const e of eintraege) {
      const vorhanden = belegt.get(`${e.employee_id}|${e.einsatz_datum}`);
      if (vorhanden && vorhanden !== project_id) { uebersprungen.push({ ...e, grund: 'schon auf einer anderen Baustelle eingeplant' }); continue; }
      eintragen.push({ ...e, project_id, notiz: 'Aus Bauphasen vorgeschlagen', updated_at: new Date().toISOString() });
    }
    if (eintragen.length > 0) {
      const res = await fetch(`${url}/rest/v1/taeglicher_einsatz?on_conflict=employee_id,einsatz_datum`, {
        method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(eintragen),
      });
      if (!res.ok) throw new Error(await res.text());
    }
    return NextResponse.json({ success: true, eingetragen: eintragen.length, uebersprungen });
  } catch (err) {
    return serverErrorResponse(err);
  }
}
