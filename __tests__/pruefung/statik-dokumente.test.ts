import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  darfSchrittSetzen, dateiErlaubt, sauberDateiname, speicherPfadOk, werktageVor, fristHinweis, endung, MAX_DATEI_BYTES,
} from '@/lib/statik-dokumente'

const h = vi.hoisted(() => ({ signiert: [] as string[], signFehler: false }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => ({ createSignedUploadUrl: async (p: string) => { h.signiert.push(p); return h.signFehler ? { data: null, error: { message: 'kaputt' } } : { data: { token: 'tok', path: p }, error: null } } }) } }),
}))
import { aktionSchema, fuehreStatikAktionAus, ladeDokumente, StatikFehler, type Kontext } from '@/lib/statik-dokumente-server'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
const P = '11111111-1111-4111-8111-111111111111'
const U1 = '22222222-2222-4222-8222-222222222222'
const U2 = '33333333-3333-4333-8333-333333333333'
const buero: Kontext = { absender: 'buero', userId: U1, projectId: P }
const statiker: Kontext = { absender: 'statiker', userId: U2, projectId: P }

describe('Statik-Dokumente: Regeln', () => {
  it('Dateitypen: erlaubt PDF/IFC/…, verboten ausführbare und doppelte Endungen', () => {
    for (const n of ['a.pdf', 'B.IFC', 'x.dwg', 'plan.DXF', 'f.jpeg', 'l.xlsx']) expect(dateiErlaubt(n)).toBe(true)
    for (const n of ['a.exe', 'a.html', 'a.svg', 'a.js', 'a', 'a.pdf.exe', '']) expect(dateiErlaubt(n)).toBe(false)
    expect(endung('Plan.v2.PDF')).toBe('pdf')
  })
  it('Dateiname: ohne Pfad und Steuerzeichen, gekürzt', () => {
    expect(sauberDateiname('C:\\Users\\x\\Plan 1.pdf')).toBe('Plan 1.pdf')
    expect(sauberDateiname('../../etc/passwd')).toBe('passwd')
    expect(sauberDateiname('a\u0000b\nc.pdf')).toBe('abc.pdf')
    expect(sauberDateiname('x'.repeat(500) + '.pdf').length).toBe(200)
    expect(sauberDateiname('///')).toBe('Datei')
  })
  it('Speicherpfad gehört zum Projekt und ist harmlos', () => {
    expect(speicherPfadOk(P, `projects/${P}/statik/123_abc.pdf`)).toBe(true)
    expect(speicherPfadOk(P, `projects/${U1}/statik/123_abc.pdf`)).toBe(false)
    expect(speicherPfadOk(P, `projects/${P}/statik/../vertraege/x.pdf`)).toBe(false)
    expect(speicherPfadOk(P, `projects/${P}/statik/a/b.pdf`)).toBe(false)
    expect(speicherPfadOk(P, `projects/${P}/statik/x.exe`)).toBe(false)
  })
  it('Rechte für Schritte: Büro alles, Statiker nur Konformität und Bescheinigung', () => {
    for (const f of ['montagebeginn', 'eingereicht', 'freigegeben', 'konformitaet', 'bescheinigung'] as const) expect(darfSchrittSetzen('buero', f)).toBe(true)
    expect(darfSchrittSetzen('statiker', 'konformitaet')).toBe(true)
    expect(darfSchrittSetzen('statiker', 'bescheinigung')).toBe(true)
    for (const f of ['montagebeginn', 'eingereicht', 'freigegeben'] as const) expect(darfSchrittSetzen('statiker', f)).toBe(false)
  })
})

