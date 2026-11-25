import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { SONDERZAHLUNG_LABEL, lohnHinweise } from '@/lib/konditionen';
import { berechnePfaendung, STANDARD_GRENZEN, type Grenze, type PfaendungEintrag } from '@/lib/pfaendung';

// ============================================================
// SCAFFOLD OS – Lohnübersicht eines Monats (nur Chef): Zulagen, Gutscheine, Kilometergeld usw. und Pfändungs-Einbehalt je Mitarbeiter.
// GET ?monat=JJJJ-MM
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

export async function GET(req: NextRequest) {
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  const monat = new URL(req.url).searchParams.get('monat') || '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monat)) return NextResponse.json({ success: false, error: 'monat=JJJJ-MM erforderlich' }, { status: 400 });
  try {
    const lies = async (pfad: string, pflicht = true) => {
      const r = await fetch(`${url}/rest/v1/${pfad}`, { headers });
      if (!r.ok) { if (pflicht) throw new Error(await r.text()); return null; }
      return r.json();
    };
    const [emp, sonder, pf, pfm, gr] = await Promise.all([
      lies('employees?select=id,first_name,last_name&order=last_name.asc,first_name.asc'),
      lies(`employee_sonderzahlungen?monat=eq.${monat}&select=employee_id,art,bezeichnung,betrag,monat,notiz,menge,satz`).catch(() => lies(`employee_sonderzahlungen?monat=eq.${monat}&select=employee_id,art,bezeichnung,betrag,monat,notiz`)),
      lies('employee_pfaendungen?select=*&order=rang.asc', false),
      lies(`pfaendung_monate?monat=eq.${monat}&select=*`, false),
      lies('pfaendung_grenzen?select=*&order=gueltig_ab.asc', false),
    ]);
    const grenzen: Grenze[] = (gr && gr.length ? gr : STANDARD_GRENZEN).map((g: any) => ({ gueltig_ab: g.gueltig_ab, grundbetrag: Number(g.grundbetrag), erhoehung_erste: Number(g.erhoehung_erste), erhoehung_weitere: Number(g.erhoehung_weitere), obergrenze: Number(g.obergrenze) }));
    const zeilen = emp.map((m: any) => {
      const eigene = (sonder as any[]).filter(s => s.employee_id === m.id).map(s => ({ ...s, betrag: s.betrag == null ? null : Number(s.betrag), art_label: SONDERZAHLUNG_LABEL[s.art] || s.art }));
      const liste: PfaendungEintrag[] = ((pf || []) as any[]).filter(p => p.employee_id === m.id).map(p => ({ ...p, forderung_offen: p.forderung_offen == null ? null : Number(p.forderung_offen) }));
      const mm = ((pfm || []) as any[]).find(x => x.employee_id === m.id);
      const pfaendung = mm ? berechnePfaendung(Number(mm.netto), monat, liste, grenzen, mm.betrag_manuell == null ? null : Number(mm.betrag_manuell)) : null;
      const ohneNetto = !mm && liste.some(p => p.gueltig_ab <= `${monat}-31` && (!p.gueltig_bis || p.gueltig_bis >= `${monat}-01`));
      return { employee_id: m.id, name: `${m.last_name}, ${m.first_name}`, zahlungen: eigene, hinweise: lohnHinweise(eigene, monat), pfaendung, pfaendungOhneNetto: ohneNetto };
    }).filter((z: any) => z.zahlungen.length || z.pfaendung || z.pfaendungOhneNetto);
    return NextResponse.json({ success: true, monat, zeilen });
  } catch (err) {
    return serverErrorResponse(err, 'lohn-uebersicht/GET');
  }
}
