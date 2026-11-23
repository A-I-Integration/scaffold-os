import { normalisiereZwischenaufmasse } from '@/lib/zwischenaufmass';
import { vorhaltungZuordnen, vorhaltungFehlerText } from '@/lib/vorhaltung-zuordnung-server';
import { pruefeVorhaltungBezug, istVorhaltungsRechnung } from '@/lib/vorhaltung';
import { aufmassStand, pruefeAufmassBezug, freiePositionenMitAufmassName } from '@/lib/aufmass-integritaet';
import { aufmassZuordnen, reservierungFehlerText } from '@/lib/aufmass-zuordnung-server';
import { ladeBelegForderung, gleicheStatusNachGutschriftAb, ladeAlleRechnungen, ListeZuGross } from '@/lib/forderung-server';
import { freigabeNachStorno, freigabeNachGutschrift, gibZuordnungFrei, istVersendet, gutschriftEntfernenPruefen } from '@/lib/zuordnung-freigabe-server';
import { pruefeAbrechnung, grundGueltig, type Abweichung } from '@/lib/abrechnung-pruefung';
import { schreibeHistorie } from '@/lib/abrechnung-historie';
import { angebotNettoAusProjekt } from '@/lib/auftragsstand';
import { normalisiereNachtraege } from '@/lib/nachtrag';
import { ergaenzeProjektnummer } from '@/lib/cad/projektnummer-sperre';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { trackImpact } from '@/lib/impact';
import { serverErrorResponse } from '@/lib/auth';
import { bereinigePosition } from '@/lib/rechnung-position';
import { notizMitSteuerHinweis } from '@/lib/ust-hinweis';
import { steuerFall, pruefe13b } from '@/lib/rechnung-steuer';
import { abschlagOhneAuftrag, ABSCHLAG_OHNE_AUFTRAG_FEHLER } from '@/lib/rechnung-regeln';

// ============================================================
// SCAFFOLD OS – Rechnungen API (Phase 13: Rechnungsmodul)
//
// GET    → alle Rechnungen (neueste zuerst)
// POST   → Rechnung anlegen (Rechnungsnummer automatisch per
//          Datenbank-Funktion next_invoice_number → RE-2026-0001 …)
// PATCH  → Status ändern (offen / bezahlt / ueberfaellig / storniert)
// DELETE → Rechnung löschen (nur wenn noch „offen")
//
// Muster wie /api/projects: Session-/Rollenprüfung über createClient,
// Daten über Supabase REST mit SERVICE_ROLE_KEY.
// ============================================================

function resolvedArtFuerPruefung(t: unknown): string { return ['standard', 'abschlag', 'schluss', 'gutschrift'].includes(String(t)) ? String(t) : 'standard'; }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  'apikey': key,
  'Authorization': `Bearer ${key}`,
};

const WRITE_ROLES = ['admin', 'disponent'];

async function callerRole(): Promise<{ role: string | null; userId: string | null }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { role: null, userId: null };
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    return { role: profile?.role || null, userId: user.id };
  } catch {
    return { role: null, userId: null };
  }
}

