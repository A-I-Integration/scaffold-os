import { describe, it, expect, beforeEach, vi } from 'vitest'
import { baueFakeRest, type Tabellen } from './fake-rest'

// ============================================================
// Kettentest: Mitarbeiter einplanen (Wochenplanung)
// Läuft durch die ECHTE Route /api/wochenplanung gegen einen Nachbau der Datenbank.
// Geprüft: Tageseinsatz, automatische Team-Zuweisung (project_assignments), Aufräumen beim Wechsel/Entfernen,
// mehrtägige Einsätze, Abwesenheiten, Kolonnen-Grenzen des Bauleiters.
// ============================================================

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

const ctx = vi.hoisted(() => ({ rolle: 'admin' }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-bauleiter' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: ctx.rolle } }) }) }) }),
  }),
}))

const MA = '11111111-1111-4111-8111-111111111111'
const BL = '22222222-2222-4222-8222-222222222222'
const FREMD = '33333333-3333-4333-8333-333333333333'
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MONTAG = '2026-11-09'

let db: Tabellen

beforeEach(() => {
  ctx.rolle = 'admin'
  db = {
    employees: [
      { id: MA, user_id: 'x1', kolonne_id: 'k1' },
      { id: BL, user_id: 'user-bauleiter', kolonne_id: 'k1' },
      { id: FREMD, user_id: 'x3', kolonne_id: 'k2' },
    ],
    kolonnen: [{ id: 'k1', bauleiter_id: BL }, { id: 'k2', bauleiter_id: 'anderer' }],
    projects: [{ id: P1, data: { step1: {} } }, { id: P2, data: { step1: {} } }],
    taeglicher_einsatz: [],
    project_assignments: [],
    absences: [],
  }
  vi.stubGlobal('fetch', baueFakeRest(db))
})

async function einplanen(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/wochenplanung/route')
  return POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never)
}
async function entfernen(employee: string, datum: string) {
  const { DELETE } = await import('@/app/api/wochenplanung/route')
  return DELETE(new Request(`http://x/api/wochenplanung?employee_id=${employee}&einsatz_datum=${datum}`, { method: 'DELETE' }) as never)
}
const tage = (projekt?: string) => db.taeglicher_einsatz.filter((e) => !projekt || e.project_id === projekt).map((e) => String(e.einsatz_datum)).sort()
const team = (projekt: string) => db.project_assignments.filter((a) => a.project_id === projekt && a.employee_id === MA)

