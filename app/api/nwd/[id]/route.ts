import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth'
import { validiere, uuid } from '@/lib/validation'
import { apsKonfig, uploadAbschliessen, uebersetze, urnVon } from '@/lib/nwd/aps'
import { ergebnisEntfernen, fehlerAus, fehlschlag, fuehreWeiter, raeumeAuf, standardAbhaengigkeiten, type NwdJob } from '@/lib/nwd/job'
import { ergebnisUrl } from '@/lib/nwd/zugang'

// NWD-Konvertierung, Schritte 2–4 (alle nur für den Besitzer des Auftrags):
//   POST   Upload ist bei Autodesk angekommen → Übersetzung starten
//   GET    Stand abfragen (treibt den Ablauf voran; der Browser fragt alle 20 s)
//   DELETE Ergebnisdatei und Reste aufräumen (nachdem der Browser sie gelesen hat)
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

function antwort(j: NwdJob) {
  return {
    success: true, id: j.id, status: j.status, stufe: j.stufe, fortschritt: j.fortschritt,
    ...(j.status === 'fertig' && j.ergebnis_pfad ? { ergebnisUrl: ergebnisUrl(j.ergebnis_pfad), format: j.ergebnis_format } : {}),
    ...(j.status === 'fehler' ? { fehler: j.fehler_text, fehlerCode: j.fehler_code } : {}),
  }
}

async function eigenerJob(ctx: Ctx, userId: string) {
  const id = uuid.safeParse((await ctx.params).id)
  if (!id.success) return null
  const job = await standardAbhaengigkeiten().speicher.holen(id.data)
  return job && job.user_id === userId ? job : null
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth()
  if (!auth) return unauthorizedResponse()
  try {
    const v = validiere(z.object({ uploadKey: z.string().min(1).max(2000) }), await req.json().catch(() => null))
    if (!v.ok) return v.response
    const job = await eigenerJob(ctx, auth.userId)
    if (!job) return NextResponse.json({ success: false, error: 'Auftrag nicht gefunden.' }, { status: 404 })
    if (job.status !== 'upload') return NextResponse.json(antwort(job))
    const d = standardAbhaengigkeiten()
    const konfig = apsKonfig()
    if (!konfig || !job.aps_objekt) return NextResponse.json({ success: false, error: 'Die Autodesk-Anbindung ist nicht eingerichtet.' }, { status: 503 })
    // Nur einmal starten, auch bei doppeltem Klick
    const gewonnen = await d.speicher.aendern(job.id, { status: 'konvertierung', stufe: 'svf', gestartet_am: new Date().toISOString(), fortschritt: 'Warten auf die Autodesk-Cloud …' }, { status: 'upload' })
    if (!gewonnen) return NextResponse.json(antwort((await d.speicher.holen(job.id)) ?? job))
    try {
      const { objectId } = await uploadAbschliessen(konfig, job.aps_objekt, v.data.uploadKey)
      const urn = urnVon(objectId)
      await d.speicher.aendern(job.id, { aps_urn: urn })
      await uebersetze(konfig, urn, 'svf')
      return NextResponse.json(antwort({ ...job, status: 'konvertierung', stufe: 'svf', aps_urn: urn, fortschritt: 'Warten auf die Autodesk-Cloud …' }))
    } catch (e) {
      const f = fehlerAus(e)
      const neu = await fehlschlag({ ...job, status: 'konvertierung', stufe: 'svf' }, d, f.code, f.text)
      return NextResponse.json(antwort(neu))
    }
  } catch (e) {
    return serverErrorResponse(e)
  }
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth()
  if (!auth) return unauthorizedResponse()
  try {
    const job = await eigenerJob(ctx, auth.userId)
    if (!job) return NextResponse.json({ success: false, error: 'Auftrag nicht gefunden.' }, { status: 404 })
    const neu = job.status === 'konvertierung' ? await fuehreWeiter(job, standardAbhaengigkeiten()) : job
    return NextResponse.json(antwort(neu))
  } catch (e) {
    return serverErrorResponse(e)
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth()
  if (!auth) return unauthorizedResponse()
  try {
    const job = await eigenerJob(ctx, auth.userId)
    if (!job) return NextResponse.json({ success: false, error: 'Auftrag nicht gefunden.' }, { status: 404 })
    const d = standardAbhaengigkeiten()
    await ergebnisEntfernen(job, d)
    await raeumeAuf(job, d)
    if (job.status === 'konvertierung' || job.status === 'upload') await d.speicher.aendern(job.id, { status: 'fehler', fehler_code: 'abgebrochen', fehler_text: 'Abgebrochen.' })
    return NextResponse.json({ success: true })
  } catch (e) {
    return serverErrorResponse(e)
  }
}