// Phase 27: Pflicht-Verknüpfung Prüfung/Freigabe → Rechnung.
// Prüft, ob für dieses Projekt ein Dokumentationseintrag
// "Prüfung/Freigabe" mit freigegeben = true existiert.
async function hatFreigabe(projectId: string): Promise<boolean> {
  const res = await fetch(
    `${url}/rest/v1/project_events?project_id=eq.${projectId}&type=eq.pruefung_freigabe&select=pruefung_details`,
    { headers }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return rows.some((r: any) => r.pruefung_details?.freigegeben === true);
}

// Kundendaten für Steuerprüfung und Rechnungskopf: per Verknüpfung, sonst nur bei genau einem Kunden gleichen Namens.
// Fehlen die neuen Spalten (Migration noch nicht ausgeführt), wird mit den Grundspalten weitergemacht.
async function ladeKundeFuerRechnung(customerId: string | null, name: string): Promise<any | null> {
  const filter = customerId ? `id=eq.${customerId}` : `name=ilike.${encodeURIComponent(name.trim())}&limit=2`;
  for (const sel of ['kundentyp,ust_id,leitweg_id,bauleister_nachweis_bis', 'kundentyp,ust_id,leitweg_id']) {
    try {
      const r = await fetch(`${url}/rest/v1/customers?${filter}&select=${sel}`, { headers });
      if (!r.ok) continue;
      const rows = await r.json();
      return customerId ? rows?.[0] || null : (rows?.length === 1 ? rows[0] : null);
    } catch { /* nächster Versuch */ }
  }
  return null;
}

// ─── GET: alle Rechnungen laden ───
export async function GET(req: NextRequest) {
  const { role } = await callerRole();
  if (!role) {
    return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
  }
  // Rechnungen (Beträge, Kunden) sieht nur das Büro – wie die Seiten /rechnungen und /kunden.
  if (!['admin', 'disponent'].includes(role)) {
    return NextResponse.json({ success: false, error: 'Dafür hast du keine Berechtigung.' }, { status: 403 });
  }
  try {
    // Einzelne Rechnung (Rechnungsakte): ?id=<uuid>
    const einzelId = req.nextUrl.searchParams.get('id');
    if (einzelId) {
      if (!/^[0-9a-f-]{36}$/i.test(einzelId)) return NextResponse.json({ success: false, error: 'id ungültig' }, { status: 400 });
      const r1 = await fetch(`${url}/rest/v1/invoices?id=eq.${einzelId}&select=*`, { headers });
      if (!r1.ok) throw new Error(await r1.text());
      const eine = await r1.json();
      if (!eine?.length) return NextResponse.json({ success: false, error: 'Rechnung nicht gefunden.' }, { status: 404 });
      return NextResponse.json({ success: true, invoice: (await ergaenzeProjektnummer([eine[0]]))[0] });
    }
    // Nur die Rechnungen eines Projekts: ?project_id=<uuid>
    const projektId = req.nextUrl.searchParams.get('project_id');
    if (projektId && !/^[0-9a-f-]{36}$/i.test(projektId)) return NextResponse.json({ success: false, error: 'project_id ungültig' }, { status: 400 });
    // Vollständig, seitenweise (Phase 129): keine feste Obergrenze mehr; Gutschriften zu den gelieferten Rechnungen werden unabhängig vom Filter ergänzt
    let rows: Record<string, any>[];
    try { rows = await ladeAlleRechnungen({ url, headers }, projektId ? `&project_id=eq.${projektId}` : ''); }
    catch (e) { if (e instanceof ListeZuGross) return NextResponse.json({ success: false, code: 'LISTE_ZU_GROSS', error: e.message }, { status: 413 }); throw e; }
    return NextResponse.json({ success: true, invoices: await ergaenzeProjektnummer(rows) });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

// ─── POST: Rechnung anlegen ───
async function anlegen(req: NextRequest) {
  const { role, userId } = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, error: 'Nur Admin und Disposition dürfen Rechnungen anlegen.' },
      { status: 403 }
    );
  }
  try {
    const body = await req.json();
    const { project_id, customer_name, customer_address, positions, tax_rate, invoice_date, due_date, notes, invoice_type, reference_invoice_number, override_grund, customer_id: customerIdBody, replace_invoice_id } = body;
    // Strukturierte Kopfangaben: Gerüstnummer (frei, z. B. "G-2026-014") und Leistungsdatum
    const gerüstNr = typeof body.geruest_nr === 'string' && body.geruest_nr.trim() ? body.geruest_nr.trim().slice(0, 60) : null;
    const leistungsdatum = typeof body.leistungsdatum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.leistungsdatum) ? body.leistungsdatum : null;

    const grundstuecksbezug = body.grundstuecksbezug !== false; // Gerüste stehen in der Regel an einem Grundstück
    let steuerbehandlung: 'regel' | '13b' | 'kleinunternehmer' = ['13b', 'kleinunternehmer'].includes(body.steuerfall) ? body.steuerfall : 'regel';
    // Gutschrift/Ersatzrechnung ohne eigene Angabe: Steuerbehandlung der Bezugsrechnung übernehmen
    if (body.steuerfall === undefined && reference_invoice_number && Number(tax_rate) === 0) {
      try {
        const rr = await fetch(`${url}/rest/v1/invoices?invoice_number=eq.${encodeURIComponent(String(reference_invoice_number))}&select=steuerfall,notes&limit=1`, { headers });
        const ref = rr.ok ? (await rr.json())?.[0] : null;
        if (ref) steuerbehandlung = steuerFall({ tax_rate: 0, notes: ref.notes, steuerfall: ref.steuerfall }).kategorie === 'AE' ? '13b'
          : steuerFall({ tax_rate: 0, notes: ref.notes, steuerfall: ref.steuerfall }).grund ? 'kleinunternehmer' : 'regel';
      } catch { /* ohne Bezug bleibt es bei der Regel */ }
    }
    if (steuerbehandlung !== 'regel' && tax_rate != null && Number(tax_rate) !== 0) {
      return NextResponse.json({ success: false, error: 'Bei § 13b und Kleinunternehmer (§ 19) wird keine Umsatzsteuer ausgewiesen (Satz 0 %).' }, { status: 400 });
    }

    if (!customer_name) {
      return NextResponse.json({ success: false, error: 'Kundenname erforderlich.' }, { status: 400 });
    }
    if (!Array.isArray(positions) || positions.length === 0) {
      return NextResponse.json({ success: false, error: 'Mindestens eine Position erforderlich.' }, { status: 400 });
    }
    // Nur bekannte Positionsfelder mit gültigen Werten werden gespeichert (Art, Maße, Faktor, Stundenlohn-Angaben)
    const positionen = positions.map(bereinigePosition);

    // Abschlagsrechnungen nur mit Auftrag: sonst würde die Pflicht-Freigabe unten
    // (nur bei project_id) komplett umgangen. Ersatz-Rechnungen (Ändern) ausgenommen.
    if (abschlagOhneAuftrag(invoice_type, project_id, replace_invoice_id)) {
      return NextResponse.json({ success: false, error: ABSCHLAG_OHNE_AUFTRAG_FEHLER, code: 'ABSCHLAG_OHNE_AUFTRAG' }, { status: 409 });
    }

    // Phase 27: Pflicht-Verknüpfung Prüfung/Freigabe → Rechnung. Gilt für JEDE
    // Rechnung zu einem Projekt (auch Zusatzrechnung, Mahnung-Auslöser, Gutschrift),
    // ausnahmslos – außer Admin ODER Disponent überschreibt es bewusst mit Begründung.
    const OVERRIDE_ROLES = ['admin', 'disponent'];
    let overrideVerwendet = false;
    if (project_id) {
      const freigegeben = await hatFreigabe(project_id);
      if (!freigegeben) {
        if (role && OVERRIDE_ROLES.includes(role) && override_grund && String(override_grund).trim()) {
          overrideVerwendet = true;
        } else if (role && OVERRIDE_ROLES.includes(role)) {
          return NextResponse.json({
            success: false,
            error: 'Für dieses Projekt liegt keine freigegebene Prüfung/Freigabe vor. Du kannst das mit Begründung überschreiben (override_grund).',
            code: 'FREIGABE_FEHLT_OVERRIDE_MOEGLICH',
          }, { status: 409 });
        } else {
          return NextResponse.json({
            success: false,
            error: 'Für dieses Projekt liegt keine freigegebene Prüfung/Freigabe vor. Bitte zuerst im Dokumentation-Modul dokumentieren, oder Admin/Disposition um eine begründete Überschreibung bitten.',
            code: 'FREIGABE_FEHLT',
          }, { status: 409 });
        }
      }
    }

    const istGutschrift = invoice_type === 'gutschrift';

    // Beträge serverseitig rechnen (Vertrauen ist gut, § 14 ist besser)
    // Bei Gutschriften: Positionen werden positiv erfasst (z.B. "Rabatt 200€"),
    // aber als Beleg mit negativem Betrag gebucht – so wirkt sie korrekt auf
    // die offene Summe und ist als Korrektur erkennbar (§14 UStG).
    const vorzeichen = istGutschrift ? -1 : 1;
    const net = vorzeichen * positionen.reduce(
      (s: number, p: any) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0),
      0
    );
    const rate = steuerbehandlung !== 'regel' ? 0 : (tax_rate != null ? Number(tax_rate) : 19);
    // Steuer immer vom Betrag ohne Vorzeichen runden, damit eine Gutschrift genau das Spiegelbild der Rechnung ist
    // (Math.round rundet -0,5 sonst anders als +0,5).
    const tax = vorzeichen * (Math.round(Math.abs(net) * rate) / 100);
    const gross = Math.round((net + tax) * 100) / 100;
    const netRounded = Math.round(net * 100) / 100;

    // Faktura F7-Sicherung: Abrechnung eines Zwischenaufmaßes wird SERVERSEITIG geprüft und atomar reserviert.
    // body.aufmass = { za_id, stand }: die Rechnungspositionen müssen genau der noch offenen Differenz entsprechen.
    // Freie Positionen ohne Bezug, die wie aufgemessene Positionen heißen, brauchen eine dokumentierte Begründung (siehe Abweichungen).
    let aufmassPlan: { zaId: string; roh: unknown } | null = null;
    let aufmassRes: { zaId: string; token: string } | null = null;
    let aufmassNr: string | null = null;
    let projektZaRoh: unknown = undefined;
    let projektDatenRoh: any = undefined;
    let vorhaltungPlan: { von: string; bis: string; intervalle: number; netto: number; erwartetBis: string | null } | null = null;
    if (project_id && !istGutschrift) {
      try {
        const pz = await fetch(`${url}/rest/v1/projects?id=eq.${project_id}&select=data`, { headers });
        if (pz.ok) { projektDatenRoh = (await pz.json())?.[0]?.data ?? {}; projektZaRoh = projektDatenRoh?.zwischenaufmasse; }
      } catch { /* Prüfung unten meldet, wenn nötig */ }
    }
    if (body.aufmass && typeof body.aufmass === 'object' && body.vorhaltung && typeof body.vorhaltung === 'object') {
      return NextResponse.json({ success: false, code: 'ABRECHNUNG_ART_MEHRFACH', error: 'Aufmaß und Vorhaltung werden in getrennten Rechnungen abgerechnet.' }, { status: 400 });
    }
    if (body.aufmass && typeof body.aufmass === 'object') {
      const zaId = String(body.aufmass.za_id || '');
      const stand = String(body.aufmass.stand || '');
      if (!project_id || !zaId) return NextResponse.json({ success: false, code: 'AUFMASS_NICHT_GEFUNDEN', error: 'Für die Abrechnung nach Zwischenaufmaß fehlen Auftrag oder Zwischenaufmaß.' }, { status: 400 });
      if (replace_invoice_id) return NextResponse.json({ success: false, code: 'AUFMASS_NUR_ABSCHLAG', error: 'Eine Aufmaß-Abrechnung kann nicht als neue Version angelegt werden.' }, { status: 400 });
      if (projektZaRoh === undefined) return NextResponse.json({ success: false, code: 'AUFMASS_SPERRE_NICHT_MOEGLICH', error: 'Das Zwischenaufmaß konnte nicht geprüft werden. Die Rechnung wurde NICHT angelegt.' }, { status: 503 });
      const pr = pruefeAufmassBezug({ rohListe: projektZaRoh, zaId, stand, positionen: positionen as any, rechnungsart: String(invoice_type) });
      if (!pr.ok) return NextResponse.json({ success: false, code: pr.fehler.code, error: pr.fehler.text }, { status: 409 });
      aufmassPlan = { zaId, roh: pr.roh };
      aufmassNr = 'ZA-' + String(pr.za.nr).padStart(2, '0');
    }

    // Faktura F8: Vorhalteabrechnung nur nach Vertragsbedingungen. body.vorhaltung = { von, bis, stand }.
    if (body.vorhaltung && typeof body.vorhaltung === 'object') {
      if (!project_id || istGutschrift || replace_invoice_id || String(invoice_type || 'standard') !== 'standard') return NextResponse.json({ success: false, code: 'VORHALTUNG_NUR_STANDARD', error: 'Die Vorhaltung wird als normale Rechnung zu einem Auftrag abgerechnet.' }, { status: 400 });
      if (projektDatenRoh === undefined) return NextResponse.json({ success: false, code: 'VORHALTUNG_SPERRE_NICHT_MOEGLICH', error: 'Die Vorhaltung konnte nicht geprüft werden. Die Rechnung wurde NICHT angelegt.' }, { status: 503 });
      const vp = pruefeVorhaltungBezug({
        vereinbarungRoh: projektDatenRoh?.vorhaltung, periodenRoh: projektDatenRoh?.vorhaltePerioden,
        von: String(body.vorhaltung.von || ''), bis: String(body.vorhaltung.bis || ''), stand: String(body.vorhaltung.stand || ''),
        positionen: positionen as any, heute: new Date().toISOString().slice(0, 10),
      });
      if (!vp.ok) return NextResponse.json({ success: false, code: vp.code, error: vp.text }, { status: 409 });
      const bisherBis = (Array.isArray(projektDatenRoh?.vorhaltePerioden) ? projektDatenRoh.vorhaltePerioden : []).reduce((m: string | null, p: any) => (p?.bis && (!m || p.bis > m) ? p.bis : m), null);
      vorhaltungPlan = { von: vp.faellig.von, bis: vp.faellig.bis, intervalle: vp.faellig.intervalle.length, netto: vp.faellig.netto, erwartetBis: bisherBis };
    }

    // Faktura F6: Abrechnungsprüfung. Nichts wird still geändert: bei Abweichung kommt eine Meldung, und die Rechnung geht nur mit
    // dokumentierter Begründung (abrechnung_grund) durch. Die Freigabe steht im Änderungsverlauf.
    let abweichungen: Abweichung[] = [];
    const abrechnungGrund = typeof body.abrechnung_grund === 'string' ? body.abrechnung_grund.trim() : '';
    if (project_id && !istGutschrift) {
      try {
        const [pRes, iRes, cRes2] = await Promise.all([
          fetch(`${url}/rest/v1/projects?id=eq.${project_id}&select=data`, { headers }),
          fetch(`${url}/rest/v1/invoices?project_id=eq.${project_id}&select=id,invoice_number,invoice_type,status,net_amount,invoice_date,positions`, { headers }),
          fetch(`${url}/rest/v1/company_settings?id=eq.00000000-0000-0000-0000-000000000001&select=calc_crane_day`, { headers }),
        ]);
        if (pRes.ok && iRes.ok) {
          const projektData = (await pRes.json())?.[0]?.data;
          const bestehende = ((await iRes.json()) as any[]).filter((r) => !istVorhaltungsRechnung(r));
          const kran = cRes2.ok ? Number((await cRes2.json())?.[0]?.calc_crane_day) || 850 : 850;
          const nachtraege = normalisiereNachtraege(projektData?.nachtraege);
          const bestaetigt = nachtraege.filter((n) => n.status === 'bestaetigt').reduce((x, n) => x + Number(n.betrag || 0), 0);
          const offen = nachtraege.filter((n) => n.status === 'offen').reduce((x, n) => x + Number(n.betrag || 0), 0);
          const angebot = angebotNettoAusProjekt(projektData, kran);
          abweichungen = pruefeAbrechnung({
            art: resolvedArtFuerPruefung(invoice_type), netto: netRounded, auftragswert: positionen.length > 0 && positionen.every((p: any) => p.art === 'miete') ? 0 : angebot > 0 || bestaetigt > 0 ? Math.round((angebot + bestaetigt) * 100) / 100 : 0,
            nachtraegeOffen: offen, bestehende, ersetzteId: replace_invoice_id || null, rechnungsdatum: invoice_date || new Date().toISOString().slice(0, 10),
          });
        }
        if (!body.vorhaltung && projektDatenRoh?.vorhaltung?.aktiv === true && positionen.some((p: any) => p?.art === 'miete')) {
          abweichungen = [...abweichungen, { code: 'VORHALTUNG_FREIE_MIETE', text: 'Für diesen Auftrag gilt eine Vorhalte-Vereinbarung. Eine freie Mietposition wird nicht mit den berechneten Vorhaltezeiträumen abgeglichen und kann doppelt berechnen. Bitte über „Vorhaltung“ abrechnen.' }];
        }
        if (!body.aufmass && projektZaRoh !== undefined) {
          const namen = freiePositionenMitAufmassName(projektZaRoh, positionen);
          if (namen.length) abweichungen = [...abweichungen, { code: 'AUFMASS_POSITION_OHNE_BEZUG', text: `Die Position ${namen.map((n) => `„${n}“`).join(', ')} heißt wie eine aufgemessene Position, ist aber nicht mit dem Zwischenaufmaß verknüpft. Bitte über „nach Zwischenaufmaß“ abrechnen, sonst wird die Menge nicht mitgezählt.` }];
        }
      } catch { /* Prüfung nicht möglich: Rechnung nicht blockieren, sonst steht die Abrechnung wegen eines Lesefehlers still */ }
      if (abweichungen.length > 0 && !grundGueltig(abrechnungGrund)) {
        return NextResponse.json({
          success: false, code: 'ABRECHNUNG_ABWEICHUNG', abweichungen,
          error: 'Abweichung in der Abrechnung:\n• ' + abweichungen.map((a) => a.text).join('\n• ') + '\n\nDie Rechnung wird nicht automatisch angepasst. Sie kann mit dokumentierter Begründung trotzdem angelegt werden.',
        }, { status: 409 });
      }
    }

    // Phase 14: Firmen-Snapshot für die Rechnung (GoBD – die Rechnung
    // muss die zum Ausstellungszeitpunkt gültigen Firmendaten zeigen)
    let companySnapshot: any = null;
    try {
      const cRes = await fetch(
        `${url}/rest/v1/company_settings?id=eq.00000000-0000-0000-0000-000000000001&select=*`,
        { headers }
      );
      if (cRes.ok) {
        const cRows = await cRes.json();
        companySnapshot = cRows?.[0] || null;
      }
    } catch { /* Snapshot optional – Rechnung geht auch ohne */ }

    // NEU (Phase 34): echte Kunde-Verknüpfung statt reinem Namensvergleich.
    // Direkt übergebene customer_id hat Vorrang; sonst vom verknüpften
    // Projekt übernehmen, falls dort eine hinterlegt ist.
    let customerId = customerIdBody || null;
    if (!customerId && project_id) {
      try {
        const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${project_id}&select=customer_id`, { headers });
        if (pRes.ok) customerId = (await pRes.json())?.[0]?.customer_id || null;
      } catch { /* optional */ }
    }

    // Kunde einmal laden (Rechnungskopf) und bei § 13b prüfen: Privatpersonen sind ausgeschlossen,
    // fehlende Bescheinigung (USt 1 TG) oder USt-IdNr. werden als Warnung zurückgemeldet.
    const kundeRow = await ladeKundeFuerRechnung(customerId, String(customer_name));
    let steuerWarnungen: string[] = [];
    if (steuerbehandlung === '13b') {
      const p13 = pruefe13b(kundeRow, new Date().toISOString().slice(0, 10));
      if (p13.fehler) return NextResponse.json({ success: false, error: p13.fehler, code: 'STEUER_13B_PRIVAT' }, { status: 400 });
      steuerWarnungen = p13.warnungen;
    }

    // FIX (Bug-Report, Phase 93): Nummernvergabe UND Insert liefen bisher
    // als zwei getrennte Requests (erst next_invoice_number, dann POST
    // /invoices) - schlug der Insert fehl, war die Nummer schon vergeben:
    // Lücke im GoBD-Nummernkreis. Jetzt EIN einziger RPC-Aufruf
    // (create_invoice, supabase/phase-93-rechnung-atomar.sql), der
    // Nummernvergabe + Insert in derselben Transaktion macht - schlägt
    // der Insert fehl, wird die Nummer mit zurückgerollt statt zu
    // verbrennen.
    const resolvedInvoiceType = ['standard', 'abschlag', 'schluss', 'gutschrift'].includes(invoice_type)
      ? invoice_type
      : 'standard';
    // FIX (Bug-Report): due_date wurde bisher, wenn nicht explizit mitgeschickt
    // (z.B. beim automatischen "Rechnung erstellen" in Aufmaß-Schritt 6, das
    // nie ein due_date sendet), als null gespeichert. fmtDate() zeigt für
    // null nur "–" an – die Rechnung (PDF und Versand-E-Mail) hatte dann gar
    // kein Zahlungsziel. Gleicher Standard wie im manuellen Rechnungsformular
    // (/rechnungen, dort clientseitig vorbelegt): Rechnungsdatum + 14 Tage,
    // wenn kein due_date übergeben wurde.
    const resolvedInvoiceDate = invoice_date || new Date().toISOString().slice(0, 10);
    const resolvedDueDate = due_date || (() => {
      // UTC rechnen: lokale Zeit + toISOString verschob das Datum je nach Zeitzone des Servers um einen Tag.
      const d = new Date(resolvedInvoiceDate + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 14);
      return d.toISOString().slice(0, 10);
    })();

    // FIX (Bug-Report, Phase 94, "Punkt 4"): "Neue Version anlegen" (Storno
    // + Ersatz-Rechnung, app/kunden/[id]/page.tsx saveAlsNeueVersion) lief
    // bisher als ZWEI getrennte Requests (erst diese POST hier, danach ein
    // eigener PATCH, der die alte Rechnung auf 'storniert' setzt) - der
    // PATCH wurde nie auf Erfolg geprüft. Schlug er fehl, blieb die alte
    // Rechnung "offen", obwohl schon eine neue, inhaltsgleiche existierte
    // (doppelte Buchung, GoBD-Inkonsistenz). Jetzt: wird replace_invoice_id
    // mitgeschickt, läuft alles über EINEN atomaren RPC-Aufruf
    // (create_invoice_as_new_version, supabase/phase-94-storno-neue-version-
    // atomar.sql), der die neue Rechnung anlegt UND die alte in derselben
    // Transaktion storniert - schlägt ein Teil fehl, wird beides zurück-
    // gerollt, nie nur die Hälfte.
    const istNeueVersion = !!replace_invoice_id;
    if (istNeueVersion) {
      const ge = await gutschriftEntfernenPruefen({ url, headers }, String(replace_invoice_id));
      if (!ge.erlaubt) return NextResponse.json({ success: false, code: ge.code, error: ge.text }, { status: 409 });
    }
    const rpcName = istNeueVersion ? 'create_invoice_as_new_version' : 'create_invoice';
    const rpcParams: Record<string, any> = {
      p_prefix: istGutschrift ? 'GS' : 'RE',
      p_project_id: project_id || null,
      p_customer_id: customerId,
      p_customer_name: customer_name,
      p_customer_address: customer_address || null,
      p_positions: positionen,
      p_net_amount: netRounded,
      p_tax_rate: rate,
      p_tax_amount: tax,
      p_gross_amount: gross,
      p_invoice_date: resolvedInvoiceDate,
      p_due_date: resolvedDueDate,
      p_notes: notizMitSteuerHinweis(notes, rate, steuerbehandlung),
      p_company_snapshot: companySnapshot,
      // Phase 15-Fix: Rechnungstyp wirklich speichern (wurde bisher
      // zwar aus dem Request gelesen, aber nicht in die Datenbank
      // geschrieben – jede Rechnung landete als 'standard')
      // Phase 22: 'gutschrift' als vierter, eigener Typ.
      p_invoice_type: resolvedInvoiceType,
      // Phase 35: reference_invoice_number jetzt auch für normale Rechnungen
      // erlaubt – für "Neue Version ersetzt alte Rechnung" (siehe unten),
      // nicht mehr nur für Gutschriften.
      p_reference_invoice_number: reference_invoice_number || null,
    };
    if (istNeueVersion) {
      rpcParams.p_old_invoice_id = replace_invoice_id;
    }

    // Zwischenaufmaß atomar reservieren (Projektzeile gesperrt): ein zweiter, gleichzeitiger Versuch scheitert hier.
    if (aufmassPlan) {
      const token = crypto.randomUUID();
      const erg = await aufmassZuordnen({ projectId: project_id, zaId: aufmassPlan.zaId, aktion: 'reservieren', erwartet: aufmassPlan.roh, token });
      if (erg !== 'ok') { const f = reservierungFehlerText(erg); return NextResponse.json({ success: false, code: f.code, error: f.text }, { status: f.status }); }
      aufmassRes = { zaId: aufmassPlan.zaId, token };
    }
    let vorhaltungRes: { token: string } | null = null;
    if (vorhaltungPlan) {
      const token = crypto.randomUUID();
      const erg = await vorhaltungZuordnen({ projectId: project_id, aktion: 'reservieren', token, erwartetBis: vorhaltungPlan.erwartetBis, periode: { von: vorhaltungPlan.von, bis: vorhaltungPlan.bis, intervalle: vorhaltungPlan.intervalle, netto: vorhaltungPlan.netto } });
      if (erg !== 'ok') { const f = vorhaltungFehlerText(erg); return NextResponse.json({ success: false, code: f.code, error: f.text }, { status: f.status }); }
      vorhaltungRes = { token };
    }
    const freigebenBeiFehler = async () => { if (vorhaltungRes) await vorhaltungZuordnen({ projectId: project_id, aktion: 'freigeben', token: vorhaltungRes.token }); if (aufmassRes) await aufmassZuordnen({ projectId: project_id, zaId: aufmassRes.zaId, aktion: 'freigeben', token: aufmassRes.token }); };

    // Mit Reservierung: Rechnung anlegen UND zuordnen in EINER Datenbank-Transaktion (rechnung_anlegen_zugeordnet, phase-128).
    // Scheitert die Zuordnung, wird auch die Rechnung zurückgerollt – es entsteht keine Rechnung ohne Zuordnung.
    const zugeordnet = !!(aufmassRes || vorhaltungRes);
    let res: Response;
    try {
      res = await fetch(`${url}/rest/v1/rpc/${zugeordnet ? 'rechnung_anlegen_zugeordnet' : rpcName}`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(zugeordnet
          ? { p_art: aufmassRes ? 'aufmass' : 'vorhaltung', p_za_id: aufmassRes?.zaId ?? null, p_token: (aufmassRes?.token ?? vorhaltungRes?.token) as string, p_params: rpcParams }
          : rpcParams),
      });
    } catch (e) { await freigebenBeiFehler(); throw e; }
    if (!res.ok) {
      const fehlerText = await res.text();
      await freigebenBeiFehler();
      if (zugeordnet && /PGRST202|rechnung_anlegen_zugeordnet/.test(fehlerText) && /not find|does not exist|Could not/i.test(fehlerText)) {
        return NextResponse.json({ success: false, code: 'ZUORDNUNG_MIGRATION_FEHLT', error: 'Die Datenbank-Migration phase-128 fehlt. Die Rechnung wurde NICHT angelegt.' }, { status: 503 });
      }
      throw new Error(fehlerText);
    }

    // create_invoice gibt eine einzelne invoices-Zeile zurück. PostgREST
    // liefert das Ergebnis einer RPC, die eine einzelne Tabellenzeile
    // zurückgibt, je nach Konfiguration entweder als Array mit einem
    // Element oder als einzelnes Objekt - beide Formen werden hier
    // akzeptiert, statt eine davon zu erraten.
    const rpcResult = await res.json();
    const invoiceRow = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    if (!invoiceRow?.id) { await freigebenBeiFehler(); throw new Error('Rechnung wurde angelegt, aber die Antwort der Datenbank hatte ein unerwartetes Format.'); }
    const rows = [invoiceRow]; // ab hier wie zuvor: rows[0] = angelegte Rechnung
    const invoiceNumber = invoiceRow.invoice_number;

    // Kopfangaben zur angelegten Rechnung speichern: Gerüstnummer, Leistungsdatum, Steuerbehandlung sowie Kundentyp,
    // USt-IdNr. und Leitweg-ID des Kunden zum Ausstellungszeitpunkt (aus dem Kundenstamm, nicht vom Browser).
    // Schlägt das fehl, bleibt die Rechnung gültig; die Antwort meldet es, damit die Angaben nachgetragen werden können.
    let kopfWarnung: string | null = null;
    if (rows[0]?.id) {
      const kopf: Record<string, any> = { geruest_nr: gerüstNr, leistungsdatum, steuerfall: steuerbehandlung, grundstuecksbezug };
      if (kundeRow) { kopf.customer_privat = kundeRow.kundentyp === 'privat'; kopf.customer_ust_id = kundeRow.ust_id || null; kopf.leitweg_id = kundeRow.leitweg_id || null; }
      try {
        const kr = await fetch(`${url}/rest/v1/invoices?id=eq.${rows[0].id}`, {
          method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify(kopf),
        });
        if (kr.ok) { const kj = await kr.json(); if (kj?.[0]) rows[0] = kj[0]; }
        else {
          // Neue Spalten fehlen (Migration noch nicht ausgeführt): wenigstens Gerüstnummer und Leistungsdatum sichern
          kopfWarnung = 'Steuerangaben konnten nicht gespeichert werden (Datenbank-Migration ausführen).';
          if (gerüstNr || leistungsdatum) {
            const kr2 = await fetch(`${url}/rest/v1/invoices?id=eq.${rows[0].id}`, {
              method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
              body: JSON.stringify({ geruest_nr: gerüstNr, leistungsdatum }),
            });
            if (kr2.ok) { const kj2 = await kr2.json(); if (kj2?.[0]) rows[0] = kj2[0]; }
          }
        }
      } catch { kopfWarnung = 'Gerüstnummer, Leistungsdatum oder Steuerangaben konnten nicht gespeichert werden.'; }
    }

    // Die Zuordnung ist bereits atomar mit der Rechnung erfolgt (siehe oben); hier nur noch der Verlauf.
    let aufmassWarnung: string | null = null;
    if (aufmassRes && rows[0]?.id) {
      const za = normalisiereZwischenaufmasse(projektZaRoh).find((x) => x.id === aufmassRes!.zaId);
      await schreibeHistorie({ aktion: 'aufmass_abgerechnet', invoiceId: rows[0].id, invoiceNumber: rows[0].invoice_number, projectId: project_id, userId, details: { aufmass: aufmassNr, stichtag: za?.stichtag, flaecheM2: { von: null, auf: za?.flaecheM2 ?? null }, positionen: (za?.positionen || []).map((p) => ({ bezeichnung: p.bezeichnung, einheit: p.einheit, von: null, auf: p.menge })) } });
    }
    let vorhaltungWarnung: string | null = null;
    if (vorhaltungRes && vorhaltungPlan && rows[0]?.id) {
      await schreibeHistorie({ aktion: 'vorhaltung_abgerechnet', invoiceId: rows[0].id, invoiceNumber: rows[0].invoice_number, projectId: project_id, userId, details: { von: vorhaltungPlan.von, bis: vorhaltungPlan.bis, intervalle: vorhaltungPlan.intervalle, netto: vorhaltungPlan.netto } });
    }

    // Neue Version einer Rechnung: das Zwischenaufmaß zeigt künftig auf die neue Rechnung (die alte ist storniert)
    if (replace_invoice_id && rows[0]?.id && project_id) {
      await aufmassZuordnen({ projectId: project_id, aktion: 'ersetzen', invoiceId: String(replace_invoice_id), neuInvoiceId: rows[0].id, invoiceNumber: rows[0].invoice_number });
      await vorhaltungZuordnen({ projectId: project_id, aktion: 'ersetzen', invoiceId: String(replace_invoice_id), neuInvoiceId: rows[0].id, invoiceNumber: rows[0].invoice_number });
    }

    // Faktura F6: Änderungsverlauf (jede neue Rechnung, mit Freigabegrund bei Abweichung)
    if (rows[0]?.id) {
      await schreibeHistorie({
        aktion: replace_invoice_id ? 'neue_version' : istGutschrift ? 'gutschrift_angelegt' : 'rechnung_angelegt',
        invoiceId: rows[0].id, invoiceNumber: rows[0].invoice_number, projectId: project_id || null, userId,
        grund: abweichungen.length ? abrechnungGrund : null,
        details: { aufmass: aufmassNr, typ: rows[0].invoice_type || 'standard', netto: netRounded, brutto: gross, ersetzt: replace_invoice_id || null, abweichungen: abweichungen.map((a) => ({ code: a.code, text: a.text })) },
      });
    }

    // Eine volle Gutschrift zu einer Rechnung macht deren Aufmaß bzw. Vorhaltezeitraum wieder abrechenbar (dokumentiert im Verlauf)
    if (istGutschrift && rows[0]?.id && project_id && reference_invoice_number) {
      await freigabeNachGutschrift({ url, headers }, { projectId: project_id, referenzNr: String(reference_invoice_number), gutschriftNr: rows[0].invoice_number, userId });
    }

    // Status der Bezugsrechnung abgleichen (gebuchte Zahlung + Gutschrift gleichen sie aus → „bezahlt“); gilt auch ohne Baustelle
    if (istGutschrift && rows[0]?.id && reference_invoice_number) {
      await gleicheStatusNachGutschriftAb({ url, headers }, String(reference_invoice_number), { userId });
    }

    // Phase 27: Admin-Überschreibung protokollieren
    if (overrideVerwendet && rows[0]?.id) {
      try {
        await fetch(`${url}/rest/v1/invoice_freigabe_override`, {
          method: 'POST', headers,
          body: JSON.stringify({
            invoice_id: rows[0].id, project_id, admin_id: userId, grund: String(override_grund).trim(),
          }),
        });
      } catch { /* Protokoll-Fehler darf die erfolgreiche Rechnung nicht rückgängig machen */ }
    }

    // Phase 17: Impact-Tracking (blockiert nie, Fehler nur geloggt)
    await trackImpact('rechnung', gross, 'eur', {
      invoice_number: invoiceNumber,
      invoice_type: rows[0]?.invoice_type || 'standard',
    });

    return NextResponse.json({ success: true, invoice: rows[0], override_verwendet: overrideVerwendet, ...(kopfWarnung ? { warnung: kopfWarnung } : {}), ...(aufmassWarnung ? { aufmass_warnung: aufmassWarnung } : {}), ...(vorhaltungWarnung ? { vorhaltung_warnung: vorhaltungWarnung } : {}), ...(steuerWarnungen.length ? { steuer_warnungen: steuerWarnungen } : {}) });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

// ─── POST mit Wiederholungsschutz ───
// Idempotency-Key (Header): dieselbe Anfrage liefert das ursprüngliche Ergebnis und legt nichts doppelt an. Ohne Schlüssel (ältere Aufrufer) unverändert.
export async function POST(req: NextRequest) {
  const schluessel = (req.headers.get('idempotency-key') || '').trim().slice(0, 100);
  if (!schluessel) return anlegen(req);
  const key = `rechnung:${schluessel}`;
  let start: { zustand?: string; antwort?: unknown; http_status?: number } | null = null;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/faktura_idempotenz_start`, { method: 'POST', headers, body: JSON.stringify({ p_schluessel: key, p_art: 'rechnung_anlegen' }) });
    start = r.ok ? await r.json() : null;
  } catch { start = null; }
  if (!start) return anlegen(req);                       // Schlüsseltabelle nicht erreichbar (Migration fehlt): ohne Schutz weiterarbeiten statt blockieren
  if (start.zustand === 'fertig') return NextResponse.json(start.antwort ?? { success: true }, { status: start.http_status || 200, headers: { 'Idempotent-Replay': 'true' } });
  if (start.zustand === 'laeuft') return NextResponse.json({ success: false, code: 'IN_BEARBEITUNG', error: 'Dieselbe Anfrage wird gerade verarbeitet.' }, { status: 409 });
  const res = await anlegen(req);
  let antwort: unknown = null;
  try { antwort = await res.clone().json(); } catch { /* keine JSON-Antwort */ }
  await fetch(`${url}/rest/v1/rpc/faktura_idempotenz_ende`, { method: 'POST', headers, body: JSON.stringify({ p_schluessel: key, p_antwort: antwort, p_http_status: res.status }) }).catch(() => {});
  return res;
}