describe('Kette Mitarbeiter einplanen', () => {
  it('Einplanen: Tageseinsatz entsteht und der Mitarbeiter ist automatisch im Team der Baustelle', async () => {
    const r = await einplanen({ employee_id: MA, einsatz_datum: MONTAG, project_id: P1 })
    expect(r.status).toBe(200)
    expect(tage(P1)).toEqual([MONTAG])
    expect(team(P1)).toHaveLength(1)
    expect(team(P1)[0].rolle).toBe('helfer')
  })

  it('Weitere Tage auf derselben Baustelle legen die Team-Zuweisung nicht doppelt an', async () => {
    await einplanen({ employee_id: MA, einsatz_datum: MONTAG, project_id: P1 })
    await einplanen({ employee_id: MA, einsatz_datum: '2026-11-10', project_id: P1 })
    expect(tage(P1)).toHaveLength(2)
    expect(team(P1)).toHaveLength(1)
  })

  it('Gleicher Tag, andere Baustelle: Einsatz wird ersetzt, alte automatische Zuweisung verschwindet, neue entsteht', async () => {
    await einplanen({ employee_id: MA, einsatz_datum: MONTAG, project_id: P1 })
    await einplanen({ employee_id: MA, einsatz_datum: MONTAG, project_id: P2 })
    expect(db.taeglicher_einsatz).toHaveLength(1)
    expect(tage(P2)).toEqual([MONTAG])
    expect(team(P1)).toHaveLength(0)
    expect(team(P2)).toHaveLength(1)
  })

  it('Von Hand ins Team gesetzte Person bleibt, auch wenn ihr Einsatz wegfällt', async () => {
    db.project_assignments.push({ id: 'pa-hand', project_id: P1, employee_id: MA, rolle: 'vorarbeiter', created_by: 'user-1' })
    await einplanen({ employee_id: MA, einsatz_datum: MONTAG, project_id: P1 })
    await entfernen(MA, MONTAG)
    expect(team(P1)).toHaveLength(1)
    expect(team(P1)[0].rolle).toBe('vorarbeiter')
  })

  it('Entfernen: Einsatz weg, automatische Zuweisung weg – aber nur, wenn kein weiterer Tag auf der Baustelle bleibt', async () => {
    await einplanen({ employee_id: MA, einsatz_datum: MONTAG, project_id: P1 })
    await einplanen({ employee_id: MA, einsatz_datum: '2026-11-10', project_id: P1 })
    await entfernen(MA, MONTAG)
    expect(tage(P1)).toEqual(['2026-11-10'])
    expect(team(P1)).toHaveLength(1)
    await entfernen(MA, '2026-11-10')
    expect(tage()).toEqual([])
    expect(team(P1)).toHaveLength(0)
  })

  it('Bauleiter darf nur Mitarbeiter der eigenen Kolonne einplanen', async () => {
    ctx.rolle = 'bauleiter'
    expect((await einplanen({ employee_id: FREMD, einsatz_datum: MONTAG, project_id: P1 })).status).toBe(403)
    expect(db.taeglicher_einsatz).toHaveLength(0)
    expect((await einplanen({ employee_id: MA, einsatz_datum: MONTAG, project_id: P1 })).status).toBe(200)
  })

  it('Rollen ohne Planungsrecht (z. B. Monteur) werden abgelehnt', async () => {
    ctx.rolle = 'monteur'
    expect((await einplanen({ employee_id: MA, einsatz_datum: MONTAG, project_id: P1 })).status).toBe(403)
    expect((await entfernen(MA, MONTAG)).status).toBe(403)
  })

  it('Ungültige Eingabe (keine UUID, kein Datum) wird abgelehnt', async () => {
    expect((await einplanen({ employee_id: 'abc', einsatz_datum: MONTAG, project_id: P1 })).status).toBe(400)
    expect((await einplanen({ employee_id: MA, einsatz_datum: 'morgen', project_id: P1 })).status).toBe(400)
  })

  it('Mehrtägige Baustelle (Dauer in Wochen) trägt Mo–Fr ein und überspringt das Wochenende', async () => {
    db.projects[0].data = { step1: { dauer: '1' } }
    await einplanen({ employee_id: MA, einsatz_datum: MONTAG, project_id: P1 })
    expect(tage(P1)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'])
  })

  // --- früher gefundene Lücken (behoben) -------------------------------

  it('Baustelle von Mo 09.11. bis Fr 20.11. ergibt genau 10 Werktage (heute werden Kalendertage als Werktage gezählt und es geht über das Projektende hinaus)', async () => {
    db.projects[0].data = { step1: { projektende: '2026-11-20' } }
    await einplanen({ employee_id: MA, einsatz_datum: MONTAG, project_id: P1 })
    const t = tage(P1)
    expect(t).toHaveLength(10)
    expect(t[t.length - 1]).toBe('2026-11-20')
  })

  it('Baustelle von Mo 09.11. bis Fr 13.11. enthält auch den Endtag (heute fehlt der Freitag)', async () => {
    db.projects[0].data = { step1: { projektende: '2026-11-13' } }
    await einplanen({ employee_id: MA, einsatz_datum: MONTAG, project_id: P1 })
    expect(tage(P1)).toContain('2026-11-13')
  })

  it('Genehmigter Urlaub wird beim mehrtägigen Einplanen übersprungen', async () => {
    db.projects[0].data = { step1: { dauer: '1' } }
    db.absences.push({ id: 'a1', employee_id: MA, type: 'vacation', status: 'approved', start_date: '2026-11-11', end_date: '2026-11-11' })
    await einplanen({ employee_id: MA, einsatz_datum: MONTAG, project_id: P1 })
    expect(tage(P1)).not.toContain('2026-11-11')
  })

  it('Einzel-Einplanung an einem Urlaubs- oder Krankheitstag wird vom Server abgelehnt (heute sperrt nur die Oberfläche)', async () => {
    db.absences.push({ id: 'a1', employee_id: MA, type: 'sick', status: 'pending', start_date: MONTAG, end_date: MONTAG })
    const r = await einplanen({ employee_id: MA, einsatz_datum: MONTAG, project_id: P1 })
    expect(r.status).toBe(409)
    expect(db.taeglicher_einsatz).toHaveLength(0)
  })

  it('Mehrtägiges Einplanen überschreibt keine Einsätze auf einer anderen Baustelle', async () => {
    db.projects[0].data = { step1: { dauer: '1' } }
    await einplanen({ employee_id: MA, einsatz_datum: '2026-11-11', project_id: P2 })
    await einplanen({ employee_id: MA, einsatz_datum: MONTAG, project_id: P1 })
    expect(tage(P2)).toEqual(['2026-11-11'])
  })
})
