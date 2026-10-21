import { describe, it, expect, vi } from 'vitest'
import { fuehreWeiter, limitPruefen, tageslimit, tagesbeginnBerlin, startePruefung, raeumeAltesAuf, NWD_WARTEZEIT_MS, type Abhaengigkeiten, type JobSpeicher, type NwdJob } from '../job'
import { ApsFehler, type ApsKonfig } from '../aps'

const K: ApsKonfig = { clientId: 'i', clientSecret: 's', bucket: 'b' }
const T0 = Date.parse('2026-10-21T10:00:00Z')

function neuerJob(teil: Partial<NwdJob> = {}): NwdJob {
  return { id: 'j1', user_id: 'u1', dateiname: 'a.nwd', bytes: 1000, status: 'konvertierung', stufe: 'svf', aps_objekt: 'obj.nwd', aps_urn: 'URN', fortschritt: null, ergebnis_pfad: null, ergebnis_format: null, fehler_code: null, fehler_text: null, erstellt_am: new Date(T0).toISOString(), gestartet_am: new Date(T0).toISOString(), fertig_am: null, aufgeraeumt: false, ...teil }
}

function umgebung(job: NwdJob, manifestWert: unknown | (() => unknown), jetzt = { t: T0 + 30_000 }) {
  const jobs = new Map<string, NwdJob>([[job.id, { ...job }]])
  const speicher: JobSpeicher = {
    anlegen: vi.fn(), perUrn: vi.fn(async (u) => [...jobs.values()].find((j) => j.aps_urn === u) ?? null),
    holen: vi.fn(async (id) => jobs.get(id) ?? null),
    aendern: vi.fn(async (id, patch, nur) => { const j = jobs.get(id); if (!j) return false; if (nur?.status && j.status !== nur.status) return false; if (nur?.stufe && j.stufe !== nur.stufe) return false; Object.assign(j, patch); return true }),
    letzterStart: vi.fn(async () => null), anzahlSeit: vi.fn(async () => 0), veraltet: vi.fn(async () => []),
  }
  const gespeichert = new Map<string, ArrayBuffer>()
  const aps = {
    manifest: vi.fn(async () => (typeof manifestWert === 'function' ? (manifestWert as () => unknown)() : manifestWert)),
    modellGuid: vi.fn(async () => 'guid-1'), uebersetze: vi.fn(async () => undefined),
    ladeDerivat: vi.fn(async () => new TextEncoder().encode('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n').buffer as ArrayBuffer),
    loescheObjekt: vi.fn(async () => undefined), loescheManifest: vi.fn(async () => undefined),
  }
  const ablage = { speichern: vi.fn(async (p: string, d: ArrayBuffer) => { gespeichert.set(p, d) }), loeschen: vi.fn(async (p: string) => { gespeichert.delete(p) }) }
  const d: Abhaengigkeiten = { speicher, ablage, aps, konfig: K, jetzt: () => jetzt.t }
  return { d, jobs, aps, ablage, gespeichert, jetzt }
}

const SVF = { derivatives: [{ outputType: 'svf', status: 'success', children: [] }], status: 'success' }
const OBJ = { status: 'success', derivatives: [SVF.derivatives[0], { outputType: 'obj', status: 'success', children: [{ role: 'obj', urn: 'urn:x/geo.obj' }] }] }

