import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Pool } from 'pg'
import { NextRequest } from 'next/server'
import { baueEchtesRest } from './pg-rest'
import { aufmassStand } from '@/lib/aufmass-integritaet'
import { neuesZwischenaufmassJePosition, baueTeilleistungsPositionen, normalisiereZwischenaufmasse } from '@/lib/zwischenaufmass'
import { faelligeVorhaltung, vorhaltungStand, normalisiereVereinbarung, normalisierePerioden, plusTage, kostenpflichtigAb } from '@/lib/vorhaltung'

// ============================================================
// SCAFFOLD OS – END-TO-END-ABNAHMETEST FAKTURA (Auftrag → Aufmaß → Abschläge → Vorhaltung → Nachtrag → Schluss → Versand → Storno → Zahlung)
//
// Läuft NUR mit  E2E_DATABASE_URL=postgresql://…  (eine EIGENE Test-Datenbank, siehe __tests__/e2e/README.md – NIE Produktion!).
// Echt: PostgreSQL mit allen SQL-Migrationen (echte Funktionen create_invoice, aufmass_zuordnen, vorhaltung_zuordnen …), die echten
// Next-Routen /api/invoices, /api/projects, /api/nachtraege, /api/email, /api/invoice-dispatches.
// Nachgebaut: nur die HTTP-Schicht von PostgREST (pg-rest.ts), die Anmeldung (Admin) und der Mailanbieter Resend (kein echter Versand).
// ============================================================

const DB = process.env.E2E_DATABASE_URL
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
process.env.RESEND_API_KEY = 're_test'
const USER = '11111111-1111-4111-8111-111111111111'
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }),
  }),
}))
vi.mock('@/lib/angebot-annahme', () => ({ beiAngebotsannahmeSicher: async () => {} }))
vi.mock('@/lib/auto-tour', () => ({ fahrtNachholenSicher: async () => {} }))
let mailErgebnis: () => Promise<{ data?: { id: string }; error?: { message: string } }> = async () => ({ data: { id: 're_1' } })
vi.mock('resend', () => ({ Resend: class { emails = { send: () => mailErgebnis() } } }))

const HEUTE = new Date().toISOString().slice(0, 10)
let pool: Pool
const bericht: { abschnitt: string; fall: string; erwartet: string; tatsaechlich: string; ok: boolean }[] = []
const gleich = (a: unknown, b: unknown) => (typeof a === 'number' || /^-?\d+(\.\d+)?$/.test(String(a))) && /^-?\d+(\.\d+)?$/.test(String(b)) ? Math.abs(Number(a) - Number(b)) < 0.005 : String(a) === String(b)
const merke = (abschnitt: string, fall: string, erwartet: unknown, tatsaechlich: unknown, ok?: boolean) =>
  bericht.push({ abschnitt, fall, erwartet: String(erwartet), tatsaechlich: String(tatsaechlich), ok: ok ?? gleich(erwartet, tatsaechlich) })

async function api(modul: string, methode: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown, query = '') {
  const m = await import(modul)
  const res = await m[methode](new NextRequest('http://x/api' + query, { method: methode, body: body === undefined ? undefined : JSON.stringify(body) }) as never)
  const text = await res.text(); let j: any = null; try { j = JSON.parse(text) } catch { /* leer */ }
  return { status: res.status, j }
}
const inv = (m: 'POST' | 'PATCH' | 'DELETE', b?: unknown, q = '') => api('@/app/api/invoices/route', m, b, q)
const inv_get = (q = '') => api('@/app/api/invoices/route', 'GET', undefined, q)
const prj = (b: unknown) => api('@/app/api/projects/route', 'PATCH', b)
const nacht = (b: unknown) => api('@/app/api/nachtraege/route', 'POST', b)
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows
const projektData = async (id: string) => (await q('select data from projects where id=$1', [id]))[0].data
const rechnungen = (id: string) => q('select * from invoices where project_id=$1 order by created_at, invoice_number', [id])
const norm = (zeilen: any[]) => zeilen.map((r) => ({ ...r, invoice_date: r.invoice_date instanceof Date ? r.invoice_date.toISOString().slice(0, 10) : r.invoice_date, due_date: r.due_date instanceof Date ? r.due_date.toISOString().slice(0, 10) : r.due_date }))
const netto = (zeilen: any[]) => Math.round(zeilen.reduce((s, r) => s + Number(r.net_amount), 0) * 100) / 100

async function neuesProjekt(name: string, data: Record<string, unknown>): Promise<string> {
  const kunde = (await q(`insert into customers(name,email) values ('Testkunde E2E','kunde@test.invalid') returning id`))[0].id
  const p = (await q(`insert into projects(name,adresse,status,data,customer_id) values ($1,'Teststr. 1','active',$2,$3) returning id`, [name, JSON.stringify(data), kunde]))[0].id
  await q(`insert into project_events(project_id,type,pruefung_details) values ($1,'pruefung_freigabe','{"freigegeben":true}')`, [p]).catch(() => {})
  return p
}
const Z = (id: string, nr: number, positionen: { bezeichnung: string; einheit: string; einzelpreis: number; menge: number }[], stichtag = HEUTE) => {
  const e = neuesZwischenaufmassJePosition(normalisiereZwischenaufmasse([]), { stichtag, positionen }, id)
  if (!e.ok) throw new Error(e.fehler); return { ...e.eintrag, nr }
}

// ── Prüfung der Datenintegrität nach jedem Abschnitt ──
async function integritaet(projektId: string): Promise<string[]> {
  const fehler: string[] = []
  const d = await projektData(projektId); const rs = await rechnungen(projektId); const ids = new Set(rs.map((r) => r.id))
  const refs: string[] = []
  for (const z of d.zwischenaufmasse || []) { if (z.rechnungId) refs.push(z.rechnungId); if (z.reserviertAm) fehler.push(`Aufmaß ${z.id} hängt in Reservierung`) }
  for (const p of d.vorhaltePerioden || []) { if (p.rechnungId) refs.push(p.rechnungId); else fehler.push(`Zeitraum ${p.von} ohne Rechnung`) }
  for (const r of refs) if (!ids.has(r)) fehler.push(`Verweis auf unbekannte Rechnung ${r}`)
  if (new Set(refs).size !== refs.length) fehler.push('Eine Rechnung ist mehrfach zugeordnet')
  const per = (d.vorhaltePerioden || []).slice().sort((a: any, b: any) => a.von.localeCompare(b.von))
  for (let i = 1; i < per.length; i++) if (per[i].von < per[i - 1].bis) fehler.push('Zeiträume überschneiden sich')
  for (const r of refs) { const x = rs.find((y) => y.id === r); if (x && x.status === 'storniert') fehler.push(`Zuordnung zeigt auf stornierte Rechnung ${x.invoice_number} (nur zulässig, wenn versendet und noch nicht voll gutgeschrieben)`) }
  return fehler
}

