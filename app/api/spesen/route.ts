import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { berechneSpesen, EINSATZARTEN, satzAm, auszahlungsMonat } from '@/lib/spesen';
import { istIsoDatum } from '@/lib/personalstamm';

// ============================================================
// SCAFFOLD OS – Spesen je Mitarbeiter und Tag (Tarif Gerüstbauer-Handwerk, steuerliche Pauschale als Vergleich)
// GET ?datum=JJJJ-MM-TT oder ?monat=JJJJ-MM · POST (berechnen und speichern) · DELETE ?id (zurück auf Vorschlag = Zeile löschen)
// Nur Chef und Dispo. Der Vorschlag wird serverseitig aus den versionierten Sätzen berechnet; ein manueller Betrag hat Vorrang.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLLEN = ['admin', 'disponent'];
const fehler = (text: string, status = 400) => NextResponse.json({ success: false, error: text }, { status });

async function lesen(pfad: string) {
  const r = await fetch(`${url}/rest/v1/${pfad}`, { headers });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function GET(req: NextRequest) {
  const rolle = await pruefeRolle(ROLLEN);
  if (!rolle.ok) return rolle.response;
  const sp = new URL(req.url).searchParams;
  const datum = sp.get('datum') || '', monat = sp.get('monat') || '';
  try {
    let saetze: any[] = [];
    let tage: any[] = [];
    let tabelleFehlt = false;
    try {
      saetze = await lesen('spesen_saetze?select=regelwerk,schluessel,wert,gueltig_ab,bemerkung,id&order=regelwerk.asc,schluessel.asc,gueltig_ab.desc');
      if (istIsoDatum(datum)) tage = await lesen(`spesen_tage?select=*&work_date=eq.${datum}`);
      else if (/^\d{4}-\d{2}$/.test(monat)) {
        const [y, m] = monat.split('-').map(Number);
        const bis = `${monat}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
        tage = await lesen(`spesen_tage?select=*&work_date=gte.${monat}-01&work_date=lte.${bis}&order=work_date.asc`);
      } else return fehler('datum=JJJJ-MM-TT oder monat=JJJJ-MM erforderlich');
    } catch (err: any) {
      if (/spesen_(saetze|tage)/.test(String(err?.message))) tabelleFehlt = true; else throw err;
    }
    const versatz = /^\d{4}-\d{2}$/.test(monat) ? (satzAm(saetze, 'betrieb', 'auszahlung_monate_versatz', `${monat}-01`) ?? 1) : null;
    return NextResponse.json({ success: true, saetze, tage, tabelleFehlt, auszahlung: versatz === null ? null : auszahlungsMonat(monat, versatz) });
  } catch (err) {
    return serverErrorResponse(err, 'spesen/GET');
  }
}

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(ROLLEN);
  if (!rolle.ok) return rolle.response;
  let b: any;
  try { b = await req.json(); } catch { return fehler('Ungültige Anfrage'); }
  if (!UUID.test(String(b?.employee_id ?? ''))) return fehler('Bitte einen Mitarbeiter wählen.');
  const datum = String(b?.work_date ?? '');
  if (!istIsoDatum(datum)) return fehler('Das Datum ist ungültig.');
  const einsatzart = String(b?.einsatzart ?? 'heimfahrt');
  if (!EINSATZARTEN.some(e => e.value === einsatzart)) return fehler('Unbekannte Einsatzart.');
  let manuell: number | null = null;
  if (b?.betrag_manuell !== undefined && b?.betrag_manuell !== null && b?.betrag_manuell !== '') {
    manuell = Number(String(b.betrag_manuell).replace(',', '.'));
    if (!Number.isFinite(manuell) || manuell < 0 || manuell > 10000) return fehler('Der Betrag muss zwischen 0 und 10.000 € liegen.');
    manuell = Math.round(manuell * 100) / 100;
  }
  try {
    const [saetze, eintraege] = await Promise.all([
      lesen('spesen_saetze?select=regelwerk,schluessel,wert,gueltig_ab'),
      lesen(`time_entries?select=start_time,end_time&employee_id=eq.${b.employee_id}&work_date=eq.${datum}`),
    ]);
    // Standard für die Abwesenheit: Stempelzeit von Beginn bis Ende. Die Anfahrt von zu Hause ist darin nicht enthalten, deshalb von Hand änderbar.
    let stunden: number;
    if (b?.abwesenheit_stunden !== undefined && b?.abwesenheit_stunden !== null && b?.abwesenheit_stunden !== '') stunden = Number(String(b.abwesenheit_stunden).replace(',', '.'));
    else {
      const starts = eintraege.map((e: any) => Date.parse(e.start_time)).filter(Number.isFinite);
      const ends = eintraege.map((e: any) => Date.parse(e.end_time)).filter(Number.isFinite);
      stunden = starts.length && ends.length ? Math.max(0, (Math.max(...ends) - Math.min(...starts)) / 3600000) : 0;
      stunden = Math.round(stunden * 100) / 100;
    }
    let fortbildung = false;
    try { fortbildung = (await lesen(`zeit_abschnitte?select=id&employee_id=eq.${b.employee_id}&work_date=eq.${datum}&art=eq.fortbildung`)).length > 0; } catch { /* Tabelle fehlt noch */ }
    const erg = berechneSpesen({ datum, einsatzart, abwesenheitStunden: stunden, fruehstueck: !!b.fruehstueck, mittag: !!b.mittag, abend: !!b.abend, fortbildung }, saetze);
    if (!erg.ok) return fehler(erg.fehler);
    const zeile = {
      employee_id: b.employee_id, work_date: datum, einsatzart,
      fruehstueck: !!b.fruehstueck, mittag: !!b.mittag, abend: !!b.abend,
      abwesenheit_stunden: stunden,
      vorschlag_tarif: erg.tarif.betrag, vorschlag_steuer: erg.steuer.betrag, betrag_manuell: manuell,
      begruendung: [...erg.tarif.begruendung, ...erg.steuer.begruendung.map(t => 'Steuerlich: ' + t), ...erg.hinweise].join('\n'),
      notiz: b.notiz ? String(b.notiz).trim().slice(0, 300) || null : null,
      updated_by: rolle.userId, updated_at: new Date().toISOString(),
    };
    const r = await fetch(`${url}/rest/v1/spesen_tage?on_conflict=employee_id,work_date`, {
      method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(zeile),
    });
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true, tag: (await r.json())[0] });
  } catch (err) {
    return serverErrorResponse(err, 'spesen/POST');
  }
}

export async function DELETE(req: NextRequest) {
  const rolle = await pruefeRolle(ROLLEN);
  if (!rolle.ok) return rolle.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return fehler('id erforderlich');
  try {
    const r = await fetch(`${url}/rest/v1/spesen_tage?id=eq.${id}`, { method: 'DELETE', headers });
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverErrorResponse(err, 'spesen/DELETE');
  }
}