describe('Job-Lebenszyklus', () => {
  it('Stufe 1 fertig → Stufe 2 (OBJ) wird gestartet', async () => {
    const e = umgebung(neuerJob(), SVF)
    const r = await fuehreWeiter(neuerJob(), e.d)
    expect(r.stufe).toBe('obj')
    expect(e.aps.uebersetze).toHaveBeenCalledWith(K, 'URN', 'obj', 'guid-1')
    expect(e.jobs.get('j1')?.stufe).toBe('obj')
    expect(e.jobs.get('j1')?.status).toBe('konvertierung')
  })

  it('Stufe 2 fertig → Ergebnis gespeichert, Job fertig, Autodesk-Reste gelöscht', async () => {
    const j = neuerJob({ stufe: 'obj' })
    const e = umgebung(j, OBJ)
    const r = await fuehreWeiter(j, e.d)
    expect(r.status).toBe('fertig')
    expect(r.ergebnis_pfad).toBe('nwd/j1.obj')
    expect(r.ergebnis_format).toBe('obj')
    expect(e.gespeichert.has('nwd/j1.obj')).toBe(true)
    expect(e.aps.loescheObjekt).toHaveBeenCalledWith(K, 'obj.nwd')
    expect(e.aps.loescheManifest).toHaveBeenCalledWith(K, 'URN')
    expect(e.jobs.get('j1')?.aufgeraeumt).toBe(true)
  })

  it('läuft noch → Fortschritt gemerkt, nichts passiert sonst', async () => {
    const e = umgebung(neuerJob(), { status: 'inprogress', derivatives: [{ outputType: 'svf', status: 'inprogress', progress: '40% complete' }] })
    const r = await fuehreWeiter(neuerJob(), e.d)
    expect(r.status).toBe('konvertierung')
    expect(r.fortschritt).toContain('40')
    expect(e.aps.uebersetze).not.toHaveBeenCalled()
  })

  it('zwei gleichzeitige Aufrufer (Browser + Webhook) starten Stufe 2 nur einmal', async () => {
    const e = umgebung(neuerJob(), SVF)
    await Promise.all([fuehreWeiter(neuerJob(), e.d), fuehreWeiter(neuerJob(), e.d)])
    expect(e.aps.uebersetze).toHaveBeenCalledTimes(1)
  })

  it('zwei gleichzeitige Aufrufer speichern das Ergebnis nur einmal', async () => {
    const j = neuerJob({ stufe: 'obj' })
    const e = umgebung(j, OBJ)
    await Promise.all([fuehreWeiter(j, e.d), fuehreWeiter(j, e.d)])
    expect(e.ablage.speichern).toHaveBeenCalledTimes(1)
  })

  it('nach 10 Minuten: Fehler mit ehrlicher Meldung und Fallback-Hinweis, aufgeräumt', async () => {
    const e = umgebung(neuerJob(), { status: 'inprogress', derivatives: [{ outputType: 'svf', status: 'inprogress' }] }, { t: T0 + NWD_WARTEZEIT_MS + 1000 })
    const r = await fuehreWeiter(neuerJob(), e.d)
    expect(r.status).toBe('fehler')
    expect(r.fehler_code).toBe('zeitueberschreitung')
    expect(r.fehler_text).toMatch(/10 Minuten/)
    expect(r.fehler_text).toMatch(/IFC oder OBJ/)
    expect(e.aps.loescheObjekt).toHaveBeenCalled()
  })

  it('Autodesk meldet Fehler → verständliche Meldung statt Rohtext allein', async () => {
    const e = umgebung(neuerJob(), { status: 'failed', derivatives: [{ outputType: 'svf', status: 'failed', messages: [{ type: 'error', message: 'Datei defekt' }] }] })
    const r = await fuehreWeiter(neuerJob(), e.d)
    expect(r.status).toBe('fehler')
    expect(r.fehler_text).toContain('Datei defekt')
    expect(r.fehler_text).toContain('IFC oder OBJ')
  })

  it('APS-Kontingent/Quota und Netzfehler → verständliche Meldung', async () => {
    const e = umgebung(neuerJob(), () => { throw new ApsFehler('kontingent', 'x', 429) })
    const r = await fuehreWeiter(neuerJob(), e.d)
    expect(r.fehler_code).toBe('kontingent')
    expect(r.fehler_text).toMatch(/Kontingent/)
    const e2 = umgebung(neuerJob(), () => { throw new ApsFehler('netz', 'x') })
    expect((await fuehreWeiter(neuerJob(), e2.d)).fehler_text).toMatch(/nicht erreichbar/)
  })

  it('zu großes Ergebnis → Meldung nennt die tatsächliche Größe (Eingrenzung im Betrieb)', async () => {
    const j = neuerJob({ stufe: 'obj' })
    const e = umgebung(j, OBJ)
    e.aps.ladeDerivat.mockRejectedValueOnce(new ApsFehler('zu-gross', 'Das Ergebnis ist zu groß (412 MB).'))
    const r = await fuehreWeiter(j, e.d)
    expect(r.fehler_code).toBe('zu-gross')
    expect(r.fehler_text).toContain('412 MB')
  })

  it('kein Modell in der Datei → Fehler, nichts Halbes', async () => {
    const e = umgebung(neuerJob(), SVF)
    e.aps.modellGuid.mockResolvedValueOnce(null as never)
    const r = await fuehreWeiter(neuerJob(), e.d)
    expect(r.status).toBe('fehler')
  })

  it('Ablage-Fehler beim Speichern → Fehler statt hängendem Job', async () => {
    const j = neuerJob({ stufe: 'obj' })
    const e = umgebung(j, OBJ)
    e.ablage.speichern.mockRejectedValueOnce(new Error('Ablage (413)'))
    expect((await fuehreWeiter(j, e.d)).status).toBe('fehler')
  })

  it('Auftrag ohne Status „konvertierung“ bleibt unberührt', async () => {
    const e = umgebung(neuerJob({ status: 'fertig' }), SVF)
    await fuehreWeiter(neuerJob({ status: 'fertig' }), e.d)
    expect(e.aps.manifest).not.toHaveBeenCalled()
  })
})