// ─── PATCH: Status ändern ───
export async function PATCH(req: NextRequest) {
  const { role, userId } = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, error: 'Nur Admin und Disposition dürfen Rechnungen ändern.' },
      { status: 403 }
    );
  }
  try {
    const body = await req.json();
    const { id, status, reminder_level, notes, paid_amount } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
    }
    if (status && !['offen', 'bezahlt', 'ueberfaellig', 'storniert'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Ungültiger Status.' },
        { status: 400 }
      );
    }

    // NEU (Phase 15): Mahnstufe 0–2 neben Status änderbar
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (status) patch.status = status;
    if (reminder_level != null) {
      const rl = Number(reminder_level);
      if (![0, 1, 2].includes(rl)) {
        return NextResponse.json({ success: false, error: 'Mahnstufe muss 0, 1 oder 2 sein.' }, { status: 400 });
      }
      patch.reminder_level = rl;
    }
    if (notes !== undefined) patch.notes = notes;
    // NEU (Phase 38): paid_amount – reflektiert den tatsächlichen Zahlungs-
    // eingang, kein Eingriff in den ursprünglich ausgestellten Rechnungs-
    // inhalt (Positionen/Beträge bleiben unveränderbar, siehe oben).
    if (paid_amount != null) {
      const pa = Number(paid_amount);
      if (!Number.isFinite(pa) || pa < 0) {
        return NextResponse.json({ success: false, error: 'Der bezahlte Betrag muss eine Zahl von 0 oder mehr sein.' }, { status: 400 });
      }
      patch.paid_amount = Math.round(pa * 100) / 100;
    }
    if (!status && reminder_level == null && notes === undefined && paid_amount == null) {
      return NextResponse.json({ success: false, error: 'Nichts zu ändern.' }, { status: 400 });
    }
    // Phase 35 (GoBD): Positionen/Beträge einer bereits ausgestellten Rechnung
    // werden absichtlich NICHT mehr per PATCH änderbar gemacht – eine Rechnung
    // muss nach Erstellung unveränderbar bleiben. Änderungen laufen jetzt über
    // "Neue Version anlegen" (POST einer neuen Rechnung mit Bezug + diese hier
    // auf "storniert" setzen), siehe Kunden-Detail.

    // Zahlung gegen den noch offenen Betrag NACH Gutschriften prüfen (zentral, lib/forderung.ts; Gutschriften per Rechnungsnummer, unabhängig von
    // Baustelle/Ansicht). „bezahlt“ ohne Betrag verbucht den noch offenen Betrag; eine Gutschrift ist keine Zahlung und wird nicht als solche gebucht.
    if (patch.paid_amount !== undefined || status === 'bezahlt') {
      const gr = await fetch(`${url}/rest/v1/invoices?id=eq.${id}&select=id,invoice_number,invoice_type,due_date,gross_amount,paid_amount,status`, { headers });
      const zeile = gr.ok ? (await gr.json())?.[0] : null;
      const brutto = zeile ? Number(zeile.gross_amount) : NaN;
      if (zeile && Number.isFinite(brutto) && zeile.status !== 'storniert') {
        const f = await ladeBelegForderung({ url, headers }, zeile);
        if (!f) throw new Error('Gutschriften zur Rechnung nicht lesbar');
        const maxGesamt = Math.round((brutto - f.gutschrift) * 100) / 100;
        if (status === 'bezahlt') {
          // Als „bezahlt“ markieren: bei vorhandenen Gutschriften zählt nur der tatsächlich noch geschuldete Rest als Zahlung
          if (patch.paid_amount === undefined) patch.paid_amount = Math.round((Number(zeile.paid_amount || 0) + f.offen) * 100) / 100;
          else if (f.gutschrift > 0 && Math.abs(patch.paid_amount - brutto) <= 0.01) patch.paid_amount = maxGesamt;
        }
        if (patch.paid_amount !== undefined && patch.paid_amount - maxGesamt > 0.01) {
          return NextResponse.json({ success: false, error: `Der bezahlte Betrag (${patch.paid_amount.toFixed(2)} €) liegt über dem Rechnungsbetrag${f.gutschrift > 0 ? ` nach Gutschriften (${maxGesamt.toFixed(2)} €)` : ` (${brutto.toFixed(2)} €)`}.` }, { status: 400 });
        }
      }
    }

    // Faktura F6: Stand vor der Änderung merken, damit der Verlauf „von → auf“ zeigen kann
    let vorher: { invoice_number?: string; project_id?: string | null; status?: string; paid_amount?: number | null } | null = null;
    try {
      const vr = await fetch(`${url}/rest/v1/invoices?id=eq.${id}&select=invoice_number,project_id,status,paid_amount`, { headers });
      if (vr.ok) vorher = (await vr.json())?.[0] || null;
    } catch { /* Verlauf ist best effort */ }

    // Eine stornierte Rechnung wird nicht wieder geöffnet (GoBD; ihre Aufmaßmenge kann inzwischen neu abgerechnet sein)
    if (status && vorher?.status === 'storniert' && status !== 'storniert') {
      return NextResponse.json({ success: false, code: 'STORNIERT_FINAL', error: 'Eine stornierte Rechnung kann nicht wieder geöffnet werden. Bitte eine neue Rechnung anlegen.' }, { status: 409 });
    }

    // Eine Gutschrift, die eine Leistung freigegeben hat, wird nicht storniert (sonst doppelt abrechenbar; Protokoll mit Benutzer/Zeit/Grund)
    if (status === 'storniert' && vorher?.status !== 'storniert') {
      const ge = await gutschriftEntfernenPruefen({ url, headers }, String(id));
      if (!ge.erlaubt) {
        await schreibeHistorie({ aktion: 'status_geaendert', invoiceId: id, invoiceNumber: vorher?.invoice_number, projectId: vorher?.project_id, userId, grund: 'Storno der Gutschrift abgelehnt', details: { abgelehnt: ge.code, bezug: ge.bezugNr ?? null } });
        return NextResponse.json({ success: false, code: ge.code, error: ge.text }, { status: 409 });
      }
    }

    // Auf eine stornierte Rechnung wird nichts mehr gebucht (Zahlung/„bezahlt“). Bereits gebuchte Zahlungen bleiben unverändert erhalten.
    const zahlungsAenderung = patch.paid_amount !== undefined || status === 'bezahlt';
    const zahlungAufStorniert = { success: false, code: 'ZAHLUNG_AUF_STORNIERT', error: 'Auf eine stornierte Rechnung kann keine Zahlung gebucht werden. Bereits gebuchte Zahlungen bleiben im Verlauf erhalten.' };
    if (zahlungsAenderung && vorher?.status === 'storniert') {
      return NextResponse.json(zahlungAufStorniert, { status: 409 });
    }

    // Bei Zahlungsänderungen zusätzlich in der Abfrage selbst: ein gleichzeitiges Storno kann nicht mehr überschrieben werden.
    const res = await fetch(`${url}/rest/v1/invoices?id=eq.${id}${zahlungsAenderung ? '&status=neq.storniert' : ''}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await res.text());

    const rows = await res.json();
    if (!rows?.length) {
      if (zahlungsAenderung && vorher) return NextResponse.json(zahlungAufStorniert, { status: 409 });
      return NextResponse.json({ success: false, error: 'Rechnung nicht gefunden.' }, { status: 404 });
    }
    let zuordnungHinweis: string | null = null;
    if (rows[0].invoice_type === 'gutschrift' && rows[0].status === 'storniert' && vorher?.status !== 'storniert') {
      await gleicheStatusNachGutschriftAb({ url, headers }, rows[0].reference_invoice_number, { userId });
    }
    if (vorher && rows[0].status === 'storniert' && vorher.status !== 'storniert' && vorher.project_id) {
      // Nicht versendet: Menge/Zeitraum sofort wieder frei. Versendet: erst mit voller Gutschrift (sonst wäre die Leistung doppelt abrechenbar).
      const erg = await freigabeNachStorno({ url, headers }, { projectId: vorher.project_id, invoiceId: String(id), invoiceNumber: vorher.invoice_number, nettoBetrag: Number(rows[0].net_amount), userId });
      if (erg === 'bleibt_bis_gutschrift') zuordnungHinweis = 'Die Rechnung wurde bereits versendet. Aufmaß bzw. Vorhaltezeitraum bleiben berechnet, bis eine Gutschrift den Betrag voll gutschreibt.';
    }
    if (vorher) {
      const statusNeu = rows[0].status, zahlungNeu = Number(rows[0].paid_amount || 0), zahlungAlt = Number(vorher.paid_amount || 0);
      if (statusNeu !== vorher.status || zahlungNeu !== zahlungAlt) {
        await schreibeHistorie({
          aktion: statusNeu === 'storniert' && vorher.status !== 'storniert' ? 'storniert' : zahlungNeu !== zahlungAlt ? 'zahlung_geaendert' : 'status_geaendert',
          invoiceId: id, invoiceNumber: vorher.invoice_number, projectId: vorher.project_id, userId,
          details: { status: { von: vorher.status, auf: statusNeu }, bezahlt: { von: zahlungAlt, auf: zahlungNeu }, ...(zuordnungHinweis ? { zuordnung: 'bleibt bis Gutschrift' } : {}) },
        });
      }
    }
    return NextResponse.json({ success: true, invoice: rows[0], ...(zuordnungHinweis ? { hinweis: zuordnungHinweis } : {}) });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

// ─── DELETE: Rechnung löschen (nur solange „offen") ───
export async function DELETE(req: NextRequest) {
  const { role, userId } = await callerRole();
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, error: 'Nur Admin und Disposition dürfen Rechnungen löschen.' },
      { status: 403 }
    );
  }
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
    }

    // Stornieren statt Löschen, sobald gebucht/versendet (GoBD!)
    const check = await fetch(`${url}/rest/v1/invoices?id=eq.${id}&select=status,invoice_number,project_id,invoice_type,reference_invoice_number`, { headers });
    if (!check.ok) throw new Error(await check.text());
    const rows = await check.json();
    if (!rows?.length) {
      return NextResponse.json({ success: false, error: 'Rechnung nicht gefunden.' }, { status: 404 });
    }
    if (rows[0].status !== 'offen') {
      return NextResponse.json(
        { success: false, error: 'Nur offene Rechnungen können gelöscht werden. Bereits versendete oder bezahlte Rechnungen bitte stornieren (GoBD).' },
        { status: 409 }
      );
    }

    // Eine bereits versendete Rechnung darf nicht gelöscht werden, auch wenn sie noch „offen“ ist (GoBD) – nur stornieren.
    // Maßgeblich ist jeder Versandnachweis (Versandprotokoll nach ID und Nummer sowie der ältere Mailverlauf email_log).
    if (await istVersendet({ url, headers }, String(id), rows[0].invoice_number)) {
      return NextResponse.json({ success: false, code: 'BEREITS_VERSENDET', error: 'Diese Rechnung wurde schon versendet (oder der Versand lässt sich nicht ausschließen) und kann nicht mehr gelöscht werden. Bitte stornieren (und bei Bedarf eine neue Version oder Gutschrift anlegen).' }, { status: 409 });
    }

    {
      const ge = await gutschriftEntfernenPruefen({ url, headers }, String(id));
      if (!ge.erlaubt) {
        await schreibeHistorie({ aktion: 'status_geaendert', invoiceId: id, invoiceNumber: rows[0].invoice_number, projectId: rows[0].project_id, userId, grund: 'Löschen der Gutschrift abgelehnt', details: { abgelehnt: ge.code, bezug: ge.bezugNr ?? null } });
        return NextResponse.json({ success: false, code: ge.code, error: ge.text }, { status: 409 });
      }
    }

    const res = await fetch(`${url}/rest/v1/invoices?id=eq.${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error(await res.text());
    if (rows[0].project_id) {
      // Nur eine nicht versendete, offene Rechnung kommt bis hierher (siehe Prüfungen oben): ihre Zuordnung wird frei und im Verlauf vermerkt
      await gibZuordnungFrei({ projectId: rows[0].project_id, invoiceId: String(id), invoiceNumber: rows[0].invoice_number, userId, grund: 'Rechnung gelöscht (nicht versendet)' });
    }
    if (rows[0].invoice_type === 'gutschrift') await gleicheStatusNachGutschriftAb({ url, headers }, rows[0].reference_invoice_number, { userId });
    await schreibeHistorie({ aktion: 'geloescht', invoiceId: id, invoiceNumber: rows[0].invoice_number, projectId: rows[0].project_id, userId });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