describe('Statik-Dokumente: Frist', () => {
  it('10 Werktage (Mo–Fr) zurückrechnen', () => {
    expect(werktageVor('2026-11-23', 10)).toBe('2026-11-09') // Montag → zwei Wochen vorher
    expect(werktageVor('2026-11-25', 10)).toBe('2026-11-11') // Mittwoch → Mittwoch zwei Wochen vorher
    expect(werktageVor('2026-11-22', 10)).toBe('2026-11-09') // Sonntag: zählt rückwärts wie der Montag
    expect(werktageVor('kein datum', 10)).toBeNull()
  })
  it('Hinweis je Lage', () => {
    expect(fristHinweis(null, '2026-11-10').stufe).toBe('grau')
    const fruehe = fristHinweis({ montagebeginn: '2026-12-21' }, '2026-11-10')
    expect(fruehe.stufe).toBe('gelb'); expect(fruehe.text).toContain('spätestens bis')
    expect(fristHinweis({ montagebeginn: '2026-11-20' }, '2026-11-10').stufe).toBe('rot') // Frist (06.11.) schon vorbei
    expect(fristHinweis({ montagebeginn: '2026-11-20', eingereicht_am: '2026-11-05' }, '2026-11-10').stufe).toBe('gelb')
    expect(fristHinweis({ montagebeginn: '2026-11-20', eingereicht_am: '2026-11-05', freigegeben_am: '2026-11-08' }, '2026-11-10').stufe).toBe('gruen')
    expect(fristHinweis({ montagebeginn: '2026-11-10', eingereicht_am: '2026-11-01' }, '2026-11-10').stufe).toBe('rot') // Montagetag ohne Freigabe
  })
})

