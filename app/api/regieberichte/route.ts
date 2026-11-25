import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import {
  normStunden, normMaterial, normFotos, naechsteNummer, aenderbar, preiseUebernehmen, MAX_UNTERSCHRIFT_ZEICHEN, REGIE_STATUS,
} from '@/lib/regiebericht';
import { BETRIEB_ROLLEN, BUERO_ROLLEN, PREIS_ROLLEN, UUID, ladeBericht, fuerRolle, sbHeaders, sbUrl, tabelleFehlt } from '@/lib/regiebericht-server';

// ============================================================
// SCAFFOLD OS – Regie-/Rapportberichte (Paket 10)
// GET    ?project_id=… | ?id=… | ?offen=1 (nicht abgerechnet, mit project_id)
// POST   neuen Bericht anlegen (Entwurf)
// PATCH  { id, aktion: 'speichern' | 'unterschreiben' | 'zurueck' | 'zuruecksetzen' } …
// DELETE ?id=… (nur Entwurf, nicht abgerechnet)
// Mitarbeiter sehen und speichern keine Preise (die Preise des gespeicherten Stands bleiben erhalten).
// ============================================================

const fehler = (text: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ success: false, error: text, ...extra }, { status });
const datumOk = (d: unknown) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const MIGRATION = 'Die Tabelle für Regieberichte fehlt: bitte phase-143-regieberichte.sql in Supabase ausführen.';

export async function GET(req: NextRequest) {
  const rolle = await pruefeRolle(BETRIEB_ROLLEN);
  if (!rolle.ok) return rolle.response;
  const p = new URL(req.url).searchParams;
  const id = p.get('id'), projectId = p.get('project_id');
  try {
    let q = 'select=*&order=created_at.desc&limit=500';
    if (id) { if (!UUID.test(id)) return fehler('Ungültige id'); q = `id=eq.${id}&select=*`; }
    else if (projectId) { if (!UUID.test(projectId)) return fehler('Ungültige project_id'); q = `project_id=eq.${projectId}&${p.get('offen') === '1' ? 'rechnung_id=is.null&' : ''}${q}`; }
    else if (!BUERO_ROLLEN.includes(rolle.role)) return fehler('project_id erforderlich');
    const r = await fetch(`${sbUrl()}/rest/v1/regieberichte?${q}`, { headers: sbHeaders() });
    if (!r.ok) { const t = await r.text(); if (tabelleFehlt(t)) return NextResponse.json({ success: true, berichte: [], tabelleFehlt: true, warnung: MIGRATION }); throw new Error(t); }
    const rows = (await r.json()) as Record<string, any>[];
    return NextResponse.json({ success: true, berichte: rows.map((b) => fuerRolle(b, rolle.role)), preiseSichtbar: PREIS_ROLLEN.includes(rolle.role), buero: BUERO_ROLLEN.includes(rolle.role) });
  } catch (err) { return serverErrorResponse(err, 'regieberichte/GET'); }
}

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(BETRIEB_ROLLEN);
  if (!rolle.ok) return rolle.response;
  let b: any;
  try { b = await req.json(); } catch { return fehler('Ungültige Anfrage'); }
  if (!UUID.test(String(b?.project_id ?? ''))) return fehler('Baustelle erforderlich.');
  try {
    const pr = await fetch(`${sbUrl()}/rest/v1/projects?id=eq.${b.project_id}&select=id,customer_id`, { headers: sbHeaders() });
    const proj = pr.ok ? (await pr.json())?.[0] : null;
    if (!proj) return fehler('Baustelle nicht gefunden.', 404);
    const stunden = normStunden(b.stunden), material = normMaterial(b.material);
    const kann = PREIS_ROLLEN.includes(rolle.role);
    const jahr = new Date().getFullYear();
    for (let versuch = 0; versuch < 4; versuch++) {
      const nr = await fetch(`${sbUrl()}/rest/v1/regieberichte?nummer=like.RB-${jahr}-*&select=nummer&limit=2000`, { headers: sbHeaders() });
      if (!nr.ok) { const t = await nr.text(); if (tabelleFehlt(t)) return fehler(MIGRATION, 503, { tabelleFehlt: true }); throw new Error(t); }
      const nummer = naechsteNummer(((await nr.json()) as { nummer: string }[]).map((x) => x.nummer), jahr);
      const res = await fetch(`${sbUrl()}/rest/v1/regieberichte`, {
        method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify({
          nummer, project_id: b.project_id, customer_id: proj.customer_id || null, datum: datumOk(b.datum) || new Date().toISOString().slice(0, 10),
          anlass: txt(b.anlass, 200) || null, beschreibung: txt(b.beschreibung, 4000) || null,
          stunden: kann ? stunden : stunden.map((z) => ({ ...z, satz: 0 })), material: kann ? material : material.map((m) => ({ ...m, einzelpreis: 0 })),
          fotos: normFotos(b.fotos), status: 'entwurf', erstellt_von: rolle.userId,
        }),
      });
      if (res.ok) return NextResponse.json({ success: true, bericht: fuerRolle((await res.json())[0], rolle.role) });
      const t = await res.text();
      if (/duplicate|23505|unique/i.test(t)) continue; // Nummer gleichzeitig vergeben: neue Nummer holen
      if (tabelleFehlt(t)) return fehler(MIGRATION, 503, { tabelleFehlt: true });
      throw new Error(t);
    }
    return fehler('Die Nummer konnte nicht vergeben werden, bitte noch einmal versuchen.', 409);
  } catch (err) { return serverErrorResponse(err, 'regieberichte/POST'); }
}