describe('Kosten-Schutz', () => {
  it('Rate-Limit: 1 pro Minute und Nutzer', () => {
    expect(limitPruefen({ letzterStartMs: T0 - 59_000, jetztMs: T0, tagesAnzahl: 0, limit: 20 })).toMatchObject({ ok: false, grund: 'abstand', warteSekunden: 1 })
    expect(limitPruefen({ letzterStartMs: T0 - 60_000, jetztMs: T0, tagesAnzahl: 0, limit: 20 }).ok).toBe(true)
    expect(limitPruefen({ letzterStartMs: null, jetztMs: T0, tagesAnzahl: 0, limit: 20 }).ok).toBe(true)
  })
  it('Tageslimit je Instanz', () => {
    expect(limitPruefen({ letzterStartMs: null, jetztMs: T0, tagesAnzahl: 20, limit: 20 })).toMatchObject({ ok: false, grund: 'tag' })
    expect(limitPruefen({ letzterStartMs: null, jetztMs: T0, tagesAnzahl: 19, limit: 20 }).ok).toBe(true)
  })
  it('Tageslimit konfigurierbar, Standard 20, Unsinn → Standard', () => {
    expect(tageslimit({})).toBe(20)
    expect(tageslimit({ NWD_TAGESLIMIT: '5' })).toBe(5)
    expect(tageslimit({ NWD_TAGESLIMIT: 'abc' })).toBe(20)
    expect(tageslimit({ NWD_TAGESLIMIT: '0' })).toBe(20)
  })
  it('Tagesbeginn nach Berliner Zeit (Sommer/Winter)', () => {
    expect(tagesbeginnBerlin(new Date('2026-10-21T10:00:00Z'))).toBe('2026-10-20T22:00:00.000Z') // MESZ = UTC+2
    expect(tagesbeginnBerlin(new Date('2026-12-15T10:00:00Z'))).toBe('2026-12-14T23:00:00.000Z') // MEZ = UTC+1
  })
  it('startePruefung nutzt Datenbank-Zähler', async () => {
    const e = umgebung(neuerJob(), SVF, { t: T0 })
    ;(e.d.speicher.anzahlSeit as ReturnType<typeof vi.fn>).mockResolvedValue(3)
    expect((await startePruefung('u1', e.d, { NWD_TAGESLIMIT: '3' })).ok).toBe(false)
    expect((await startePruefung('u1', e.d, { NWD_TAGESLIMIT: '4' })).ok).toBe(true)
  })
  it('altes wird aufgeräumt (Ergebnisdatei + Autodesk-Reste)', async () => {
    const alt = neuerJob({ status: 'fertig', ergebnis_pfad: 'nwd/j1.obj' })
    const e = umgebung(alt, SVF)
    ;(e.d.speicher.veraltet as ReturnType<typeof vi.fn>).mockResolvedValue([alt])
    expect(await raeumeAltesAuf(e.d)).toBe(1)
    expect(e.ablage.loeschen).toHaveBeenCalledWith('nwd/j1.obj')
    expect(e.aps.loescheObjekt).toHaveBeenCalled()
  })
})