describe('Statik-Dokumente: Server-Aktionen', () => {
  let db: { dok: Record<string, unknown>[]; status: Record<string, unknown>[]; geloescht: string[] }
  beforeEach(() => {
    h.signiert = []; h.signFehler = false
    db = { dok: [], status: [], geloescht: [] }
    vi.stubGlobal('fetch', vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
      const url = String(u), m = init?.method || 'GET'
      if (url.includes('/storage/v1/object/') && m === 'DELETE') { db.geloescht.push(url); return new Response('{}') }
      if (url.includes('/rest/v1/statik_dokumente')) {
        if (m === 'POST') { db.dok.push({ id: `d${db.dok.length + 1}`, ...JSON.parse(String(init!.body)) }); return new Response('', { status: 201 }) }
        if (m === 'DELETE') { const id = /[?&]id=eq\.([^&]+)/.exec(url)![1]; db.dok = db.dok.filter((d) => d.id !== id); return new Response('') }
        const id = /[?&]id=eq\.([^&]+)/.exec(url)?.[1]
        return new Response(JSON.stringify(id ? db.dok.filter((d) => d.id === id) : db.dok))
      }
      if (url.includes('/rest/v1/statik_status')) {
        if (m === 'POST') { const b = JSON.parse(String(init!.body)); const z = db.status[0]; if (z) Object.assign(z, b); else db.status.push(b); return new Response('', { status: 201 }) }
        return new Response(JSON.stringify(db.status))
      }
      return new Response('[]', { status: 404 })
    }))
  })

  it('Eingabeprüfung der Aktionen', () => {
    expect(aktionSchema.safeParse({ aktion: 'upload-url', file_name: 'a.pdf', size: 10 }).success).toBe(true)
    expect(aktionSchema.safeParse({ aktion: 'upload-url', file_name: 'a.pdf', size: 0 }).success).toBe(false)
    expect(aktionSchema.safeParse({ aktion: 'eintragen', path: 'x', file_name: 'a.pdf', art: 'quatsch' }).success).toBe(false)
    expect(aktionSchema.safeParse({ aktion: 'status', feld: 'sonstwas', datum: '2026-11-10' }).success).toBe(false)
    expect(aktionSchema.safeParse({ aktion: 'status', feld: 'freigegeben', datum: 'morgen' }).success).toBe(false)
    expect(aktionSchema.safeParse({ aktion: 'status', feld: 'freigegeben', datum: null }).success).toBe(true)
  })
  it('Upload-Link: nur erlaubte Typen und Größen, Pfad liegt im Projekt', async () => {
    const r = await fuehreStatikAktionAus(statiker, { aktion: 'upload-url', file_name: 'Statik.IFC', size: 1000 })
    expect(speicherPfadOk(P, r.path as string)).toBe(true); expect(r.token).toBe('tok')
    await expect(fuehreStatikAktionAus(statiker, { aktion: 'upload-url', file_name: 'virus.exe', size: 10 })).rejects.toMatchObject({ status: 400 })
    await expect(fuehreStatikAktionAus(statiker, { aktion: 'upload-url', file_name: 'a.pdf', size: MAX_DATEI_BYTES + 1 })).rejects.toMatchObject({ status: 413 })
    h.signFehler = true
    await expect(fuehreStatikAktionAus(statiker, { aktion: 'upload-url', file_name: 'a.pdf', size: 10 })).rejects.toThrow('kaputt')
  })
  it('Eintragen: fremder Pfad wird abgelehnt, eigener gespeichert mit Absender', async () => {
    await expect(fuehreStatikAktionAus(statiker, { aktion: 'eintragen', path: `projects/${U1}/statik/x.pdf`, file_name: 'x.pdf', art: 'berechnung' })).rejects.toMatchObject({ status: 400 })
    await fuehreStatikAktionAus(statiker, { aktion: 'eintragen', path: `projects/${P}/statik/1_a.pdf`, file_name: '../x.pdf', art: 'berechnung', notiz: '  Rev. B ' })
    expect(db.dok[0]).toMatchObject({ project_id: P, art: 'berechnung', file_name: 'x.pdf', notiz: 'Rev. B', hochgeladen_von_rolle: 'statiker', hochgeladen_von: U2 })
  })
  it('Löschen: Büro alles, Statiker nur eigene; Datei im Speicher wird mitentfernt', async () => {
    await fuehreStatikAktionAus(buero, { aktion: 'eintragen', path: `projects/${P}/statik/1_a.pdf`, file_name: 'a.pdf', art: 'entwurfsplan' })
    await fuehreStatikAktionAus(statiker, { aktion: 'eintragen', path: `projects/${P}/statik/2_b.pdf`, file_name: 'b.pdf', art: 'berechnung' })
    await expect(fuehreStatikAktionAus(statiker, { aktion: 'loeschen', id: 'd1' })).rejects.toMatchObject({ status: 403 })
    await fuehreStatikAktionAus(statiker, { aktion: 'loeschen', id: 'd2' })
    expect(db.geloescht).toHaveLength(1)
    await fuehreStatikAktionAus(buero, { aktion: 'loeschen', id: 'd1' })
    expect(db.dok).toHaveLength(0)
    await expect(fuehreStatikAktionAus(buero, { aktion: 'loeschen', id: 'd1' })).rejects.toMatchObject({ status: 404 })
  })
  it('Schritte: Statiker darf Freigabe/Einreichung/Montagebeginn nicht setzen, Büro schon', async () => {
    for (const feld of ['freigegeben', 'eingereicht', 'montagebeginn']) {
      await expect(fuehreStatikAktionAus(statiker, { aktion: 'status', feld, datum: '2026-11-10' })).rejects.toBeInstanceOf(StatikFehler)
    }
    await fuehreStatikAktionAus(statiker, { aktion: 'status', feld: 'bescheinigung', datum: '2026-11-10' })
    await fuehreStatikAktionAus(buero, { aktion: 'status', feld: 'freigegeben', datum: '2026-11-09' })
    expect(db.status[0]).toMatchObject({ bescheinigung_am: '2026-11-10', freigegeben_am: '2026-11-09' })
    await fuehreStatikAktionAus(buero, { aktion: 'status', feld: 'freigegeben', datum: null })
    expect(db.status[0].freigegeben_am).toBeNull()
  })
  it('Laden liefert Dateien mit Link und Status', async () => {
    await fuehreStatikAktionAus(buero, { aktion: 'eintragen', path: `projects/${P}/statik/1_a.pdf`, file_name: 'a.pdf', art: 'entwurfsplan' })
    const r = await ladeDokumente(P)
    expect((r.dokumente[0] as { url: string }).url).toBe(`http://db.test/storage/v1/object/public/project-media/projects/${P}/statik/1_a.pdf`)
    expect(r.status).toBeNull()
  })
})