export async function PATCH(req: NextRequest) {
  const rolle = await pruefeRolle(BETRIEB_ROLLEN);
  if (!rolle.ok) return rolle.response;
  let b: any;
  try { b = await req.json(); } catch { return fehler('Ungültige Anfrage'); }
  if (!UUID.test(String(b?.id ?? ''))) return fehler('id erforderlich');
  try {
    const alt = await ladeBericht(b.id);
    if (!alt) return fehler('Regiebericht nicht gefunden.', 404);
    const aktion = String(b.aktion || 'speichern');
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (aktion === 'speichern') {
      const a = aenderbar(alt);
      if (!a.ok) return fehler(a.fehler, 409);
      let stunden = normStunden(b.stunden), material = normMaterial(b.material);
      if (!PREIS_ROLLEN.includes(rolle.role)) ({ stunden, material } = preiseUebernehmen({ stunden, material }, { stunden: normStunden(alt.stunden), material: normMaterial(alt.material) }));
      Object.assign(patch, { datum: datumOk(b.datum) || alt.datum, anlass: txt(b.anlass, 200) || null, beschreibung: txt(b.beschreibung, 4000) || null, stunden, material, fotos: normFotos(b.fotos) });
    } else if (aktion === 'unterschreiben') {
      const a = aenderbar(alt);
      if (!a.ok) return fehler(a.fehler, 409);
      const name = txt(b.unterschrieben_von, 80);
      const bild = typeof b.unterschrift === 'string' ? b.unterschrift : '';
      if (!name) return fehler('Bitte den Namen des Unterzeichnenden eintragen.');
      if (!/^data:image\/png;base64,/.test(bild) || bild.length > MAX_UNTERSCHRIFT_ZEICHEN) return fehler('Die Unterschrift fehlt oder ist ungültig.');
      Object.assign(patch, { status: 'unterschrieben', unterschrieben_von: name, unterschrift: bild, unterschrieben_am: new Date().toISOString() });
    } else if (aktion === 'zurueck') {
      if (!BUERO_ROLLEN.includes(rolle.role)) return fehler('Nur Büro (Admin, Disposition).', 403);
      if (alt.rechnung_id) return fehler('Der Regiebericht ist bereits abgerechnet.', 409);
      if (alt.status !== 'versendet') return fehler('Nur ein versendeter Bericht kann als zurückgekommen markiert werden.', 409);
      Object.assign(patch, { status: 'zurueck', zurueck_am: new Date().toISOString(), unterschrieben_von: txt(b.unterschrieben_von, 80) || alt.unterschrieben_von || null });
    } else if (aktion === 'zuruecksetzen') {
      // Versehentlich als zurückgekommen markiert: zurück auf „versendet“ (nur Büro, nur wenn noch nicht abgerechnet)
      if (!BUERO_ROLLEN.includes(rolle.role)) return fehler('Nur Büro (Admin, Disposition).', 403);
      if (alt.rechnung_id) return fehler('Der Regiebericht ist bereits abgerechnet.', 409);
      if (alt.status !== 'zurueck') return fehler('Nur ein als zurückgekommen markierter Bericht lässt sich zurücksetzen.', 409);
      Object.assign(patch, { status: 'versendet', zurueck_am: null });
    } else return fehler('Unbekannte Aktion.');

    if (patch.status && !REGIE_STATUS.includes(patch.status as never)) return fehler('Ungültiger Status.');
    const r = await fetch(`${sbUrl()}/rest/v1/regieberichte?id=eq.${b.id}&status=eq.${encodeURIComponent(alt.status)}&rechnung_id=is.null`, {
      method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=representation' }, body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json();
    if (!rows?.length) return fehler('Der Regiebericht wurde gerade geändert oder abgerechnet. Bitte neu laden.', 409);
    return NextResponse.json({ success: true, bericht: fuerRolle(rows[0], rolle.role) });
  } catch (err) { return serverErrorResponse(err, 'regieberichte/PATCH'); }
}

export async function DELETE(req: NextRequest) {
  const rolle = await pruefeRolle(BETRIEB_ROLLEN);
  if (!rolle.ok) return rolle.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return fehler('id erforderlich');
  try {
    const alt = await ladeBericht(id);
    if (!alt) return fehler('Regiebericht nicht gefunden.', 404);
    // Mitarbeiter nur den eigenen Entwurf; Büro und Bauleiter jeden Entwurf
    if (rolle.role === 'mitarbeiter' && alt.erstellt_von !== rolle.userId) return fehler('Du kannst nur eigene Entwürfe löschen.', 403);
    const a = aenderbar(alt);
    if (!a.ok) return fehler(a.fehler.replace('geändert', 'gelöscht').replace('Bitte einen neuen anlegen.', ''), 409);
    const r = await fetch(`${sbUrl()}/rest/v1/regieberichte?id=eq.${id}&status=eq.entwurf&rechnung_id=is.null`, { method: 'DELETE', headers: sbHeaders() });
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true });
  } catch (err) { return serverErrorResponse(err, 'regieberichte/DELETE'); }
}
