import { NextRequest, NextResponse } from 'next/server'
import { fuehreWeiter, standardAbhaengigkeiten } from '@/lib/nwd/job'
import { geheimnisGleich } from '@/lib/nwd/zugang'

// Webhook von Autodesk („Übersetzung fertig“). Optionaler Beschleuniger: Der Browser fragt ohnehin alle 20 s nach.
// Absicherung: gemeinsames Geheimnis APS_WEBHOOK_SECRET, entweder im Header `x-nwd-secret` oder als `?token=`
// in der registrierten Webhook-Adresse. Der Inhalt der Nachricht wird NICHT geglaubt: er liefert nur die URN,
// den Stand holen wir selbst bei Autodesk (fuehreWeiter fragt das Manifest ab).
export const maxDuration = 60

function findeUrn(x: unknown, tiefe = 0): string | null {
  if (!x || typeof x !== 'object' || tiefe > 4) return null
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (/^(urn|resourceUrn)$/i.test(k) && typeof v === 'string' && v) return v
    const r = findeUrn(v, tiefe + 1)
    if (r) return r
  }
  return null
}

export async function POST(req: NextRequest) {
  const erwartet = process.env.APS_WEBHOOK_SECRET
  if (!erwartet) return NextResponse.json({ success: false, error: 'Webhook nicht konfiguriert.' }, { status: 503 })
  const erhalten = req.headers.get('x-nwd-secret') ?? new URL(req.url).searchParams.get('token')
  if (!geheimnisGleich(erhalten, erwartet)) return NextResponse.json({ success: false, error: 'Nicht berechtigt.' }, { status: 401 })
  try {
    const urn = findeUrn(await req.json().catch(() => null))
    if (!urn) return NextResponse.json({ success: true, hinweis: 'keine URN' })
    const d = standardAbhaengigkeiten()
    const job = await d.speicher.perUrn(urn)
    if (job) await fuehreWeiter(job, d)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[NWD-Webhook]', e)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