describe.skipIf(!DB)('Faktura End-to-End (echte PostgreSQL)', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DB, max: 12 })
    const rest = baueEchtesRest(pool)
    vi.stubGlobal('fetch', rest)
    await q(`insert into auth.users(id,email) values ($1,'e2e@test.invalid') on conflict do nothing`, [USER]).catch(() => {})
  })
  afterAll(async () => {
    // Testdaten entfernen: nur Zeilen dieses Tests (Projekte „E2E …“). Der Änderungsverlauf ist per Trigger nur zum Anhängen da (GoBD);
    // für das Aufräumen der TESTDATENBANK werden Trigger in dieser einen Sitzung abgeschaltet (setzt Superuser voraus).
    const c = await pool.connect()
    try {
      await c.query(`set session_replication_role = replica`)
      const ids = `(select id from projects where name like 'E2E %')`
      // auch Rechnungen/Gutschriften OHNE Baustelle (Kunde „Testkunde E2E“) und die Massendaten des Limit-Tests
      const meine = `(select id from invoices where project_id in ${ids} or customer_name in ('Testkunde E2E', 'Masse GmbH'))`
      await c.query(`delete from invoice_payments where invoice_id in ${meine}`)
      await c.query(`delete from faktura_idempotenz where art = 'rechnung_anlegen' or schluessel like 'rechnung:%'`)
      await c.query(`delete from abrechnung_historie where invoice_id in ${meine}`)
      await c.query(`delete from invoice_dispatches where project_id in ${ids}`)
      await c.query(`delete from email_log where project_id in ${ids} or invoice_number in (select invoice_number from invoices where project_id in ${ids})`)
      await c.query(`delete from abrechnung_historie where project_id in ${ids}`)
      await c.query(`delete from invoices where project_id in ${ids} or customer_name in ('Testkunde E2E', 'Masse GmbH')`)
      await c.query(`delete from project_events where project_id in ${ids}`)
      await c.query(`delete from projects where name like 'E2E %'`)
      await c.query(`delete from customers where name in ('Testkunde E2E','Mehrbaustellen E2E')`)
    } finally { await c.query(`reset session_replication_role`); c.release() }
    await pool.end()
    if (process.env.E2E_BERICHT) (await import('node:fs')).writeFileSync(process.env.E2E_BERICHT, JSON.stringify(bericht, null, 2))
  })

  // ──────────────────────────────────────────────────────────
  // 1.–5. Die Hauptkette einer Baustelle
  // ──────────────────────────────────────────────────────────
  describe('Baustelle: Auftrag → Aufmaß → Vorhaltung → Nachtrag → Schluss', () => {
    let P = ''; let za1 = ''; let za2 = ''; let za3 = ''
    const FASSADE = { bezeichnung: 'Fassadengerüst', einheit: 'm²', einzelpreis: 8 }
    const TURM = { bezeichnung: 'Treppenturm', einheit: 'Stk', einzelpreis: 1000 }

    it('1. Auftrag 10.000 € netto; genehmigter Nachtrag 1.000 € → Auftragswert 11.000 € (Vorgabe nennt 12.000 €: rechnerisch nicht möglich)', async () => {
      P = await neuesProjekt('E2E Baustelle', { kiResult: { suggestedPrice: 10000 }, preisModus: 'pauschale', pauschale: '10000', nachtraege: [] })
      const r = await nacht({ project_id: P, aenderung: { op: 'anlegen', id: 'aaaaaaaa-0000-4000-8000-000000000001', datum: HEUTE, titel: 'Zusatzgerüst Anbau', betrag: 1000, grund: 'Kundenwunsch Anbau' } })
      expect(r.status).toBe(200)
      const st = await nacht({ project_id: P, aenderung: { op: 'status', id: 'aaaaaaaa-0000-4000-8000-000000000001', status: 'bestaetigt' } })
      expect(st.status).toBe(200)
      const nachtraege = (await projektData(P)).nachtraege
      const bestaetigt = nachtraege.filter((n: any) => n.status === 'bestaetigt').reduce((s: number, n: any) => s + n.betrag, 0)
      merke('1 Auftrag', 'Auftragswert netto = 10.000 + genehmigter Nachtrag 1.000', 11000, 10000 + bestaetigt)
      expect(10000 + bestaetigt).toBe(11000)
      const h = await q(`select * from abrechnung_historie where project_id=$1 and aktion like 'nachtrag%' order by created_at`, [P])
      merke('4 Nachträge', 'Verlauf hat Benutzer, Zeitpunkt, Grund (Anlegen)', 'ja', h[0]?.user_id && h[0]?.created_at && h[0]?.grund ? 'ja' : 'nein')
      expect(h[0].user_id).toBe(USER); expect(h[0].grund).toBeTruthy()
    })

    it('4b. Ein nicht genehmigter (angefragter) Nachtrag erhöht den abrechenbaren Auftragswert nicht', async () => {
      await nacht({ project_id: P, aenderung: { op: 'anlegen', id: 'aaaaaaaa-0000-4000-8000-000000000002', datum: HEUTE, titel: 'Option Dachfang', betrag: 700, grund: 'Angefragt, nicht beauftragt' } })
      const rs = await inv('POST', { customer_name: 'Testkunde E2E', project_id: P, invoice_type: 'standard', positions: [{ bezeichnung: 'Test Obergrenze', menge: 1, einheit: 'Pauschale', einzelpreis: 11500 }] })
      merke('4 Nachträge', 'Rechnung über 11.500 (10.000 + 1.000 bestätigt + 700 nur angefragt) wird als Überschreitung gemeldet', 409, rs.status)
      expect(rs.status).toBe(409); expect(rs.j.abweichungen.map((a: any) => a.code)).toContain('UEBER_AUFTRAGSWERT')
    })

    it('2a. Erstes Aufmaß: 500 m² + 1 Treppenturm → Abschlag 4.000 + 1.000 = 5.000', async () => {
      za1 = 'za-1'
      const z = Z(za1, 1, [{ ...FASSADE, menge: 500 }, { ...TURM, menge: 1 }])
      expect((await prj({ id: P, data: { zwischenaufmasse: [z] } })).status).toBe(200)
      const liste = normalisiereZwischenaufmasse((await projektData(P)).zwischenaufmasse)
      const t = baueTeilleistungsPositionen(liste[0], liste)
      const r = await inv('POST', { customer_name: 'Testkunde E2E', project_id: P, invoice_type: 'abschlag', positions: t.positionen, aufmass: { za_id: za1, stand: aufmassStand(liste[0]) } })
      expect(r.status).toBe(200)
      merke('2 Aufmaß', 'Abschlag 1 netto', 5000, r.j.invoice.net_amount)
      expect(Number(r.j.invoice.net_amount)).toBe(5000)
    })

    it('2b. Zweites kumuliertes Aufmaß: 700 m² + 1 Turm → nur 200 m² (1.600 €), Turm nicht erneut', async () => {
      za2 = 'za-2'
      const alt = normalisiereZwischenaufmasse((await projektData(P)).zwischenaufmasse)
      const e = neuesZwischenaufmassJePosition(alt, { stichtag: HEUTE, positionen: [{ ...FASSADE, menge: 700 }, { ...TURM, menge: 1 }] }, za2)
      if (!e.ok) throw new Error(e.fehler)
      expect((await prj({ id: P, data: { zwischenaufmasse: [...(await projektData(P)).zwischenaufmasse, e.eintrag] } })).status).toBe(200)
      const liste = normalisiereZwischenaufmasse((await projektData(P)).zwischenaufmasse)
      const t = baueTeilleistungsPositionen(liste[1], liste)
      merke('2 Aufmaß', 'Positionen des 2. Abschlags', '1 (200 m²)', `${t.positionen.length} (${t.positionen.map((p) => p.menge + ' ' + p.einheit).join(', ')})`)
      expect(t.positionen).toHaveLength(1); expect(t.positionen[0].menge).toBe(200)
      const r = await inv('POST', { customer_name: 'Testkunde E2E', project_id: P, invoice_type: 'abschlag', positions: t.positionen, aufmass: { za_id: za2, stand: aufmassStand(liste[1]) } })
      expect(r.status).toBe(200); merke('2 Aufmaß', 'Abschlag 2 netto', 1600, r.j.invoice.net_amount); expect(Number(r.j.invoice.net_amount)).toBe(1600)
    })

    it('2c. Drittes Aufmaß 800 m² → nur 100 m² (800 €)', async () => {
      za3 = 'za-3'
      const alt = normalisiereZwischenaufmasse((await projektData(P)).zwischenaufmasse)
      const e = neuesZwischenaufmassJePosition(alt, { stichtag: HEUTE, positionen: [{ ...FASSADE, menge: 800 }, { ...TURM, menge: 1 }] }, za3)
      if (!e.ok) throw new Error(e.fehler)
      expect((await prj({ id: P, data: { zwischenaufmasse: [...(await projektData(P)).zwischenaufmasse, e.eintrag] } })).status).toBe(200)
      const liste = normalisiereZwischenaufmasse((await projektData(P)).zwischenaufmasse)
      const t = baueTeilleistungsPositionen(liste[2], liste)
      expect(t.positionen.map((p) => p.menge)).toEqual([100])
      const r = await inv('POST', { customer_name: 'Testkunde E2E', project_id: P, invoice_type: 'abschlag', positions: t.positionen, aufmass: { za_id: za3, stand: aufmassStand(liste[2]) } })
      expect(r.status).toBe(200); merke('2 Aufmaß', 'Abschlag 3 netto', 800, r.j.invoice.net_amount)
    })

    it('2d. Doppelabrechnung: dasselbe Aufmaß nochmal, und freie Position mit Namen einer aufgemessenen Leistung', async () => {
      const liste = normalisiereZwischenaufmasse((await projektData(P)).zwischenaufmasse)
      const nochmal = await inv('POST', { customer_name: 'Testkunde E2E', project_id: P, invoice_type: 'abschlag', positions: [{ bezeichnung: 'x', menge: 100, einheit: 'm²', einzelpreis: 8 }], aufmass: { za_id: za3, stand: aufmassStand(liste[2]) } })
      merke('2 Aufmaß', 'Zweite Abrechnung desselben Aufmaßes', 409, nochmal.status); expect(nochmal.status).toBe(409)
      const frei = await inv('POST', { customer_name: 'Testkunde E2E', project_id: P, invoice_type: 'abschlag', positions: [{ bezeichnung: 'Fassadengerüst', menge: 50, einheit: 'm²', einzelpreis: 8 }] })
      merke('2 Aufmaß', 'Freie Position „Fassadengerüst“ ohne Aufmaßbezug', 'Abweichung gemeldet (409)', frei.status === 409 && frei.j.abweichungen.some((a: any) => a.code === 'AUFMASS_POSITION_OHNE_BEZUG') ? 'Abweichung gemeldet (409)' : `Status ${frei.status}`)
      expect(frei.status).toBe(409); expect(frei.j.abweichungen.map((a: any) => a.code)).toContain('AUFMASS_POSITION_OHNE_BEZUG')
      expect((await integritaet(P))).toEqual([])
    })

    it('3. Vorhaltung: Beginn vor 6 Wochen, 14 Tage frei, 250 €/Woche – Beginn, Zeitraum, Preis, keine Doppelabrechnung', async () => {
      const beginn = plusTage(HEUTE, -42)
      const vb = { aktiv: true, beginn, freiTage: 14, intervall: 'woche', preis: 250, abrechnung: 'im_voraus', teilabbauten: [] }
      expect((await prj({ id: P, data: { vorhaltung: vb } })).status).toBe(200)
      const v = normalisiereVereinbarung((await projektData(P)).vorhaltung)!
      merke('3 Vorhaltung', 'kostenpflichtig ab (Beginn + 14 Tage)', plusTage(beginn, 14), kostenpflichtigAb(v))
      const f = faelligeVorhaltung(v, [], HEUTE)!
      // 42 Tage nach Beginn: Intervalle starten an Tag 14, 21, 28, 35, 42 → 5 angefangene Wochen
      merke('3 Vorhaltung', 'fällige Wochen (angefangenes Intervall voll)', 5, f.intervalle.length); merke('3 Vorhaltung', 'Betrag netto', 1250, f.netto)
      expect(f.intervalle).toHaveLength(5); expect(f.netto).toBe(1250); expect(f.positionen[0]).toMatchObject({ einheit: 'Wo.', einzelpreis: 250, menge: 5, art: 'miete' })
      const body = { customer_name: 'Testkunde E2E', project_id: P, invoice_type: 'standard', positions: f.positionen, vorhaltung: { von: f.von, bis: f.bis, stand: vorhaltungStand(v, []) } }
      const r = await inv('POST', body)
      expect(r.status).toBe(200); merke('3 Vorhaltung', 'Rechnung Vorhaltung netto', 1250, r.j.invoice.net_amount)
      const nochmal = await inv('POST', body)
      merke('3 Vorhaltung', 'Derselbe Zeitraum ein zweites Mal', 409, nochmal.status); expect(nochmal.status).toBe(409)
      expect((await integritaet(P))).toEqual([])
    })

    it('3b. Preisänderung braucht einen Gültigkeitsbeginn; berechnete Zeiträume bleiben unverändert', async () => {
      const d = await projektData(P); const v0 = d.vorhaltung
      const ohne = await prj({ id: P, data: { vorhaltung: { ...v0, preis: 300 } }, aenderungsgrund: 'Preiserhöhung' })
      merke('3 Vorhaltung', 'Preis ändern ohne Datum', 409, ohne.status); expect(ohne.status).toBe(409)
      const bis = (d.vorhaltePerioden[0]).bis
      const mit = await prj({ id: P, data: { vorhaltung: { ...v0, preisStufen: [{ ab: bis, preis: 300 }] } }, aenderungsgrund: 'Preiserhöhung ab Folgewoche' })
      merke('3 Vorhaltung', 'Preisänderung ab Datum nach berechnetem Zeitraum', 200, mit.status); expect(mit.status).toBe(200)
      const nach = await projektData(P)
      expect(nach.vorhaltePerioden[0].netto).toBe(1250)
      const h = await q(`select * from abrechnung_historie where project_id=$1 and aktion='vorhaltung_vereinbart' order by created_at desc limit 1`, [P])
      expect(h[0].user_id).toBe(USER); expect(h[0].grund).toContain('Preiserhöhung')
    })

    it('5. Schlussrechnung: Auftragswert 11.000 − Abschläge 7.400 = 3.600; Vorhaltung zählt nicht zum Auftragswert', async () => {
      const zuViel = await inv('POST', { customer_name: 'Testkunde E2E', project_id: P, invoice_type: 'schluss', positions: [{ bezeichnung: 'Restleistung', menge: 1, einheit: 'Pauschale', einzelpreis: 4000 }] })
      merke('5 Schluss', 'Schluss über 4.000 (Rest wäre 3.600)', '409 UEBER_AUFTRAGSWERT', `${zuViel.status} ${(zuViel.j.abweichungen || []).map((a: any) => a.code).join(',')}`)
      expect(zuViel.status).toBe(409)
      const ok = await inv('POST', { customer_name: 'Testkunde E2E', project_id: P, invoice_type: 'schluss', positions: [{ bezeichnung: 'Restleistung nach Aufmaß', menge: 1, einheit: 'Pauschale', einzelpreis: 3600 }] })
      merke('5 Schluss', 'Schluss über 3.600 schließt die Baustelle', 200, ok.status); if (ok.status !== 200) console.log('SCHLUSS', JSON.stringify(ok.j))
      expect(ok.status).toBe(200)
      const rs = await rechnungen(P)
      const nichtVorhalt = rs.filter((r) => !(r.positions || []).every((p: any) => p.art === 'miete'))
      merke('5 Schluss', 'Summe Aufträge ohne Vorhaltung = Auftragswert', 11000, netto(nichtVorhalt))
      expect(netto(nichtVorhalt)).toBe(11000)
      merke('5 Schluss', 'Summe aller Rechnungen netto inkl. Vorhaltung', 12250, netto(rs)); expect(netto(rs)).toBe(12250)
      expect((await integritaet(P))).toEqual([])
    })
  })

  // ──────────────────────────────────────────────────────────
  // Hilfen für die weiteren Abschnitte
  // ──────────────────────────────────────────────────────────
  const KUNDE = 'Testkunde E2E'
  const PDF_A = Buffer.from('%PDF-1.4 Dokument Version A').toString('base64')
  const PDF_B = Buffer.from('%PDF-1.4 Dokument Version B (neu erzeugt)').toString('base64')
  const sha = async (b64: string) => (await import('node:crypto')).createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex')
  async function aufmassRechnung(P: string, zaId: string, menge = 100, nr = 1, extraBody: Record<string, unknown> = {}) {
    const d = await projektData(P); const vorhanden = (d.zwischenaufmasse || []).find((z: any) => z.id === zaId)
    if (!vorhanden) {
      const e = neuesZwischenaufmassJePosition(normalisiereZwischenaufmasse(d.zwischenaufmasse || []), { stichtag: HEUTE, positionen: [{ bezeichnung: 'Fassadengerüst', einheit: 'm²', einzelpreis: 10, menge }] }, zaId)
      if (!e.ok) throw new Error(e.fehler)
      const w = await prj({ id: P, data: { zwischenaufmasse: [...(d.zwischenaufmasse || []), { ...e.eintrag, nr }] } }); if (w.status !== 200) throw new Error('ZA speichern: ' + JSON.stringify(w.j))
    }
    const liste = normalisiereZwischenaufmasse((await projektData(P)).zwischenaufmasse); const z = liste.find((x) => x.id === zaId)!
    const t = baueTeilleistungsPositionen(z, liste)
    return inv('POST', { customer_name: KUNDE, project_id: P, invoice_type: 'abschlag', positions: t.positionen, aufmass: { za_id: zaId, stand: aufmassStand(z) }, ...extraBody })
  }
  async function vorhaltungRechnung(P: string) {
    const d = await projektData(P); const v = normalisiereVereinbarung(d.vorhaltung)!; const per = normalisierePerioden(d.vorhaltePerioden)
    const f = faelligeVorhaltung(v, per, HEUTE); if (!f) throw new Error('nichts fällig')
    return inv('POST', { customer_name: KUNDE, project_id: P, invoice_type: 'standard', positions: f.positionen, vorhaltung: { von: f.von, bis: f.bis, stand: vorhaltungStand(v, per) } })
  }
  const vb = (extra: Record<string, unknown> = {}) => ({ aktiv: true, beginn: plusTage(HEUTE, -42), freiTage: 14, intervall: 'woche', preis: 250, abrechnung: 'im_voraus', teilabbauten: [], ...extra })
  async function versende(nr: string, pdf = PDF_A, to = 'kunde@test.invalid') {
    mailErgebnis = async () => ({ data: { id: 're_' + nr } })
    return api('@/app/api/email/route', 'POST', { to, projectName: 'E2E Baustelle', type: 'rechnung', invoiceNumber: nr, customerName: KUNDE, pdfBase64: pdf, format: 'pdf', grossAmount: 100, dueDate: HEUTE })
  }
  const gutschrift = (P: string, bezug: string, nettoBetrag: number) =>
    inv('POST', { customer_name: KUNDE, project_id: P, invoice_type: 'gutschrift', reference_invoice_number: bezug, positions: [{ bezeichnung: 'Gutschrift zu ' + bezug, menge: 1, einheit: 'Pauschale', einzelpreis: nettoBetrag }] })
  const storno = (id: string) => inv('PATCH', { id, status: 'storniert' })
  const zaVon = async (P: string, id: string) => ((await projektData(P)).zwischenaufmasse || []).find((z: any) => z.id === id)

  // ──────────────────────────────────────────────────────────
  // 3c. Teilabbau und Preisart
  // ──────────────────────────────────────────────────────────
  describe('3c. Vorhaltung: Teilabbau und Preisart', () => {
    const teil = (preisModus?: string) => vb({ teilabbauten: [{ datum: plusTage(HEUTE, -14), verbleibendProzent: 60, ...(preisModus ? { preisModus } : {}) }] })
    it('anteiliger Preis: 2 Wochen à 250 + 3 Wochen à 150 = 950 €', async () => {
      const P = await neuesProjekt('E2E Teilabbau anteilig', { vorhaltung: teil('anteilig') })
      const r = await vorhaltungRechnung(P); expect(r.status).toBe(200)
      merke('3 Vorhaltung', 'Teilabbau anteilig (60 %)', 950, r.j.invoice.net_amount); expect(Number(r.j.invoice.net_amount)).toBe(950)
    })
    it('voller Preis: 5 Wochen à 250 = 1.250 €', async () => {
      const P = await neuesProjekt('E2E Teilabbau voll', { vorhaltung: teil('voll') })
      const r = await vorhaltungRechnung(P); expect(r.status).toBe(200)
      merke('3 Vorhaltung', 'Teilabbau voller Preis', 1250, r.j.invoice.net_amount); expect(Number(r.j.invoice.net_amount)).toBe(1250)
    })
    it('ohne festgelegte Preisart ist keine Abrechnung möglich', async () => {
      const P = await neuesProjekt('E2E Teilabbau offen', { vorhaltung: teil(undefined) })
      const r = await inv('POST', { customer_name: KUNDE, project_id: P, invoice_type: 'standard', positions: [{ bezeichnung: 'Gerüstvorhaltung', menge: 5, einheit: 'Wo.', einzelpreis: 250, art: 'miete' }], vorhaltung: { von: plusTage(HEUTE, -28), bis: plusTage(HEUTE, 7), stand: 'x' } })
      merke('3 Vorhaltung', 'Teilabbau ohne Preisart', 409, r.status); expect(r.status).toBe(409)
      expect(await rechnungen(P)).toHaveLength(0)
    })
    it('Vertragsänderung nach abgerechnetem Zeitraum: Beginn/Frist/Intervall gesperrt', async () => {
      const P = await neuesProjekt('E2E Vertragsaenderung', { vorhaltung: vb() })
      expect((await vorhaltungRechnung(P)).status).toBe(200)
      for (const [name, aendern] of [['kostenlose Zeit', { freiTage: 7 }], ['Beginn', { beginn: plusTage(HEUTE, -30) }], ['Intervall', { intervall: 'monat' }]] as const) {
        const r = await prj({ id: P, data: { vorhaltung: vb(aendern) }, aenderungsgrund: 'Test Änderung' })
        merke('3 Vorhaltung', 'Änderung ' + name + ' nach Abrechnung', 409, r.status); expect(r.status).toBe(409)
      }
      expect((await projektData(P)).vorhaltePerioden[0].netto).toBe(1250)
    })
  })

  // ──────────────────────────────────────────────────────────
  // 6. E-Mail und Versand
  // ──────────────────────────────────────────────────────────
  describe('6. Versand, Protokoll und Versand-Erkennung', () => {
    let P = ''; let rechnung: any
    it('erfolgreicher Versand: Empfänger, Format, Dokument-Prüfsumme, Verlauf; Rechnung gilt NICHT als bezahlt', async () => {
      P = await neuesProjekt('E2E Versand', {})
      rechnung = (await inv('POST', { customer_name: KUNDE, project_id: P, invoice_type: 'standard', positions: [{ bezeichnung: 'Gerüst', menge: 1, einheit: 'Pauschale', einzelpreis: 1000 }] })).j.invoice
      const r = await versende(rechnung.invoice_number, PDF_A, 'buchhaltung@kunde.invalid'); expect(r.status).toBe(200)
      const d = await q(`select * from invoice_dispatches where invoice_number=$1`, [rechnung.invoice_number])
      merke('6 Versand', 'Protokollzeile: Status/Empfänger/Format', 'versendet|buchhaltung@kunde.invalid|pdf', `${d[0]?.status}|${d[0]?.to_email}|${d[0]?.format}`)
      expect(d[0]).toMatchObject({ status: 'versendet', to_email: 'buchhaltung@kunde.invalid', format: 'pdf', invoice_id: rechnung.id, kind: 'rechnung' })
      expect(d[0].dokument_hash).toBe(await sha(PDF_A))
      expect((await q(`select count(*)::int n from email_log where invoice_number=$1 and type='rechnung'`, [rechnung.invoice_number]))[0].n).toBe(1)
      const st = (await q('select status, paid_amount from invoices where id=$1', [rechnung.id]))[0]
      merke('8 Zahlung', 'Versand allein macht die Rechnung nicht bezahlt', 'offen / 0', `${st.status} / ${Number(st.paid_amount)}`)
      expect(st.status).toBe('offen'); expect(Number(st.paid_amount)).toBe(0)
    })
    it('fehlgeschlagener Versand wird protokolliert, wiederholter Versand mit neuer Dokumentversion hat eigene Prüfsumme; Versandhistorie', async () => {
      mailErgebnis = async () => ({ error: { message: 'Mailserver nicht erreichbar' } })
      const f = await api('@/app/api/email/route', 'POST', { to: 'kunde@test.invalid', projectName: 'E2E Baustelle', type: 'rechnung', invoiceNumber: rechnung.invoice_number, pdfBase64: PDF_A, format: 'pdf' })
      merke('6 Versand', 'Fehlversand', 'nicht 200', f.status === 200 ? '200' : 'nicht 200'); expect(f.status).not.toBe(200)
      expect((await versende(rechnung.invoice_number, PDF_B)).status).toBe(200)
      const h = await api('@/app/api/invoice-dispatches/route', 'GET', undefined, '?invoice_id=' + rechnung.id)
      const status = h.j.eintraege.map((e: any) => e.status)
      merke('6 Versand', 'Versandhistorie (neueste zuerst)', 'versendet,fehlgeschlagen,versendet', status.join(',')); expect(status).toEqual(['versendet', 'fehlgeschlagen', 'versendet'])
      expect(h.j.eintraege[0].dokument_hash).toBe(await sha(PDF_B)); expect(h.j.eintraege[0].dokument_hash).not.toBe(h.j.eintraege[2].dokument_hash)
    })
    it('E-Rechnung strikt: Anhang im Browser nicht erzeugbar → nichts wird gesendet, Versuch im Protokoll', async () => {
      const vorher = (await q(`select count(*)::int n from email_log where invoice_number=$1`, [rechnung.invoice_number]))[0].n
      const r = await api('@/app/api/email/route', 'POST', { to: 'kunde@test.invalid', projectName: 'x', type: 'rechnung', invoiceNumber: rechnung.invoice_number, vorabFehler: 'XRechnung: Leitweg-ID fehlt' })
      expect(r.status).toBe(422)
      expect((await q(`select count(*)::int n from email_log where invoice_number=$1`, [rechnung.invoice_number]))[0].n).toBe(vorher)
      expect((await q(`select count(*)::int n from invoice_dispatches where invoice_number=$1 and status='fehlgeschlagen' and error like '%Leitweg%'`, [rechnung.invoice_number]))[0].n).toBe(1)
    })
    it('Versand nur in email_log (ältere Mail ohne invoice_dispatches): Rechnung gilt als versendet → nicht löschbar, Zuordnung bleibt', async () => {
      const P2 = await neuesProjekt('E2E Altversand', {})
      const a = (await aufmassRechnung(P2, 'za-alt')).j.invoice
      await q(`insert into email_log(project_id, invoice_number, type, to_email, subject) values ($1,$2,'rechnung','kunde@test.invalid','Rechnung')`, [P2, a.invoice_number])
      expect((await q('select count(*)::int n from invoice_dispatches where invoice_number=$1', [a.invoice_number]))[0].n).toBe(0)
      const del = await inv('DELETE', undefined, '?id=' + a.id)
      merke('6 Versand', 'Löschen einer nur in email_log versendeten Rechnung', 409, del.status)
      expect(del.status).toBe(409)
      expect((await zaVon(P2, 'za-alt')).rechnungId).toBe(a.id)
    })
    it('Versand nur in email_log: Storno gibt das Aufmaß NICHT frei', async () => {
      const P3 = await neuesProjekt('E2E Altversand Storno', {})
      const a = (await aufmassRechnung(P3, 'za-alt2')).j.invoice
      await q(`insert into email_log(project_id, invoice_number, type, to_email, subject) values ($1,$2,'rechnung','kunde@test.invalid','Rechnung')`, [P3, a.invoice_number])
      expect((await storno(a.id)).status).toBe(200)
      merke('6 Versand', 'Aufmaß nach Storno einer nur in email_log versendeten Rechnung', 'bleibt zugeordnet', (await zaVon(P3, 'za-alt2')).rechnungId ? 'bleibt zugeordnet' : 'freigegeben (Fehler)')
      expect((await zaVon(P3, 'za-alt2')).rechnungId).toBe(a.id)
    })
    it('Versandprotokoll ohne Rechnungs-ID (Verknüpfung fehlgeschlagen), nur mit Rechnungsnummer: gilt ebenfalls als versendet', async () => {
      const P4 = await neuesProjekt('E2E Versand ohne Id', {})
      const a = (await aufmassRechnung(P4, 'za-alt3')).j.invoice
      await q(`insert into invoice_dispatches(invoice_id, invoice_number, kind, to_email, subject, status) values (null,$1,'rechnung','k@t.invalid','R','versendet')`, [a.invoice_number])
      const del = await inv('DELETE', undefined, '?id=' + a.id)
      merke('6 Versand', 'Löschen bei Protokollzeile ohne Rechnungs-ID', 409, del.status); expect(del.status).toBe(409)
    })
  })

  // ──────────────────────────────────────────────────────────
  // 7. Storno und Gutschriften
  // ──────────────────────────────────────────────────────────
  describe('7. Storno und Gutschriften', () => {
    it('7.1/7.7 Nicht versendete Aufmaß-Rechnung löschen: Aufmaß wird frei, im Verlauf', async () => {
      const P = await neuesProjekt('E2E Loeschen', {})
      const a = (await aufmassRechnung(P, 'za-l')).j.invoice
      expect((await inv('DELETE', undefined, '?id=' + a.id)).status).toBe(200)
      merke('7 Storno', 'Aufmaß nach Löschen einer unversendeten Rechnung', 'frei', (await zaVon(P, 'za-l')).rechnungId ? 'zugeordnet' : 'frei')
      expect((await zaVon(P, 'za-l')).rechnungId).toBeUndefined()
      expect((await q(`select count(*)::int n from abrechnung_historie where project_id=$1 and aktion='aufmass_freigegeben'`, [P]))[0].n).toBe(1)
      expect((await aufmassRechnung(P, 'za-l')).status).toBe(200) // und kann neu abgerechnet werden
      expect(await integritaet(P)).toEqual([])
    })
    it('7.2–7.4/7.7 Versendete Rechnung: Storno gibt nichts frei; Teil-Gutschrift nicht; volle Gutschrift gibt das Aufmaß frei', async () => {
      const P = await neuesProjekt('E2E Gutschrift', {})
      const a = (await aufmassRechnung(P, 'za-g', 100)).j.invoice  // 100 m² × 10 = 1.000 netto
      expect((await versende(a.invoice_number)).status).toBe(200)
      const s = await storno(a.id); expect(s.status).toBe(200)
      merke('7 Storno', 'Versendete Rechnung storniert: Aufmaß', 'bleibt zugeordnet', (await zaVon(P, 'za-g')).rechnungId ? 'bleibt zugeordnet' : 'frei'); expect((await zaVon(P, 'za-g')).rechnungId).toBe(a.id)
      const doppelt = await inv('POST', { customer_name: KUNDE, project_id: P, invoice_type: 'abschlag', positions: [{ bezeichnung: 'Fassadengerüst', menge: 100, einheit: 'm²', einzelpreis: 10 }], aufmass: { za_id: 'za-g', stand: aufmassStand(normalisiereZwischenaufmasse((await projektData(P)).zwischenaufmasse)[0]) } })
      merke('7 Storno', 'Erneute Abrechnung des Aufmaßes nach Storno einer versendeten Rechnung', 409, doppelt.status); expect(doppelt.status).toBe(409)
      const g1 = await gutschrift(P, a.invoice_number, 400); expect(g1.status).toBe(200)
      merke('7 Storno', 'Teil-Gutschrift 400 von 1.000: Aufmaß', 'bleibt zugeordnet', (await zaVon(P, 'za-g')).rechnungId ? 'bleibt zugeordnet' : 'frei'); expect((await zaVon(P, 'za-g')).rechnungId).toBe(a.id)
      const g2 = await gutschrift(P, a.invoice_number, 600); expect(g2.status).toBe(200)
      merke('7 Storno', 'Volle Gutschrift (400 + 600): Aufmaß', 'frei', (await zaVon(P, 'za-g')).rechnungId ? 'zugeordnet' : 'frei'); expect((await zaVon(P, 'za-g')).rechnungId).toBeUndefined()
      const h = await q(`select details from abrechnung_historie where project_id=$1 and aktion='aufmass_freigegeben'`, [P]); expect(JSON.stringify(h[0].details)).toContain('Gutschrift')
      expect(await integritaet(P)).toEqual([])
    })
    it('7.5 Vorhaltung: versendete Rechnung storniert, volle Gutschrift gibt den Zeitraum frei, Storno der Gutschrift wird abgelehnt (409)', async () => {
      const P = await neuesProjekt('E2E Gutschrift Storno', { vorhaltung: vb() })
      const v = (await vorhaltungRechnung(P)).j.invoice
      await versende(v.invoice_number); expect((await storno(v.id)).status).toBe(200)
      const g = (await gutschrift(P, v.invoice_number, Number(v.net_amount))).j.invoice
      expect((await projektData(P)).vorhaltePerioden ?? []).toHaveLength(0)           // frei nach voller Gutschrift
      const r = await storno(g.id)
      merke('7 Storno', 'Storno der Gutschrift, die einen Vorhaltezeitraum freigab (Rechnung selbst storniert)', 409, r.status)
      expect(r.status).toBe(409); expect(r.j.code).toBe('GUTSCHRIFT_STORNO_GESPERRT')
      expect((await q('select status from invoices where id=$1', [g.id]))[0].status).not.toBe('storniert')
      expect((await projektData(P)).vorhaltePerioden ?? []).toHaveLength(0)           // Zustand unverändert
      expect(await integritaet(P)).toEqual([])
    })
    it('7.5a Aufmaß: Rechnung gültig + volle Gutschrift → frei; Storno/Löschen/Ersetzen der Gutschrift 409; Neuabrechnung nur einmal, kein Doppelbetrag', async () => {
      const P = await neuesProjekt('E2E Gutschrift Storno Aufmass', {})
      const a = (await aufmassRechnung(P, 'za-s', 100)).j.invoice                      // 1.000 netto
      expect((await versende(a.invoice_number)).status).toBe(200)
      const g = (await gutschrift(P, a.invoice_number, 1000)).j.invoice               // volle Gutschrift, Rechnung selbst NICHT storniert
      merke('7 Storno', 'Volle Gutschrift auf gültige versendete Rechnung: Aufmaß', 'frei', (await zaVon(P, 'za-s')).rechnungId ? 'zugeordnet' : 'frei'); expect((await zaVon(P, 'za-s')).rechnungId).toBeUndefined()
      const histVorher = (await q(`select count(*)::int n from abrechnung_historie where project_id=$1`, [P]))[0].n
      const s1 = await storno(g.id)
      merke('7 Storno', 'Storno der vollen Gutschrift (Aufmaß war freigegeben)', 409, s1.status); expect(s1.status).toBe(409); expect(s1.j.code).toBe('GUTSCHRIFT_STORNO_GESPERRT')
      const d1 = await inv('DELETE', undefined, '?id=' + g.id)
      merke('7 Storno', 'Löschen der vollen Gutschrift', 409, d1.status); expect(d1.status).toBe(409)
      const nv = await inv('POST', { customer_name: KUNDE, project_id: P, invoice_type: 'gutschrift', reference_invoice_number: a.invoice_number, replace_invoice_id: g.id, positions: [{ bezeichnung: 'Gutschrift', menge: 1, einheit: 'Pauschale', einzelpreis: 10 }] })
      merke('7 Storno', 'Gutschrift durch kleinere neue Version ersetzen', 409, nv.status); expect(nv.status).toBe(409)
      const gs = (await q('select status from invoices where id=$1', [g.id]))[0].status; expect(gs).not.toBe('storniert')
      // jeder abgelehnte Versuch steht mit Benutzer-/Zeitbezug im Verlauf
      const abgel = await q(`select user_id, created_at, grund, details from abrechnung_historie where project_id=$1 and details->>'abgelehnt'='GUTSCHRIFT_STORNO_GESPERRT' order by created_at`, [P])
      merke('7 Storno', 'Abgelehnte Versuche im Verlauf (Storno, Löschen)', 2, abgel.length); expect(abgel.length).toBe(2); expect(abgel[0].user_id).toBe(USER); expect(abgel[0].created_at).toBeTruthy(); expect(abgel[0].grund).toMatch(/abgelehnt/)
      expect((await q(`select count(*)::int n from abrechnung_historie where project_id=$1`, [P]))[0].n).toBe(histVorher + 2)
      // Neuabrechnung: einmal möglich (Gutschrift hat die Leistung aufgehoben), ein zweites Mal nicht
      const neu = await aufmassRechnung(P, 'za-s', 100); expect(neu.status).toBe(200)
      const noch = await aufmassRechnung(P, 'za-s', 100).catch(() => ({ status: 0 }))
      merke('7 Storno', 'Zweite Neuabrechnung desselben Aufmaßes', 'abgelehnt (4xx)', noch.status >= 400 || noch.status === 0 ? 'abgelehnt (4xx)' : `angenommen (${noch.status})`); expect([409, 0, 400]).toContain(noch.status)
      const gueltig = (await rechnungen(P)).filter((r: any) => r.status !== 'storniert')
      merke('7 Storno', 'Summe netto aller gültigen Belege (1.000 − 1.000 + 1.000)', 1000, netto(gueltig)); expect(netto(gueltig)).toBe(1000)
      expect(await integritaet(P)).toEqual([])
    })
    it('7.5b Teilgutschrift und Storno: Teilgutschrift ohne Freigabe bleibt stornierbar; auslösende Gutschriften sind gesperrt', async () => {
      const P = await neuesProjekt('E2E Teilgutschrift Storno', {})
      const a = (await aufmassRechnung(P, 'za-t', 100)).j.invoice
      await versende(a.invoice_number)
      const g1 = (await gutschrift(P, a.invoice_number, 400)).j.invoice
      expect((await zaVon(P, 'za-t')).rechnungId).toBe(a.id)
      const sT = await storno(g1.id)
      merke('7 Storno', 'Storno einer Teilgutschrift (400 von 1.000, keine Freigabe)', 200, sT.status); expect(sT.status).toBe(200)
      expect((await zaVon(P, 'za-t')).rechnungId).toBe(a.id)                               // bleibt zugeordnet
      const g2 = (await gutschrift(P, a.invoice_number, 400)).j.invoice
      const g3 = (await gutschrift(P, a.invoice_number, 600)).j.invoice                    // 400 + 600 → voll → frei
      expect((await zaVon(P, 'za-t')).rechnungId).toBeUndefined()
      const s3 = await storno(g3.id); merke('7 Storno', 'Storno der auslösenden Gutschrift (600)', 409, s3.status); expect(s3.status).toBe(409)
      const s2 = await storno(g2.id); merke('7 Storno', 'Storno der Teilgutschrift (400), ohne die die Deckung entfiele', 409, s2.status); expect(s2.status).toBe(409)
      expect((await zaVon(P, 'za-t')).rechnungId).toBeUndefined()
      expect(await integritaet(P)).toEqual([])
    })
    it('7.6 Vorhaltezeitraum: unversendete Rechnung löschen → frei; versendete + volle Gutschrift → frei', async () => {
      const P = await neuesProjekt('E2E Vorhalt Freigabe', { vorhaltung: vb() })
      const v1 = (await vorhaltungRechnung(P)).j.invoice
      expect((await inv('DELETE', undefined, '?id=' + v1.id)).status).toBe(200)
      expect((await projektData(P)).vorhaltePerioden ?? []).toHaveLength(0)
      const v2 = (await vorhaltungRechnung(P)).j.invoice
      await versende(v2.invoice_number)
      expect((await inv('DELETE', undefined, '?id=' + v2.id)).status).toBe(409)
      expect((await storno(v2.id)).status).toBe(200); expect((await projektData(P)).vorhaltePerioden).toHaveLength(1)
      await gutschrift(P, v2.invoice_number, Number(v2.net_amount)); expect((await projektData(P)).vorhaltePerioden ?? []).toHaveLength(0)
      expect(await integritaet(P)).toEqual([])
    })
    it('5.4/5.6 Auftragsstand mit Gutschrift: Rest steigt (Auftragswert, abgerechnet, offen sind getrennte Kennzahlen)', async () => {
      const { berechneAuftragsstand } = await import('@/lib/auftragsstand')
      const P = await neuesProjekt('E2E Stand', { kiResult: { suggestedPrice: 5000 }, preisModus: 'pauschale', pauschale: '5000' })
      const a = (await inv('POST', { customer_name: KUNDE, project_id: P, invoice_type: 'abschlag', positions: [{ bezeichnung: 'Abschlag 1', menge: 1, einheit: 'Pauschale', einzelpreis: 3000 }] })).j.invoice
      const stand = async () => berechneAuftragsstand({ angebotNetto: 5000, nachtraege: [], rechnungen: norm(await rechnungen(P)) as any })
      expect((await stand()).restZuAbrechnen).toBe(2000)
      await gutschrift(P, a.invoice_number, 1000)
      const nach = await stand()
      merke('5 Schluss', 'Rest zu abrechnen nach Gutschrift 1.000 auf Abschlag 3.000', 3000, nach.restZuAbrechnen)
      expect(nach.restZuAbrechnen).toBe(3000); expect(nach.auftragswert).toBe(5000); expect(nach.abgerechnet).toBe(2000)
    })
    it('OFFEN-2: offener Forderungsbetrag = Rechnung − Zahlung − Gutschriften (SQL unabhängig gerechnet; alle Anzeigen gleich)', async () => {
      const { berechneAuftragsstand } = await import('@/lib/auftragsstand')
      const { kontrolleBaustelle } = await import('@/lib/abrechnung-pruefung')
      const { berechneKennzahlen } = await import('@/lib/faktura-kennzahlen')
      const P = await neuesProjekt('E2E Offen', { kiResult: { suggestedPrice: 5000 }, preisModus: 'pauschale', pauschale: '5000' })
      const a = (await inv('POST', { customer_name: KUNDE, project_id: P, invoice_type: 'abschlag', positions: [{ bezeichnung: 'Abschlag 1', menge: 1, einheit: 'Pauschale', einzelpreis: 3000 }] })).j.invoice
      expect(Number(a.gross_amount)).toBe(3570)
      const alle = async () => norm(await rechnungen(P)) as any[]
      const sqlOffen = async () => Number((await q(`select coalesce(sum(case when invoice_type='gutschrift' then gross_amount else gross_amount - least(greatest(paid_amount,0), gross_amount) end),0) as offen from invoices where project_id=$1 and status<>'storniert'`, [P]))[0].offen)
      const zentral = async () => {
        const r = await alle()
        const st = berechneAuftragsstand({ angebotNetto: 5000, nachtraege: [], rechnungen: r }).offenBrutto
        const ko = kontrolleBaustelle({ angebotNetto: 5000, nachtraegeBestaetigt: 0, nachtraegeAngefragt: 0, rechnungen: r }).offenBrutto
        const kz = berechneKennzahlen(r, [], HEUTE).offenBetrag
        expect([ko, kz]).toEqual([st, st])                                              // überall derselbe Wert
        return st
      }
      const pruefe = async (fall: string, erwartet: number) => { const ist = await zentral(); const sql = await sqlOffen(); merke('5 Schluss', `Offen brutto: ${fall}`, erwartet, ist); merke('5 Schluss', `Offen brutto (unabhängige SQL-Summe): ${fall}`, erwartet, sql); expect(ist).toBe(erwartet); expect(Math.round(sql * 100) / 100).toBe(erwartet) }
      await pruefe('Rechnung 3.570, keine Gutschrift', 3570)
      const g1 = (await gutschrift(P, a.invoice_number, 1000)).j.invoice            // −1.190
      await pruefe('Gutschrift 1.190 (Beispiel des Prüfers)', 2380)
      expect((await inv('PATCH', { id: a.id, paid_amount: 500 })).status).toBe(200)
      await pruefe('zusätzlich Teilzahlung 500', 1880)
      const g2 = (await gutschrift(P, a.invoice_number, 500)).j.invoice             // −595
      await pruefe('zweite Gutschrift 595 (mehrere Gutschriften)', 1285)
      expect((await storno(g2.id)).status).toBe(200)
      await pruefe('zweite Gutschrift storniert (wird nicht mehr abgezogen)', 1880)
      expect(g1.id).toBeTruthy()
    })
    it('OFFEN-2: Kundenebene, mehrere Baustellen, mehrere Kunden, ungeklärte Gutschrift – alle Anzeigen identisch zur zentralen Berechnung und zu unabhängigem SQL', async () => {
      const { berechneForderung } = await import('@/lib/forderung')
      const { berechneAuftragsstand } = await import('@/lib/auftragsstand')
      const { kontrolleBaustelle } = await import('@/lib/abrechnung-pruefung')
      const { berechneKennzahlen, offenJeRechnung } = await import('@/lib/faktura-kennzahlen')
      const kunde = (await q(`insert into customers(name,email) values ('Mehrbaustellen E2E','mb@test.invalid') returning id`))[0].id
      const bau = async (name: string) => { const id = (await q(`insert into projects(name,adresse,status,data,customer_id) values ($1,'Teststr. 2','active','{}',$2) returning id`, [name, kunde]))[0].id; await q(`insert into project_events(project_id,type,pruefung_details) values ($1,'pruefung_freigabe','{"freigegeben":true}')`, [id]).catch(() => {}); return id }
      const P1 = await bau('E2E MB 1'); const P2 = await bau('E2E MB 2')
      const re = async (P: string, preis: number) => (await inv('POST', { customer_name: KUNDE, project_id: P, invoice_type: 'standard', positions: [{ bezeichnung: 'Gerüst', menge: 1, einheit: 'Pauschale', einzelpreis: preis }] })).j.invoice
      const a1 = await re(P1, 1000), a2 = await re(P2, 2000), a3 = await re(P2, 500)     // brutto 1.190 / 2.380 / 595
      expect((await gutschrift(P1, a1.invoice_number, 200)).status).toBe(200)           // −238
      expect((await inv('PATCH', { id: a2.id, paid_amount: 1000 })).status).toBe(200)
      expect((await storno(a3.id)).status).toBe(200)                                     // storniert: zählt nicht
      // ungeklärte Gutschrift: ohne Bezug auf eine Rechnung der Baustelle (Bezugsnummer existiert nicht)
      expect((await gutschrift(P2, 'RE-GIBT-ES-NICHT', 100)).status).toBeLessThan(500)
      const r1 = norm(await rechnungen(P1)) as any[], r2 = norm(await rechnungen(P2)) as any[]; const kundeAlle = [...r1, ...r2]
      const sqlOffen = async (ids: string[]) => Number((await q(`select coalesce(sum(case when invoice_type='gutschrift' then 0 else gross_amount - least(greatest(paid_amount,0), gross_amount) end),0) - coalesce(sum(case when invoice_type='gutschrift' and reference_invoice_number in (select invoice_number from invoices where project_id = any($1) and status<>'storniert' and invoice_type<>'gutschrift') then -gross_amount else 0 end),0) as o from invoices where project_id = any($1) and status<>'storniert'`, [ids]))[0].o)
      const erw1 = 952, erw2 = 1380, erwKunde = 2332                                   // 1.190−238 | 2.380−1.000 | Summe
      const f1 = berechneForderung(r1), f2 = berechneForderung(r2), fk = berechneForderung(kundeAlle)
      merke('5 Schluss', 'Baustelle 1: Rechnung 1.190 − Gutschrift 238', erw1, f1.offen); merke('5 Schluss', 'Baustelle 2: 2.380 − Teilzahlung 1.000 (stornierte Rechnung zählt nicht)', erw2, f2.offen); merke('5 Schluss', 'Kundenebene (beide Baustellen)', erwKunde, fk.offen)
      expect([f1.offen, f2.offen, fk.offen]).toEqual([erw1, erw2, erwKunde])
      expect(Math.round((await sqlOffen([P1])) * 100) / 100).toBe(erw1); expect(Math.round((await sqlOffen([P2])) * 100) / 100).toBe(erw2); expect(Math.round((await sqlOffen([P1, P2])) * 100) / 100).toBe(erwKunde)
      // ungeklärte Gutschrift wird ausgewiesen und niemandem zugerechnet
      merke('5 Schluss', 'Ungeklärte Gutschrift (119) separat, mindert nichts', 119, f2.ungeklaert); expect(f2.ungeklaert).toBe(119); expect(fk.ungeklaert).toBe(119)
      // alle Anzeigen: Auftragsstand, Kontrolle, Faktura-Kennzahlen (alle Kunden zusammen, inkl. Fremdbestand), je-Rechnung-Summe
      const stand = (r: any[]) => berechneAuftragsstand({ angebotNetto: 0, nachtraege: [], rechnungen: r }).offenBrutto
      const ko = (r: any[]) => kontrolleBaustelle({ angebotNetto: 0, nachtraegeBestaetigt: 0, nachtraegeAngefragt: 0, rechnungen: r }).offenBrutto
      expect([stand(r1), ko(r1)]).toEqual([erw1, erw1]); expect([stand(r2), ko(r2)]).toEqual([erw2, erw2]); expect([stand(kundeAlle), ko(kundeAlle)]).toEqual([erwKunde, erwKunde])
      expect(berechneKennzahlen(kundeAlle, [], HEUTE).offenBetrag).toBe(erwKunde)
      expect(Math.round([...offenJeRechnung(kundeAlle).values()].reduce((x, y) => x + y, 0) * 100) / 100).toBe(erwKunde)
      // zweiter Kunde (Mehrere Kunden): Fremdbestand verändert die Werte des ersten Kunden nicht
      const P3 = await neuesProjekt('E2E MB Fremd', {}); await re(P3, 300)
      const fremd = norm(await rechnungen(P3)) as any[]
      expect(berechneForderung([...kundeAlle, ...fremd]).offen).toBe(erwKunde + 357); expect(berechneForderung(kundeAlle).offen).toBe(erwKunde)
    })
    it('OFFEN-2: Gutschrift zu stornierter Rechnung wird nicht doppelt verrechnet; Überhang ist Guthaben, mindert keine andere Rechnung', async () => {
      const { berechneAuftragsstand } = await import('@/lib/auftragsstand')
      const P = await neuesProjekt('E2E Offen Doppelt', {})
      const a = (await aufmassRechnung(P, 'za-o', 100)).j.invoice                    // 1.190 brutto
      await versende(a.invoice_number); expect((await storno(a.id)).status).toBe(200)
      await gutschrift(P, a.invoice_number, 1000)
      const off = (r: any[]) => berechneAuftragsstand({ angebotNetto: 0, nachtraege: [], rechnungen: norm(r) as any }).offenBrutto
      merke('5 Schluss', 'Stornierte Rechnung + Gutschrift dazu: offen', 0, off(await rechnungen(P))); expect(off(await rechnungen(P))).toBe(0)
      // bezahlte Rechnung + Gutschrift: nichts offen, die zweite offene Rechnung bleibt unberührt
      const P2 = await neuesProjekt('E2E Offen Guthaben', {})
      const r1 = (await inv('POST', { customer_name: KUNDE, project_id: P2, invoice_type: 'standard', positions: [{ bezeichnung: 'A', menge: 1, einheit: 'Pauschale', einzelpreis: 1000 }] })).j.invoice
      const r2 = (await inv('POST', { customer_name: KUNDE, project_id: P2, invoice_type: 'standard', positions: [{ bezeichnung: 'B', menge: 1, einheit: 'Pauschale', einzelpreis: 500 }] })).j.invoice
      expect((await inv('PATCH', { id: r1.id, status: 'bezahlt' })).status).toBe(200)
      await gutschrift(P2, r1.invoice_number, 500)                                      // 595 auf bereits bezahlte Rechnung
      const o2 = off(await rechnungen(P2)); merke('5 Schluss', 'Gutschrift auf bezahlte Rechnung mindert die andere offene Rechnung nicht (offen = 595)', 595, o2); expect(o2).toBe(595)
      expect(r2.id).toBeTruthy()
    })
  })

  // ──────────────────────────────────────────────────────────
  // 8. Zahlungseingänge
  // ──────────────────────────────────────────────────────────
  describe('8. Zahlungseingänge', () => {
    let P = ''; let r1: any
    it('Teilzahlung, mehrere Teilzahlungen, volle Zahlung, Überzahlung', async () => {
      P = await neuesProjekt('E2E Zahlung', {})
      r1 = (await inv('POST', { customer_name: KUNDE, project_id: P, invoice_type: 'standard', positions: [{ bezeichnung: 'Gerüst', menge: 1, einheit: 'Pauschale', einzelpreis: 1000 }] })).j.invoice
      expect(Number(r1.gross_amount)).toBe(1190)
      const zeile = async () => (await q('select status, paid_amount from invoices where id=$1', [r1.id]))[0]
      expect((await inv('PATCH', { id: r1.id, paid_amount: 500 })).status).toBe(200)
      let z = await zeile(); merke('8 Zahlung', 'Teilzahlung 500 von 1.190: Status/offen', 'offen / 690', `${z.status} / ${Math.round((1190 - Number(z.paid_amount)) * 100) / 100}`); expect(z.status).toBe('offen')
      expect((await inv('PATCH', { id: r1.id, paid_amount: 900 })).status).toBe(200)
      z = await zeile(); merke('8 Zahlung', 'Zweite Teilzahlung (gesamt 900): offen', 290, Math.round((1190 - Number(z.paid_amount)) * 100) / 100); expect(z.status).toBe('offen')
      const ueber = await inv('PATCH', { id: r1.id, paid_amount: 1300 })
      merke('8 Zahlung', 'Überzahlung (1.300 auf 1.190)', 400, ueber.status); expect(ueber.status).toBe(400)
      expect(Number((await zeile()).paid_amount)).toBe(900)
      expect((await inv('PATCH', { id: r1.id, status: 'bezahlt' })).status).toBe(200)
      z = await zeile(); merke('8 Zahlung', 'Voll bezahlt: Status/bezahlt', 'bezahlt / 1190', `${z.status} / ${Number(z.paid_amount)}`); expect(z.status).toBe('bezahlt'); expect(Number(z.paid_amount)).toBe(1190)
    })
    it('OFFEN-3: Zahlung auf stornierte Rechnung wird mit 409 abgelehnt; vorhandene Zahlung und Status bleiben unverändert', async () => {
      const r2 = (await inv('POST', { customer_name: KUNDE, project_id: P, invoice_type: 'standard', positions: [{ bezeichnung: 'Gerüst 2', menge: 1, einheit: 'Pauschale', einzelpreis: 500 }] })).j.invoice
      const zahl = (body: unknown) => api('@/app/api/invoice-payments/route', 'POST', body)
      // 1./2. Zahlung und Teilzahlung auf offene Rechnung
      const z1 = await zahl({ invoice_id: r2.id, amount: 200, payment_date: HEUTE }); merke('8 Zahlung', 'Zahlung 200 auf offene Rechnung', 200, z1.status); expect(z1.status).toBe(200)
      const z2 = await inv('PATCH', { id: r2.id, paid_amount: 300 }); merke('8 Zahlung', 'Teilzahlung (gesamt 300) über PATCH', 200, z2.status); expect(z2.status).toBe(200)
      expect((await storno(r2.id)).status).toBe(200)
      const vorher = (await q('select status, paid_amount, updated_at from invoices where id=$1', [r2.id]))[0]
      const nZahlungen = (await q('select count(*)::int n from invoice_payments where invoice_id=$1', [r2.id]))[0].n
      const nHist = (await q('select count(*)::int n from abrechnung_historie where invoice_id=$1', [r2.id]))[0].n
      // 3. Zahlung auf stornierte Rechnung: alle Wege → 409
      const a1 = await zahl({ invoice_id: r2.id, amount: 100, payment_date: HEUTE })
      const a2 = await inv('PATCH', { id: r2.id, paid_amount: 450 })
      const a3 = await inv('PATCH', { id: r2.id, status: 'bezahlt' })
      merke('8 Zahlung', 'Zahlung (invoice-payments) auf stornierte Rechnung', 409, a1.status)
      merke('8 Zahlung', 'paid_amount-Änderung auf stornierte Rechnung', 409, a2.status)
      merke('8 Zahlung', 'Status „bezahlt“ auf stornierter Rechnung', 409, a3.status)
      expect([a1.status, a2.status, a3.status]).toEqual([409, 409, 409]); expect(a1.j.code).toBe('ZAHLUNG_AUF_STORNIERT'); expect(a2.j.code).toBe('ZAHLUNG_AUF_STORNIERT')
      // 4./5. Vorhandene Zahlung bleibt, kein Statuswechsel, keine neue Buchung
      const nachher = (await q('select status, paid_amount, updated_at from invoices where id=$1', [r2.id]))[0]
      merke('8 Zahlung', 'Bezahlter Betrag/Status nach abgelehnten Buchungen', `${Number(vorher.paid_amount)} / ${vorher.status}`, `${Number(nachher.paid_amount)} / ${nachher.status}`)
      expect(Number(nachher.paid_amount)).toBe(300); expect(nachher.status).toBe('storniert'); expect(String(nachher.updated_at)).toBe(String(vorher.updated_at))
      expect((await q('select count(*)::int n from invoice_payments where invoice_id=$1', [r2.id]))[0].n).toBe(nZahlungen)
      expect((await q('select count(*)::int n from abrechnung_historie where invoice_id=$1', [r2.id]))[0].n).toBe(nHist)
    })
  })

  // ──────────────────────────────────────────────────────────
  // 8b. Rechnungsstatus, Gutschriften ohne Baustelle, Mahnwesen (Härtungsrunde)
  // ──────────────────────────────────────────────────────────
  describe('8b. Status nach Zahlung und Gutschrift (serverseitig), Rechnungen ohne Baustelle, Mahnwesen', () => {
    const zahle = (invoice_id: string, amount: number) => api('@/app/api/invoice-payments/route', 'POST', { invoice_id, amount, payment_date: HEUTE })
    const zeile = async (id: string) => (await q('select status, paid_amount from invoices where id=$1', [id]))[0]
    const re = async (P: string | null, preis: number) => (await inv('POST', { customer_name: KUNDE, ...(P ? { project_id: P } : {}), invoice_type: 'standard', positions: [{ bezeichnung: 'Gerüst', menge: 1, einheit: 'Pauschale', einzelpreis: preis }] })).j.invoice
    const gs = async (P: string | null, bezug: string, preis: number) => (await inv('POST', { customer_name: KUNDE, ...(P ? { project_id: P } : {}), invoice_type: 'gutschrift', reference_invoice_number: bezug, positions: [{ bezeichnung: 'Gutschrift zu ' + bezug, menge: 1, einheit: 'Pauschale', einzelpreis: preis }] })).j.invoice
    const stand = async (ids: string[]) => { const { statusJe, berechneForderung } = await import('@/lib/forderung'); const r = norm(await q('select * from invoices where id = any($1)', [ids])) as any[]; return { st: statusJe(r, HEUTE), f: berechneForderung(r) } }

    it('Rechnung 3.570, Gutschrift 1.190, Zahlung 2.380 → offen 0, Status bezahlt (Zahlung 2.380, Gutschrift keine Zahlung); Überzahlung wird abgelehnt', async () => {
      const P = await neuesProjekt('E2E Status 1', {})
      const a = await re(P, 3000); const g = await gs(P, a.invoice_number, 1000)
      expect((await q('select count(*)::int n from invoice_payments where invoice_id = any($1)', [[a.id, g.id]]))[0].n).toBe(0)   // Gutschrift ist keine Zahlung
      expect(Number((await zeile(a.id)).paid_amount)).toBe(0)
      const zu = await zahle(a.id, 2400); merke('8 Zahlung', 'Zahlung 2.400 bei offen 2.380 (nach Gutschrift)', 400, zu.status); expect(zu.status).toBe(400)
      const ok = await zahle(a.id, 2380); expect(ok.status).toBe(200); expect(ok.j.vollstaendig_bezahlt).toBe(true)
      const z = await zeile(a.id); merke('8 Zahlung', 'Status/bezahlt nach Gutschrift 1.190 + Zahlung 2.380', 'bezahlt / 2380', `${z.status} / ${Number(z.paid_amount)}`); expect(z.status).toBe('bezahlt'); expect(Number(z.paid_amount)).toBe(2380)
      const s = await stand([a.id, g.id]); merke('8 Zahlung', 'Offen / Guthaben / Anzeigestatus', '0 / 0 / ausgeglichen', `${s.f.offen} / ${s.f.guthaben} / ${s.st.get(a.id)}`)
      expect([s.f.offen, s.f.guthaben, s.st.get(a.id), s.f.bezahlt]).toEqual([0, 0, 'ausgeglichen', 2380])
      expect((await q('select count(*)::int n from invoice_payments where invoice_id=$1', [a.id]))[0].n).toBe(1)                  // Zahlungshistorie unverändert
    })
    it('Zahlung zuerst, Gutschrift danach: Status wird nach der Gutschrift abgeglichen; Storno der Gutschrift setzt ihn zurück', async () => {
      const P = await neuesProjekt('E2E Status 2', {})
      const a = await re(P, 3000)
      expect((await zahle(a.id, 2380)).status).toBe(200); expect((await zeile(a.id)).status).toBe('offen')
      const g = await gs(P, a.invoice_number, 1000)                                       // deckt den Rest
      let z = await zeile(a.id); merke('8 Zahlung', 'Zahlung 2.380, danach Gutschrift 1.190: gespeicherter Status', 'bezahlt', z.status); expect(z.status).toBe('bezahlt')
      expect((await q(`select count(*)::int n from abrechnung_historie where invoice_id=$1 and aktion='status_geaendert'`, [a.id]))[0].n).toBeGreaterThanOrEqual(1)
      expect((await storno(g.id)).status).toBe(200)                                       // Teilgutschrift ohne Freigabe: stornierbar
      z = await zeile(a.id); merke('8 Zahlung', 'Gutschrift storniert: Status/offen', 'offen / 1190', `${z.status} / ${(await stand([a.id])).f.offen}`)
      expect(z.status).toBe('offen'); expect(Number(z.paid_amount)).toBe(2380)           // Zahlung bleibt unangetastet
      expect((await stand([a.id])).f.offen).toBe(1190)
    })
    it('vollständig nur durch Gutschrift: gespeicherter Status bleibt offen (keine Zahlung), Anzeige „ausgeglichen“, kein Mahnen', async () => {
      const P = await neuesProjekt('E2E Status 3', {})
      const a = await re(P, 1000)
      await q('update invoices set due_date = $2 where id=$1', [a.id, plusTage(HEUTE, -40)])
      const g = await gs(P, a.invoice_number, 1000)
      const z = await zeile(a.id); expect(z.status).toBe('offen'); expect(Number(z.paid_amount)).toBe(0)
      const s = await stand([a.id, g.id]); expect([s.f.offen, s.st.get(a.id)]).toEqual([0, 'ausgeglichen'])
      const { sendeMahnschritt } = await import('@/lib/mahnung-versand')
      const m = await sendeMahnschritt(a.id, 1, { pauschale: 0, zinssatz: 0 })
      merke('8 Zahlung', 'Mahnung für durch Gutschrift ausgeglichene, überfällige Rechnung', 'abgelehnt (nichts offen)', m.ok ? 'GEMAHNT' : (m as any).nichtsOffen ? 'abgelehnt (nichts offen)' : (m as any).error)
      expect(m.ok).toBe(false); expect((m as any).nichtsOffen).toBe(true)
      expect((await q('select reminder_level from invoices where id=$1', [a.id]))[0].reminder_level).toBe(0)
    })
    it('Gutschrift auf bereits bezahlte Rechnung: Status bleibt bezahlt, Guthaben statt Verrechnung; Teilgutschrift mindert offene Nachbarrechnung nicht', async () => {
      const P = await neuesProjekt('E2E Status 4', {})
      const a = await re(P, 1000); const b = await re(P, 500)
      expect((await inv('PATCH', { id: a.id, status: 'bezahlt' })).status).toBe(200)
      const g = await gs(P, a.invoice_number, 500)
      const s = await stand([a.id, b.id, g.id])
      merke('8 Zahlung', 'Gutschrift 595 auf bezahlte Rechnung: Guthaben / offen (Nachbarrechnung 595)', '595 / 595', `${s.f.guthaben} / ${s.f.offen}`)
      expect([s.f.guthaben, s.f.offen, s.st.get(a.id)]).toEqual([595, 595, 'bezahlt']); expect((await zeile(a.id)).status).toBe('bezahlt')
    })
    it('Rechnung OHNE Baustelle: Gutschrift (mit und ohne Baustelle) wird per Bezugsnummer berücksichtigt – Zahlung, Limit und Status wie mit Baustelle', async () => {
      const a = await re(null, 3000)                                                      // keine Baustelle
      expect((await q('select project_id from invoices where id=$1', [a.id]))[0].project_id).toBeNull()
      const P = await neuesProjekt('E2E Status 5 (Gutschrift auf anderer Baustelle)', {})
      const g = await gs(null, a.invoice_number, 1000)                                    // ebenfalls ohne Baustelle
      const zu = await zahle(a.id, 3000); merke('8 Zahlung', 'Rechnung ohne Baustelle: Zahlung 3.000 bei offen 2.380', 400, zu.status); expect(zu.status).toBe(400)
      expect((await zahle(a.id, 2380)).status).toBe(200); expect((await zeile(a.id)).status).toBe('bezahlt')
      const s = await stand([a.id, g.id]); expect([s.f.offen, s.st.get(a.id)]).toEqual([0, 'ausgeglichen']); void P
      // Gutschrift ohne Rechnungsbezug: bleibt ungeklärt, verändert keine Rechnung/keinen Status
      const b = await re(null, 1000); const ohne = await gs(null, 'RE-GIBT-ES-NICHT', 500)
      const s2 = await stand([b.id, ohne.id]); expect([s2.f.offen, s2.f.ungeklaert, s2.st.get(b.id)]).toEqual([1190, 595, 'offen'])
      expect((await zeile(b.id)).status).toBe('offen')
    })
    it('PATCH „als bezahlt“ bei vorhandener Gutschrift bucht nur den tatsächlich noch geschuldeten Rest', async () => {
      const P = await neuesProjekt('E2E Status 6', {})
      const a = await re(P, 3000); await gs(P, a.invoice_number, 1000)
      expect((await inv('PATCH', { id: a.id, status: 'bezahlt', paid_amount: 3570 })).status).toBe(200)   // wie der Knopf „Als bezahlt“ (sendet den Rechnungsbetrag)
      const z = await zeile(a.id); merke('8 Zahlung', '„Als bezahlt“ bei Gutschrift 1.190 auf 3.570', 'bezahlt / 2380', `${z.status} / ${Number(z.paid_amount)}`); expect([z.status, Number(z.paid_amount)]).toEqual(['bezahlt', 2380])
      const s = await stand([a.id]); expect(s.f.guthaben).toBe(0)
    })
    it('Zahlung löschen (Korrektur): Status folgt der zentralen Forderung, Gutschrift bleibt', async () => {
      const P = await neuesProjekt('E2E Status 7', {})
      const a = await re(P, 3000); const g7 = await gs(P, a.invoice_number, 1000)
      expect((await zahle(a.id, 2380)).status).toBe(200); expect((await zeile(a.id)).status).toBe('bezahlt')
      const pay = (await q('select id from invoice_payments where invoice_id=$1', [a.id]))[0].id
      expect((await api('@/app/api/invoice-payments/route', 'DELETE', undefined, '?id=' + pay)).status).toBe(200)
      const z = await zeile(a.id); expect([z.status, Number(z.paid_amount)]).toEqual(['offen', 0])
      expect((await stand([a.id, g7.id])).f.offen).toBe(2380)
    })
    it('Zahlung und Gutschrift gleichzeitig (echte parallele Transaktionen): Endzustand konsistent, nichts doppelt, Status stimmt', async () => {
      for (let lauf = 1; lauf <= 4; lauf++) {
        const P = await neuesProjekt('E2E Status Parallel ' + lauf, {})
        const a = await re(P, 1000)                                                       // 1.190
        const [z, g] = await Promise.all([zahle(a.id, 595), gs(P, a.invoice_number, 500)]) // 595 Zahlung + 595 Gutschrift = 1.190
        expect(z.status).toBe(200)
        const zl = await zeile(a.id); const s = await stand([a.id, ...(await q(`select id from invoices where project_id=$1 and invoice_type='gutschrift'`, [P])).map((r: any) => r.id)])
        merke('9 Parallel', `Zahlung 595 ‖ Gutschrift 595 (Lauf ${lauf}): offen / Status / Zahlung`, '0 / bezahlt / 595', `${s.f.offen} / ${zl.status} / ${Number(zl.paid_amount)}`)
        expect([s.f.offen, zl.status, Number(zl.paid_amount), s.f.guthaben]).toEqual([0, 'bezahlt', 595, 0]); void g
        expect((await q('select count(*)::int n from invoice_payments where invoice_id=$1', [a.id]))[0].n).toBe(1)
      }
    })
  })

  // ──────────────────────────────────────────────────────────
  // 8c. Integrity Audit: Datenlimit, abgeleiteter Status in Auswertungen, atomare Buchung, Wiederholung, Storno ‖ Buchung
  // ──────────────────────────────────────────────────────────
  describe('8c. Integrity Audit (Phase 129)', () => {
    const apiH = async (modul: string, methode: 'POST' | 'PATCH' | 'DELETE', body: unknown, headers: Record<string, string> = {}, query = '') => {
      const m = await import(modul)
      const res = await m[methode](new NextRequest('http://x/api' + query, { method: methode, headers, body: body === undefined ? undefined : JSON.stringify(body) }) as never)
      const text = await res.text(); let j: any = null; try { j = JSON.parse(text) } catch { /* leer */ }
      return { status: res.status, j, replay: res.headers.get('Idempotent-Replay') }
    }
    const zahle = (invoice_id: string, amount: number, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) => apiH('@/app/api/invoice-payments/route', 'POST', { invoice_id, amount, payment_date: HEUTE, ...extra }, headers)
    const zeile = async (id: string) => (await q('select status, paid_amount from invoices where id=$1', [id]))[0]
    const re = async (P: string | null, preis: number) => (await inv('POST', { customer_name: KUNDE, ...(P ? { project_id: P } : {}), invoice_type: 'standard', positions: [{ bezeichnung: 'Gerüst', menge: 1, einheit: 'Pauschale', einzelpreis: preis }] })).j.invoice
    const gsBody = (P: string | null, bezug: string, preis: number) => ({ customer_name: KUNDE, ...(P ? { project_id: P } : {}), invoice_type: 'gutschrift', reference_invoice_number: bezug, positions: [{ bezeichnung: 'Gutschrift zu ' + bezug, menge: 1, einheit: 'Pauschale', einzelpreis: preis }] })
    const gs = async (P: string | null, bezug: string, preis: number) => (await inv('POST', gsBody(P, bezug, preis))).j.invoice
    const stand = async (ids: string[]) => { const { statusJe, berechneForderung } = await import('@/lib/forderung'); const r = norm(await q('select * from invoices where id = any($1)', [ids])) as any[]; return { st: statusJe(r, HEUTE), f: berechneForderung(r) } }
    const anzahlZahlungen = async (id: string) => (await q('select count(*)::int n from invoice_payments where invoice_id=$1', [id]))[0].n
    const summeZahlungen = async (id: string) => Number((await q('select coalesce(sum(amount),0) s from invoice_payments where invoice_id=$1', [id]))[0].s)

    it('mehr als 3.000 Rechnungen: Liste vollständig, Gutschrift der neuen Rechnung bleibt zugeordnet (sehr alt / ohne Baustelle), Beträge stimmen', async () => {
      const P = await neuesProjekt('E2E Masse', {})
      const a = await re(P, 1000)                                                              // 1.190, in Baustelle
      const b = await re(null, 1000)                                                           // 1.190, ohne Baustelle
      const ga = await gs(null, a.invoice_number, 500)                                         // Gutschrift OHNE Baustelle zur Rechnung IN der Baustelle
      const gb = await gs(null, b.invoice_number, 1000)                                        // Gutschrift zur Rechnung ohne Baustelle
      await q(`update invoices set created_at = now() - interval '5 years' where id = any($1)`, [[ga.id, gb.id]])   // älter als 3.500 Füllrechnungen → fiel früher aus der Liste (limit 3000)
      try {
        await q(`insert into invoices (invoice_number, customer_name, net_amount, gross_amount, status, invoice_date, created_at)
                 select 'MASSE-' || g, 'Masse GmbH', 100, 119, 'bezahlt', current_date, now() - (g || ' seconds')::interval from generate_series(1, 3500) g`)
        const alle = await inv_get('')
        merke('9 Limit', 'Rechnungsliste bei > 3.000 Rechnungen: Anzahl ≥ 3.504', 'ja', alle.j.invoices?.length >= 3504 ? 'ja' : 'nein')
        expect(alle.status).toBe(200); expect(alle.j.invoices.length).toBeGreaterThanOrEqual(3504)
        expect(alle.j.invoices.some((x: any) => x.id === ga.id) && alle.j.invoices.some((x: any) => x.id === gb.id)).toBe(true)
        const { berechneForderung } = await import('@/lib/forderung')
        const f = berechneForderung(norm(alle.j.invoices.filter((x: any) => [a.id, b.id, ga.id, gb.id].includes(x.id))) as any)
        merke('9 Limit', 'Offen nach Gutschriften (alte Gutschriften, > 3.000 Datensätze)', '595 / 0', `${f.je.get(a.id)} / ${f.je.get(b.id)}`)
        expect([f.je.get(a.id), f.je.get(b.id)]).toEqual([595, 0])
        // Baustellenansicht: die Gutschrift ohne Baustelle wird serverseitig ergänzt, nicht vom Zufall der Liste abhängig
        const proj = await inv_get('?project_id=' + P)
        expect(proj.j.invoices.map((x: any) => x.id).sort()).toEqual([a.id, ga.id].sort())
        const fp = berechneForderung(norm(proj.j.invoices) as any); expect(fp.offen).toBe(595); expect(fp.ungeklaert).toBe(0)
      } finally { await q(`delete from invoices where invoice_number like 'MASSE-%'`) }
    })
    it('ausgeglichene Rechnung: nicht in Überfälligkeitskennzahlen, offenen Posten, Offen-/Überfällig-Filter; DATEV-Export kennt keinen offenen Betrag', async () => {
      const P = await neuesProjekt('E2E Auswertung', {})
      const a = await re(P, 1000); await q('update invoices set due_date=$2 where id=$1', [a.id, plusTage(HEUTE, -40)])
      const b = await re(P, 1000); await q('update invoices set due_date=$2 where id=$1', [b.id, plusTage(HEUTE, -40)])   // bleibt überfällig
      await gs(P, a.invoice_number, 1000)
      const rows = norm(await q('select * from invoices where project_id=$1', [P])) as any[]
      const K = await import('@/lib/faktura-kennzahlen')
      const kz = K.berechneKennzahlen(rows, [], HEUTE)
      merke('9 Status', 'Überfälligkeit: ausgeglichene Rechnung zählt nicht (Anzahl / Betrag)', '1 / 1190', `${kz.ueberfaelligAnzahl} / ${kz.ueberfaelligBetrag}`)
      expect([kz.ueberfaelligAnzahl, kz.ueberfaelligBetrag, kz.offenAnzahl, kz.offenBetrag]).toEqual([1, 1190, 1, 1190])
      expect(K.offenePosten(rows).map((r: any) => r.id)).toEqual([b.id]); expect(K.ueberfaelligeRechnungen(rows, HEUTE).map((r: any) => r.id)).toEqual([b.id])
      const f = (status: any) => K.filtereRechnungen(rows, { suche: '', reiter: 'rechnungen', jahr: 'alle', status } as any, HEUTE).map((r: any) => r.id)
      expect(f('offen')).not.toContain(a.id); expect(f('ueberfaellig')).toEqual([b.id]); expect(f('bezahlt')).toEqual([a.id])   // b ist überfällig (eigene Gruppe), a ausgeglichen
      const { readFileSync } = await import('node:fs'); const t = readFileSync('components/rechnungen/RechnungenInhalt.tsx', 'utf8')
      const datev = t.slice(t.indexOf('function buildDatevEXTF'), t.indexOf('function', t.indexOf('function buildDatevEXTF') + 10))
      expect(datev).not.toMatch(/paid_amount|offen|ueberfaellig/)   // bucht Belege (Brutto), keinen Zahlungsstand → gespeicherter vs. abgeleiteter Status ohne Einfluss
    })
    it('zwei gleichzeitige Zahlungen: nie mehr als offen gebucht, Zahlungssumme = paid_amount', async () => {
      for (let lauf = 1; lauf <= 4; lauf++) {
        const P = await neuesProjekt('E2E Zwei Zahlungen ' + lauf, {}); const a = await re(P, 1000)              // 1.190
        const [x, y] = await Promise.all([zahle(a.id, 1000), zahle(a.id, 1000)])
        merke('9 Parallel', `Zwei gleichzeitige Zahlungen à 1.000 auf 1.190 (Lauf ${lauf})`, '200 + 400', `${[x.status, y.status].sort().join(' + ')}`)
        expect([x.status, y.status].sort()).toEqual([200, 400]); const z = await zeile(a.id)
        expect([Number(z.paid_amount), await summeZahlungen(a.id), await anzahlZahlungen(a.id)]).toEqual([1000, 1000, 1])
        const [u, v] = await Promise.all([zahle(a.id, 190), zahle(a.id, 190)])                                    // Rest 190: nur eine passt
        expect([u.status, v.status].sort()).toEqual([200, 400]); expect((await zeile(a.id)).status).toBe('bezahlt')
        expect(Number((await zeile(a.id)).paid_amount)).toBe(1190)
      }
    })
    it('zwei gleichzeitige Gutschriften: beide gespeichert, Verrechnung begrenzt auf offen, Überhang = Guthaben, Status konsistent', async () => {
      for (let lauf = 1; lauf <= 3; lauf++) {
        const P = await neuesProjekt('E2E Zwei Gutschriften ' + lauf, {}); const a = await re(P, 1000)            // 1.190
        expect((await zahle(a.id, 595)).status).toBe(200)
        const [g1, g2] = await Promise.all([inv('POST', gsBody(P, a.invoice_number, 500)), inv('POST', gsBody(P, a.invoice_number, 500))])   // 2 × 595 → 595 Überhang
        const ids = (await q(`select id from invoices where project_id=$1`, [P])).map((r: any) => r.id)
        const s = await stand(ids); const z = await zeile(a.id)
        merke('9 Parallel', `Zwei gleichzeitige Gutschriften (Lauf ${lauf}): offen / Guthaben / Status`, '0 / 595 / bezahlt', `${s.f.offen} / ${s.f.guthaben} / ${z.status}`)
        expect([g1.status, g2.status].every((c) => c === 200 || c === 201)).toBe(true)
        expect([s.f.offen, s.f.guthaben, z.status]).toEqual([0, 595, 'bezahlt']); expect(Number(z.paid_amount)).toBe(595)
      }
    })
    it('doppelte Wiederholung: gleiche Zahlung mit gleichem Schlüssel wird nur einmal gebucht; Gutschrift/Rechnung mit gleichem Schlüssel nur einmal angelegt', async () => {
      const P = await neuesProjekt('E2E Wiederholung', {}); const a = await re(P, 1000)
      const k = 'zahlung-' + Math.random().toString(36).slice(2)
      const z1 = await zahle(a.id, 500, {}, { 'Idempotency-Key': k }); const z2 = await zahle(a.id, 500, {}, { 'Idempotency-Key': k })
      merke('9 Wiederholung', 'Zahlung 500 mit gleichem Schlüssel zweimal gesendet: Buchungen / bezahlt', '1 / 500', `${await anzahlZahlungen(a.id)} / ${Number((await zeile(a.id)).paid_amount)}`)
      expect([z1.status, z2.status]).toEqual([200, 200]); expect(z2.j.wiederholt).toBe(true)
      expect([await anzahlZahlungen(a.id), Number((await zeile(a.id)).paid_amount)]).toEqual([1, 500])
      const z3 = await zahle(a.id, 500, {}, { 'Idempotency-Key': k + '-neu' }); expect(z3.status).toBe(200); expect(await anzahlZahlungen(a.id)).toBe(2)   // bewusst zweite Buchung = neuer Schlüssel
      // gleichzeitig dieselbe Anfrage
      const k2 = 'parallel-' + Math.random().toString(36).slice(2); const b = await re(P, 1000)
      const [p1, p2] = await Promise.all([zahle(b.id, 300, {}, { 'Idempotency-Key': k2 }), zahle(b.id, 300, {}, { 'Idempotency-Key': k2 })])
      expect([p1.status, p2.status]).toEqual([200, 200]); expect(await anzahlZahlungen(b.id)).toBe(1)
      // Gutschrift: gleicher Schlüssel → eine Gutschrift, identische Antwort
      const kg = 'gutschrift-' + Math.random().toString(36).slice(2)
      const g1 = await apiH('@/app/api/invoices/route', 'POST', gsBody(P, b.invoice_number, 100), { 'Idempotency-Key': kg })
      const g2 = await apiH('@/app/api/invoices/route', 'POST', gsBody(P, b.invoice_number, 100), { 'Idempotency-Key': kg })
      merke('9 Wiederholung', 'Gutschrift mit gleichem Schlüssel zweimal gesendet: Anzahl / Replay', '1 / true', `${(await q(`select count(*)::int n from invoices where reference_invoice_number=$1`, [b.invoice_number]))[0].n} / ${g2.replay}`)
      expect([g1.status, g2.status]).toEqual([g1.status, g1.status]); expect(g2.replay).toBe('true'); expect(g2.j.invoice.id).toBe(g1.j.invoice.id)
      expect((await q(`select count(*)::int n from invoices where reference_invoice_number=$1`, [b.invoice_number]))[0].n).toBe(1)
    })
    it('Netzwerkfehler nach erfolgreichem Commit: die Antwort geht verloren, die Wiederholung mit demselben Schlüssel bucht nichts doppelt und liefert das Ergebnis', async () => {
      const P = await neuesProjekt('E2E Netzwerkfehler', {}); const a = await re(P, 1000)
      const k = 'netz-' + Math.random().toString(36).slice(2)
      await zahle(a.id, 400, {}, { 'Idempotency-Key': k })                                     // gebucht, Antwort „verloren“ (Ergebnis wird verworfen)
      const wieder = await zahle(a.id, 400, {}, { 'Idempotency-Key': k })                      // Wiederholung der Oberfläche
      expect(wieder.status).toBe(200); expect(wieder.j.wiederholt).toBe(true); expect(Number(wieder.j.paid_amount)).toBe(400)
      expect([await anzahlZahlungen(a.id), Number((await zeile(a.id)).paid_amount)]).toEqual([1, 400])
      const kr = 'netz-re-' + Math.random().toString(36).slice(2)
      const body = { customer_name: KUNDE, project_id: P, invoice_type: 'standard', positions: [{ bezeichnung: 'Gerüst', menge: 1, einheit: 'Pauschale', einzelpreis: 321 }] }
      const e1 = await apiH('@/app/api/invoices/route', 'POST', body, { 'Idempotency-Key': kr }); const e2 = await apiH('@/app/api/invoices/route', 'POST', body, { 'Idempotency-Key': kr })
      merke('9 Wiederholung', 'Rechnung anlegen, Antwort verloren, Wiederholung: Anzahl / gleiche Nummer', '1 / true', `${(await q('select count(*)::int n from invoices where project_id=$1 and net_amount=321', [P]))[0].n} / ${e1.j.invoice.invoice_number === e2.j.invoice.invoice_number}`)
      expect((await q('select count(*)::int n from invoices where project_id=$1 and net_amount=321', [P]))[0].n).toBe(1); expect(e2.j.invoice.invoice_number).toBe(e1.j.invoice.invoice_number)
    })
    it('Stornierung während konkurrierender Buchung: entweder Zahlung zuerst (dann gebucht) oder Storno zuerst (dann 409) – nie ein widersprüchlicher Zustand', async () => {
      const ergebnisse = new Set<string>()
      for (let lauf = 1; lauf <= 6; lauf++) {
        const P = await neuesProjekt('E2E Storno parallel ' + lauf, {}); const a = await re(P, 1000)
        const [z, s] = await Promise.all([zahle(a.id, 1190), inv('PATCH', { id: a.id, status: 'storniert' })])
        const r = await zeile(a.id); const n = await anzahlZahlungen(a.id); const summe = await summeZahlungen(a.id)
        expect(Number(r.paid_amount)).toBe(summe)                                           // paid_amount und Zahlungszeilen stimmen immer überein
        if (z.status === 200) expect(n).toBe(1); else { expect(z.status).toBe(409); expect(n).toBe(0) }
        if (s.status === 200) expect(r.status).toBe('storniert')
        if (z.status === 200 && s.status !== 200) expect(r.status).toBe('bezahlt')
        ergebnisse.add(`${z.status}/${s.status}/${r.status}`)
      }
      merke('9 Parallel', 'Zahlung ‖ Storno (6 Läufe): auftretende Ausgänge (Zahlung/Storno/Status)', 'konsistent', [...ergebnisse].join(' | '), true)
    })
    it('Paritätstest: SQL-Berechnung (faktura_offen_berechne) = lib/forderung.ts für viele Fälle', async () => {
      const { berechneForderung } = await import('@/lib/forderung'); let n = 0
      const brutto = [0, 100, 1190, 3570]; const bezahlt = [0, 50, 100, 1190, 4000]; const status = ['offen', 'ueberfaellig', 'bezahlt']; const gutschr = [0, 20, 595, 1190, 5000]
      for (const g of brutto) for (const p of bezahlt) for (const st of status) for (const c of gutschr) {
        const r = { id: 'r', invoice_number: 'RE-1', invoice_type: 'standard', status: st, gross_amount: g, paid_amount: p, due_date: null }
        const list: any[] = [r]; if (c > 0) list.push({ id: 'g', invoice_number: 'GS-1', invoice_type: 'gutschrift', status: 'offen', gross_amount: -c, paid_amount: 0, reference_invoice_number: 'RE-1' })
        const ts = berechneForderung(list)
        const sql = (await q('select * from faktura_offen_berechne($1::numeric,$2::numeric,$3::text,$4::numeric)', [g, p, st, c]))[0]
        const tsOffen = ts.je.get('r') ?? 0
        if (Math.abs(Number(sql.offen) - tsOffen) > 0.005 || Math.abs(Number(sql.guthaben) - ts.guthaben) > 0.005 || Math.abs(Number(sql.gutschrift) - (ts.gutschriftJe.get('r') ?? 0)) > 0.005) {
          throw new Error(`Abweichung bei brutto=${g} bezahlt=${p} status=${st} gutschrift=${c}: SQL ${JSON.stringify(sql)} TS offen=${tsOffen} guthaben=${ts.guthaben}`)
        }
        n++
      }
      merke('9 Parität', 'SQL-Offenbetrag/Guthaben = lib/forderung.ts (Fälle)', n, n)
      expect(n).toBe(brutto.length * bezahlt.length * status.length * gutschr.length)
    })
  })

  // ──────────────────────────────────────────────────────────
  // 8d. Phase 130: Idempotenz mit Anker, manuelles „Als bezahlt“, Rechte, Migration, Bereinigung
  // ──────────────────────────────────────────────────────────
  describe('8d. Phase 130', () => {
    const apiH = async (modul: string, methode: 'POST' | 'PATCH' | 'DELETE', body: unknown, headers: Record<string, string> = {}) => {
      const m = await import(modul)
      const res = await m[methode](new NextRequest('http://x/api', { method: methode, headers, body: body === undefined ? undefined : JSON.stringify(body) }) as never)
      const text = await res.text(); let j: any = null; try { j = JSON.parse(text) } catch { /* leer */ }
      return { status: res.status, j, replay: res.headers.get('Idempotent-Replay') }
    }
    const reBody = (P: string | null, preis: number) => ({ customer_name: KUNDE, ...(P ? { project_id: P } : {}), invoice_type: 'standard', positions: [{ bezeichnung: 'Gerüst', menge: 1, einheit: 'Pauschale', einzelpreis: preis }] })
    const gsBody = (P: string | null, bezug: string, preis: number) => ({ customer_name: KUNDE, ...(P ? { project_id: P } : {}), invoice_type: 'gutschrift', reference_invoice_number: bezug, positions: [{ bezeichnung: 'Gutschrift zu ' + bezug, menge: 1, einheit: 'Pauschale', einzelpreis: preis }] })
    const mitKey = (key: string) => ({ 'Idempotency-Key': key })
    const re = async (P: string | null, preis: number) => (await inv('POST', reBody(P, preis))).j.invoice
    const zeile = async (id: string) => (await q('select status, paid_amount from invoices where id=$1', [id]))[0]
    const zahlungen = (id: string) => q('select amount, quelle from invoice_payments where invoice_id=$1 order by created_at', [id]).catch(() => q('select amount, quelle from invoice_payments where invoice_id=$1', [id]))
    const warte = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const stand = async (ids: string[]) => { const { statusJe, berechneForderung } = await import('@/lib/forderung'); const r = norm(await q('select * from invoices where id = any($1)', [ids])) as any[]; return { st: statusJe(r, HEUTE), f: berechneForderung(r) } }
    const keyZeile = async (k: string) => (await q('select * from faktura_idempotenz where schluessel=$1', ['rechnung:' + k]))[0]
    // hält den Advisory-Lock des Schlüssels auf einer EIGENEN Verbindung: ein laufender Vorgang, den die Anfrage abwarten muss
    const haltSperre = async (k: string) => { const c = await pool.connect(); await c.query('begin'); await c.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', ['rechnung:' + k]); return { gib: async () => { await c.query('commit'); c.release() } } }

    it('1. zwei parallele Rechnungsanfragen mit demselben Schlüssel: genau eine Rechnung, Wiederholung liefert dieselbe', async () => {
      const P = await neuesProjekt('E2E P130 Parallel Rechnung', {}); const k = 'p130-1-' + Date.now()
      const erg = await Promise.all([apiH('@/app/api/invoices/route', 'POST', reBody(P, 1000), mitKey(k)), apiH('@/app/api/invoices/route', 'POST', reBody(P, 1000), mitKey(k))])
      const rs = await rechnungen(P)
      merke('130 Idempotenz', 'Zwei parallele Rechnungsanfragen, gleicher Schlüssel: Rechnungen', 1, rs.length)
      expect(rs).toHaveLength(1); expect(erg.some((x) => x.status === 200)).toBe(true); expect(erg.filter((x) => x.status !== 200).every((x) => x.status === 409 && x.j.code === 'IN_BEARBEITUNG')).toBe(true)
      const wieder = await apiH('@/app/api/invoices/route', 'POST', reBody(P, 1000), mitKey(k))
      expect(wieder.status).toBe(200); expect(wieder.replay).toBe('true'); expect(wieder.j.invoice.id).toBe(rs[0].id); expect(await rechnungen(P)).toHaveLength(1)
    })
    it('2. zwei parallele Gutschriftanfragen mit demselben Schlüssel: genau eine Gutschrift', async () => {
      const P = await neuesProjekt('E2E P130 Parallel Gutschrift', {}); const a = await re(P, 1000); const k = 'p130-2-' + Date.now()
      const erg = await Promise.all([1, 2, 3].map(() => apiH('@/app/api/invoices/route', 'POST', gsBody(P, a.invoice_number, 400), mitKey(k))))
      const gsn = (await rechnungen(P)).filter((r) => r.invoice_type === 'gutschrift')
      merke('130 Idempotenz', 'Drei parallele Gutschriftanfragen, gleicher Schlüssel: Gutschriften', 1, gsn.length)
      expect(gsn).toHaveLength(1); expect(erg.some((x) => x.status === 200)).toBe(true)
      expect((await stand([a.id, gsn[0].id])).f.je.get(a.id)).toBe(1190 - 476)
    })
    it('3. gleicher Schlüssel, andere Nutzdaten: abgelehnt (Rechnung und Zahlung), nichts zusätzlich angelegt', async () => {
      const P = await neuesProjekt('E2E P130 Schluesselkonflikt', {}); const k = 'p130-3-' + Date.now()
      expect((await apiH('@/app/api/invoices/route', 'POST', reBody(P, 1000), mitKey(k))).status).toBe(200)
      const x = await apiH('@/app/api/invoices/route', 'POST', reBody(P, 2000), mitKey(k))
      merke('130 Idempotenz', 'Gleicher Schlüssel, anderer Betrag (Rechnung)', 'KEY_KONFLIKT', x.j?.code); expect(x.status).toBe(422); expect(x.j.code).toBe('KEY_KONFLIKT'); expect(await rechnungen(P)).toHaveLength(1)
      const r = (await rechnungen(P))[0]; const kz = 'p130-3z-' + Date.now()
      expect((await apiH('@/app/api/invoice-payments/route', 'POST', { invoice_id: r.id, amount: 100, payment_date: HEUTE }, mitKey(kz))).status).toBe(200)
      const y = await apiH('@/app/api/invoice-payments/route', 'POST', { invoice_id: r.id, amount: 200, payment_date: HEUTE }, mitKey(kz))
      merke('130 Idempotenz', 'Gleicher Schlüssel, anderer Betrag (Zahlung)', 'KEY_KONFLIKT', y.j?.code); expect(y.status).toBe(422); expect((await zahlungen(r.id))).toHaveLength(1)
      const gleich = await apiH('@/app/api/invoice-payments/route', 'POST', { invoice_id: r.id, amount: 100, payment_date: HEUTE }, mitKey(kz))
      expect(gleich.status).toBe(200); expect((await zahlungen(r.id))).toHaveLength(1)
    })
    it('4. Netzwerkfehler nach erfolgreichem Commit: Wiederholung liefert die ursprüngliche Rechnung (auch wenn die Antwort nie gespeichert wurde)', async () => {
      const P = await neuesProjekt('E2E P130 Netzwerk', {}); const k = 'p130-4-' + Date.now()
      const erst = await apiH('@/app/api/invoices/route', 'POST', reBody(P, 1000), mitKey(k)); expect(erst.status).toBe(200)
      const wieder = await apiH('@/app/api/invoices/route', 'POST', reBody(P, 1000), mitKey(k))
      expect(wieder.status).toBe(200); expect(wieder.j.invoice.id).toBe(erst.j.invoice.id)
      // Server stürzte NACH dem Commit der Rechnung ab, BEVOR die Antwort gespeichert wurde (Zustand „angelegt“, keine Antwort)
      await q(`update faktura_idempotenz set status='angelegt', antwort=null, http_status=null where schluessel=$1`, ['rechnung:' + k])
      const nach = await apiH('@/app/api/invoices/route', 'POST', reBody(P, 1000), mitKey(k))
      merke('130 Idempotenz', 'Wiederholung nach Absturz nach Commit: gleiche Rechnung, Anzahl', '1 / gleich', `${(await rechnungen(P)).length} / ${nach.j?.invoice?.id === erst.j.invoice.id ? 'gleich' : 'anders'}`)
      expect(nach.status).toBe(200); expect(nach.j.invoice.id).toBe(erst.j.invoice.id); expect(await rechnungen(P)).toHaveLength(1)
      expect((await keyZeile(k)).status).toBe('fertig')
    })
    it('5. Vorgang dauert länger als 2 Minuten: wird nicht übernommen, es entsteht keine zweite Rechnung', async () => {
      const P = await neuesProjekt('E2E P130 Lang', {}); const k = 'p130-5-' + Date.now()
      const sperre = await haltSperre(k)                                                       // „laufender“ Vorgang auf eigener Verbindung
      const r1 = apiH('@/app/api/invoices/route', 'POST', reBody(P, 1000), mitKey(k))          // startet, wartet im Anlegen auf die Sperre
      await warte(500)
      await q(`update faktura_idempotenz set lease_bis = now() - interval '5 minutes', aktualisiert_am = now() - interval '5 minutes' where schluessel=$1`, ['rechnung:' + k])   // Frist (2 Minuten) abgelaufen
      const r2 = apiH('@/app/api/invoices/route', 'POST', reBody(P, 1000), mitKey(k))          // darf nicht blind übernehmen
      await warte(500); await sperre.gib()
      const [a, b] = await Promise.all([r1, r2])
      merke('130 Idempotenz', 'Vorgang > 2 Minuten, zweite Anfrage nach Fristablauf: Rechnungen', 1, (await rechnungen(P)).length)
      expect(await rechnungen(P)).toHaveLength(1); expect([a.status, b.status].every((x) => x === 200 || x === 409)).toBe(true); expect([a.status, b.status]).toContain(200)
    })
    it('6. Wiederholung nach Serverabsturz (vor dem Anlegen): genau eine Rechnung, Schlüssel danach abgeschlossen', async () => {
      const P = await neuesProjekt('E2E P130 Absturz', {}); const k = 'p130-6-' + Date.now()
      await q(`insert into faktura_idempotenz (schluessel, art, status, lease_bis, aktualisiert_am) values ($1, 'rechnung_anlegen', 'laeuft', now() - interval '10 minutes', now() - interval '10 minutes')`, ['rechnung:' + k])
      const x = await apiH('@/app/api/invoices/route', 'POST', reBody(P, 1000), mitKey(k))
      expect(x.status).toBe(200); expect(await rechnungen(P)).toHaveLength(1)
      const z = await keyZeile(k); expect(z.status).toBe('fertig'); expect(z.invoice_id).toBe(x.j.invoice.id)
      expect((await apiH('@/app/api/invoices/route', 'POST', reBody(P, 1000), mitKey(k))).replay).toBe('true'); expect(await rechnungen(P)).toHaveLength(1)
      // Frist noch nicht abgelaufen und kein Anker: wird NICHT übernommen
      const k2 = 'p130-6b-' + Date.now()
      await q(`insert into faktura_idempotenz (schluessel, art, status, lease_bis) values ($1, 'rechnung_anlegen', 'laeuft', now() + interval '1 minute')`, ['rechnung:' + k2])
      const y = await apiH('@/app/api/invoices/route', 'POST', reBody(P, 1000), mitKey(k2)); expect(y.status).toBe(409); expect(y.j.code).toBe('IN_BEARBEITUNG'); expect(await rechnungen(P)).toHaveLength(1)
    })
    it('7. manuell „Als bezahlt“ auf offener Rechnung: echte Zahlungszeile über den zentralen offenen Betrag, Verlauf mit Benutzer; mitgesendeter Betrag wird ignoriert; „offen“ nimmt nur diese Zahlung zurück', async () => {
      const P = await neuesProjekt('E2E P130 Manuell', {}); const a = await re(P, 1000)
      const x = await inv('PATCH', { id: a.id, status: 'bezahlt', paid_amount: 5, grund: 'Barzahlung vor Ort' })
      expect(x.status).toBe(200); const z = await zeile(a.id)
      merke('130 Manuell', 'Als bezahlt auf offener Rechnung: Status / bezahlt / Zahlungszeilen', 'bezahlt / 1190 / 1', `${z.status} / ${z.paid_amount} / ${(await zahlungen(a.id)).length}`)
      expect([z.status, Number(z.paid_amount)]).toEqual(['bezahlt', 1190]); expect(await zahlungen(a.id)).toEqual([{ amount: '1190.00', quelle: 'manuell_bezahlt' }])
      const h = await q(`select user_id, grund from abrechnung_historie where invoice_id=$1 and aktion='zahlung_geaendert'`, [a.id])
      expect(h).toEqual([{ user_id: USER, grund: 'Barzahlung vor Ort' }])
      expect((await inv('PATCH', { id: a.id, paid_amount: 300 })).status).toBe(400)            // Betrag allein wird nicht mehr direkt gesetzt
      expect((await inv('PATCH', { id: a.id, paid_amount: 300 })).j.code).toBe('PAID_AMOUNT_NICHT_ERLAUBT')
      expect((await inv('PATCH', { id: a.id, status: 'offen' })).status).toBe(200)
      const z2 = await zeile(a.id); expect([z2.status, Number(z2.paid_amount)]).toEqual(['offen', 0]); expect(await zahlungen(a.id)).toHaveLength(0)
      // „offen“ bei echter Zahlung: abgelehnt, Zahlung bleibt
      const b = await re(P, 1000); expect((await apiH('@/app/api/invoice-payments/route', 'POST', { invoice_id: b.id, amount: 100, payment_date: HEUTE })).status).toBe(200)
      const y = await inv('PATCH', { id: b.id, status: 'offen' }); expect(y.status).toBe(409); expect(y.j.code).toBe('ZAHLUNGEN_VORHANDEN'); expect(Number((await zeile(b.id)).paid_amount)).toBe(100)
      // Teilzahlung 100 + „Als bezahlt“: nur der Rest wird gebucht
      expect((await inv('PATCH', { id: b.id, status: 'bezahlt' })).status).toBe(200)
      const zb = await zeile(b.id); expect([zb.status, Number(zb.paid_amount)]).toEqual(['bezahlt', 1190]); expect((await zahlungen(b.id)).map((p: any) => Number(p.amount)).sort((m: number, n: number) => m - n)).toEqual([100, 1090])
    })
    it('8. manuell „Als bezahlt“ auf voll gutgeschriebener Rechnung: keine erfundene Zahlung, Anzeige „ausgeglichen“; bei Teil-Gutschrift nur der Rest', async () => {
      const P = await neuesProjekt('E2E P130 Ausgeglichen', {}); const a = await re(P, 1000)
      await inv('POST', gsBody(P, a.invoice_number, 1000))
      const x = await inv('PATCH', { id: a.id, status: 'bezahlt' }); expect(x.status).toBe(200)
      const z = await zeile(a.id); const s = await stand([a.id, ...(await q(`select id from invoices where reference_invoice_number=$1`, [a.invoice_number])).map((r: any) => r.id)])
      merke('130 Manuell', 'Als bezahlt auf voll gutgeschriebener Rechnung: Zahlungen / Anzeige', '0 / ausgeglichen', `${(await zahlungen(a.id)).length} / ${s.st.get(a.id)}`)
      expect(await zahlungen(a.id)).toHaveLength(0); expect(Number(z.paid_amount)).toBe(0); expect(s.st.get(a.id)).toBe('ausgeglichen'); expect(z.status).not.toBe('bezahlt')
      const b = await re(P, 1000); await inv('POST', gsBody(P, b.invoice_number, 500))
      expect((await inv('PATCH', { id: b.id, status: 'bezahlt' })).status).toBe(200)
      expect((await zahlungen(b.id)).map((p: any) => Number(p.amount))).toEqual([595]); expect((await zeile(b.id)).status).toBe('bezahlt')
    })
    it('9. manuell „Als bezahlt“ auf stornierter Rechnung: abgelehnt, nichts gebucht, bleibt storniert', async () => {
      const P = await neuesProjekt('E2E P130 Storniert', {}); const a = await re(P, 1000)
      expect((await inv('PATCH', { id: a.id, status: 'storniert' })).status).toBe(200)
      const x = await inv('PATCH', { id: a.id, status: 'bezahlt', paid_amount: 1190 })
      merke('130 Manuell', 'Als bezahlt auf stornierter Rechnung', 'ZAHLUNG_AUF_STORNIERT', x.j?.code); expect(x.status).toBe(409); expect(x.j.code).toBe('ZAHLUNG_AUF_STORNIERT')
      const y = await inv('PATCH', { id: a.id, status: 'offen' }); expect(y.status).toBe(409); expect(y.j.code).toBe('STORNIERT_FINAL')
      const z = await zeile(a.id); expect([z.status, Number(z.paid_amount)]).toEqual(['storniert', 0]); expect(await zahlungen(a.id)).toHaveLength(0)
    })
    it('10. manuelle Statusänderung und Zahlung gleichzeitig (getrennte Verbindungen): Summe der Zahlungen = paid_amount, nie über dem Rechnungsbetrag', async () => {
      for (let runde = 0; runde < 6; runde++) {
        const P = await neuesProjekt('E2E P130 Gleichzeitig ' + runde, {}); const a = await re(P, 1000)
        const erg = await Promise.all([inv('PATCH', { id: a.id, status: 'bezahlt' }), apiH('@/app/api/invoice-payments/route', 'POST', { invoice_id: a.id, amount: 1190, payment_date: HEUTE }, mitKey('p130-10-' + runde + '-' + Date.now()))])
        const z = await zeile(a.id); const summe = (await zahlungen(a.id)).reduce((t: number, p: any) => t + Number(p.amount), 0)
        merke('130 Manuell', `Status ∥ Zahlung (Runde ${runde + 1}): Summe Zahlungen / paid_amount / Status`, '1190 / 1190 / bezahlt', `${summe} / ${z.paid_amount} / ${z.status}`)
        expect(Math.round(summe * 100) / 100).toBe(1190); expect(Number(z.paid_amount)).toBe(1190); expect(z.status).toBe('bezahlt')
        expect(erg.some((x) => x.status === 200)).toBe(true)
      }
    })
    it('11. Migrationen 129 und 130 wiederholt ausgeführt: keine Fehler, historische Buchungen unverändert, Funktionen vorhanden', async () => {
      const { readFileSync } = await import('node:fs')
      const pruef = async () => (await q(`select (select md5(coalesce(string_agg(t::text, '|' order by id), '')) from invoices t) i, (select md5(coalesce(string_agg(t::text, '|' order by id), '')) from invoice_payments t) z, (select md5(coalesce(string_agg(t::text, '|' order by id), '')) from abrechnung_historie t) h`))[0]
      const vorher = await pruef()
      for (const datei of ['supabase/phase-129-faktura-atomare-buchung.sql', 'supabase/phase-130-faktura-idempotenz-status.sql', 'supabase/phase-129-faktura-atomare-buchung.sql', 'supabase/phase-130-faktura-idempotenz-status.sql']) await pool.query(readFileSync(datei, 'utf8'))
      const nachher = await pruef()
      merke('130 Migration', 'Migration 129/130 zweimal ausgeführt: Prüfsumme Rechnungen, Zahlungen, Verlauf', 'unverändert', JSON.stringify(vorher) === JSON.stringify(nachher) ? 'unverändert' : 'verändert')
      expect(nachher).toEqual(vorher)
      const f = await q(`select proname, count(*)::int n from pg_proc where proname in ('faktura_zahlung_buchen','faktura_idempotenz_start','faktura_status_setzen','faktura_anlegen_idempotent') group by 1 order by 1`)
      expect(f).toEqual([{ proname: 'faktura_anlegen_idempotent', n: 1 }, { proname: 'faktura_idempotenz_start', n: 1 }, { proname: 'faktura_status_setzen', n: 1 }, { proname: 'faktura_zahlung_buchen', n: 1 }])
    })
    it('12. Bereinigung alter Idempotenzschlüssel: entfernt nur abgeschlossene/verwaiste alte Schlüssel, laufende und angelegte jüngere bleiben, auch bei gleichzeitig laufendem Vorgang', async () => {
      const P = await neuesProjekt('E2E P130 Bereinigung', {}); const live = 'p130-12-live-' + Date.now()
      const sperre = await haltSperre(live)
      const lauf = apiH('@/app/api/invoices/route', 'POST', reBody(P, 1000), mitKey(live))     // gleichzeitig laufender Vorgang (Zeile „laeuft“, Frist offen)
      await warte(500)
      const p = 'p130-12-' + Date.now() + '-'
      const ins = (n: string, status: string, alter: string, lease: string, inv_id: string | null) => q(`insert into faktura_idempotenz (schluessel, art, status, aktualisiert_am, lease_bis, invoice_id) values ($1, 'rechnung_anlegen', $2, now() - $3::interval, ${lease}, $4)`, ['rechnung:' + p + n, status, alter, inv_id])
      const anker = (await q(`select id from invoices limit 1`))[0]?.id ?? null
      await ins('fertig-alt', 'fertig', '100 days', 'null', anker); await ins('fertig-neu', 'fertig', '1 day', 'null', anker)
      await ins('angelegt-alt', 'angelegt', '100 days', 'null', anker); await ins('angelegt-neu', 'angelegt', '2 days', 'null', anker)
      await ins('verwaist-alt', 'laeuft', '10 days', "now() - interval '10 days'", null); await ins('verwaist-neu', 'laeuft', '1 day', "now() - interval '1 day'", null)
      await ins('aktiv-alt', 'laeuft', '30 days', "now() + interval '1 minute'", null)          // Frist noch offen: nie löschen, egal wie alt der Eintrag aussieht
      const erg = (await q(`select faktura_idempotenz_bereinigen(90, 7) r`))[0].r
      const bleibt = (await q(`select schluessel from faktura_idempotenz where schluessel like $1 or schluessel=$2 order by 1`, ['rechnung:' + p + '%', 'rechnung:' + live])).map((r: any) => r.schluessel.replace('rechnung:' + p, ''))
      merke('130 Bereinigung', 'Verbleibende Schlüssel nach Bereinigung', 'aktiv-alt, angelegt-neu, fertig-neu, verwaist-neu, + laufender Vorgang', bleibt.join(', '), bleibt.sort().join(',') === ['aktiv-alt', 'angelegt-neu', 'fertig-neu', 'verwaist-neu', 'rechnung:' + live].sort().join(','))
      expect(bleibt.sort()).toEqual(['aktiv-alt', 'angelegt-neu', 'fertig-neu', 'verwaist-neu', 'rechnung:' + live].sort()); expect(erg).toEqual({ fertig: 1, angelegt: 1, leer: 1 })
      await sperre.gib(); const x = await lauf
      expect(x.status).toBe(200); expect(await rechnungen(P)).toHaveLength(1)
      expect((await keyZeile(live)).status).toBe('fertig')
      await q(`delete from faktura_idempotenz where schluessel like $1`, ['rechnung:' + p + '%'])
    })
    it('13. Rechte: Buchungsfunktionen und Schlüsseltabelle sind für anon/authenticated gesperrt, für service_role erlaubt', async () => {
      const c = await pool.connect()
      try {
        for (const rolle of ['anon', 'authenticated']) {
          for (const sql of [`select faktura_zahlung_buchen(gen_random_uuid(), 1::numeric, current_date, null::text, null::text, null::text)`, `select faktura_status_setzen(gen_random_uuid(), 'bezahlt'::text, null::uuid, null::text)`, `select faktura_idempotenz_bereinigen(1, 1)`, `select * from faktura_idempotenz limit 1`]) {
            await c.query(`set role ${rolle}`)
            const r = await c.query(sql).then(() => 'erlaubt', (e) => String(e.message))
            await c.query('reset role')
            merke('130 Rechte', `${rolle}: ${sql.slice(0, 40)}…`, 'permission denied', /permission denied/.test(r) ? 'permission denied' : r)
            expect(r).toMatch(/permission denied/)
          }
        }
        await c.query('set role service_role'); const ok = await c.query(`select faktura_status_setzen(gen_random_uuid(), 'bezahlt'::text, null::uuid, null::text) r`).then((x) => x.rows[0].r, (e) => String(e.message)); await c.query('reset role')
        expect(ok).toEqual({ ok: false, code: 'NICHT_GEFUNDEN' })
      } finally { await c.query('reset role').catch(() => {}); c.release() }
    })
  })

  // ──────────────────────────────────────────────────────────
  // 9. Parallelität (echte Transaktionen, getrennte Datenbankverbindungen)
  // ──────────────────────────────────────────────────────────
  describe('9. Parallelität und Datenintegrität', () => {
    it('9.1 Fünf Mitarbeiter rechnen gleichzeitig dieselbe Aufmaßdifferenz ab: genau eine Rechnung', async () => {
      const P = await neuesProjekt('E2E Parallel Aufmass', {})
      const d = await projektData(P)
      const e = neuesZwischenaufmassJePosition([], { stichtag: HEUTE, positionen: [{ bezeichnung: 'Fassadengerüst', einheit: 'm²', einzelpreis: 10, menge: 100 }] }, 'za-p'); if (!e.ok) throw new Error(e.fehler)
      await prj({ id: P, data: { zwischenaufmasse: [e.eintrag] } }); void d
      const liste = normalisiereZwischenaufmasse((await projektData(P)).zwischenaufmasse); const t = baueTeilleistungsPositionen(liste[0], liste)
      const body = { customer_name: KUNDE, project_id: P, invoice_type: 'abschlag', positions: t.positionen, aufmass: { za_id: 'za-p', stand: aufmassStand(liste[0]) } }
      const erg = await Promise.all([1, 2, 3, 4, 5].map(() => inv('POST', body)))
      const ok = erg.filter((x) => x.status === 200).length
      merke('9 Parallel', 'Gleichzeitige Abschläge für dieselbe Aufmaßdifferenz: Rechnungen', 1, (await rechnungen(P)).length)
      expect(ok).toBe(1); expect(await rechnungen(P)).toHaveLength(1); expect(erg.filter((x) => x.status !== 200).every((x) => x.status === 409)).toBe(true)
      expect(await integritaet(P)).toEqual([])
    })
    it('9.2 Fünf Mitarbeiter rechnen gleichzeitig denselben Vorhaltezeitraum ab: genau eine Rechnung', async () => {
      const P = await neuesProjekt('E2E Parallel Vorhaltung', { vorhaltung: vb() })
      const erg = await Promise.all([1, 2, 3, 4, 5].map(() => vorhaltungRechnung(P)))
      merke('9 Parallel', 'Gleichzeitige Vorhalteabrechnung: Rechnungen', 1, (await rechnungen(P)).length)
      expect(erg.filter((x) => x.status === 200)).toHaveLength(1); expect(await rechnungen(P)).toHaveLength(1)
      expect(await integritaet(P)).toEqual([])
    })
    it('9.3 Aufmaß wird bei geöffnetem Rechnungsdialog verändert: Abrechnung mit altem Stand wird abgelehnt', async () => {
      const P = await neuesProjekt('E2E Dialog Veraenderung', {})
      const e = neuesZwischenaufmassJePosition([], { stichtag: HEUTE, positionen: [{ bezeichnung: 'Fassadengerüst', einheit: 'm²', einzelpreis: 10, menge: 100 }] }, 'za-d'); if (!e.ok) throw new Error(e.fehler)
      await prj({ id: P, data: { zwischenaufmasse: [e.eintrag] } })
      const liste = normalisiereZwischenaufmasse((await projektData(P)).zwischenaufmasse); const t = baueTeilleistungsPositionen(liste[0], liste); const stand = aufmassStand(liste[0])
      const geaendert = { ...(await projektData(P)).zwischenaufmasse[0], positionen: [{ ...liste[0].positionen![0], menge: 120 }], flaecheM2: 120 }
      expect((await prj({ id: P, data: { zwischenaufmasse: [geaendert] } })).status).toBe(200)
      const r = await inv('POST', { customer_name: KUNDE, project_id: P, invoice_type: 'abschlag', positions: t.positionen, aufmass: { za_id: 'za-d', stand } })
      merke('9 Parallel', 'Dialog mit veraltetem Aufmaßstand', 'AUFMASS_GEAENDERT', r.j?.code); expect(r.status).toBe(409); expect(r.j.code).toBe('AUFMASS_GEAENDERT')
      expect(await rechnungen(P)).toHaveLength(0)
    })
    it('9.4 Storno und neue Abrechnung gleichzeitig: nie zwei gültige Rechnungen für dieselbe Aufmaßmenge', async () => {
      for (let runde = 0; runde < 4; runde++) {
        const P = await neuesProjekt('E2E Parallel Storno ' + runde, {})
        const a = (await aufmassRechnung(P, 'za-s')).j.invoice
        const liste = normalisiereZwischenaufmasse((await projektData(P)).zwischenaufmasse)
        const t = { positionen: [{ bezeichnung: 'Fassadengerüst – Zwischenaufmaß ZA-01 vom x: kumuliert 100 m² abzüglich bereits abgerechnet 0 m²', menge: 100, einheit: 'm²', einzelpreis: 10 }] }
        const [s, n, n2] = await Promise.all([storno(a.id), aufmassRechnung(P, 'za-s'), inv('POST', { customer_name: KUNDE, project_id: P, invoice_type: 'abschlag', positions: t.positionen, aufmass: { za_id: 'za-s', stand: aufmassStand(liste[0]) } })])
        void s; void n; void n2
        const rs = await rechnungen(P); const gueltig = rs.filter((r) => r.status !== 'storniert')
        merke('9 Parallel', 'Storno ∥ neue Abrechnung (Runde ' + (runde + 1) + '): gültige Rechnungen für ZA', '≤ 1', gueltig.length, gueltig.length <= 1)
        expect(gueltig.length).toBeLessThanOrEqual(1)
        const refs = ((await projektData(P)).zwischenaufmasse || []).filter((z: any) => z.rechnungId).map((z: any) => z.rechnungId)
        for (const ref of refs) expect(rs.some((r) => r.id === ref)).toBe(true)
        expect(await integritaet(P)).toEqual([])
      }
    })
  })

  // ──────────────────────────────────────────────────────────
  // Ergebnisbericht
  // ──────────────────────────────────────────────────────────
  it('Bericht: erwartet = tatsächlich in allen dokumentierten Fällen', () => {
    const falsch = bericht.filter((b) => !b.ok)
    if (falsch.length) console.log('ABWEICHUNGEN:\n' + falsch.map((b) => `${b.abschnitt} | ${b.fall}: erwartet ${b.erwartet}, tatsächlich ${b.tatsaechlich}`).join('\n'))
    expect(falsch).toEqual([])
  })
})
