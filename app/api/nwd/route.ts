import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth'
import { validiere } from '@/lib/validation'
import { apsKonfig, signierteUploadUrl, ApsFehler } from '@/lib/nwd/aps'
import { NWD_MAX_BYTES, FALLBACK_HINWEIS, fehlerAus, raeumeAltesAuf, standardAbhaengigkeiten, startePruefung } from '@/lib/nwd/job'
import { darfNwdKonvertieren } from '@/lib/nwd/zugang'

// NWD-Konvertierung, Schritt 1: Auftrag anlegen + Einmal-Adresse für den Direkt-Upload zu Autodesk.
// (Die Datei geht NICHT durch Vercel: dort ist der Request auf 4,5 MB begrenzt, NWD-Dateien sind deutlich größer.)
export const maxDuration = 30

const schema = z.object({
  dateiname: z.string().trim().min(1).max(200).refine((n) => /\.nwd$/i.test(n), 'Nur .nwd-Dateien.'),
  bytes: z.number().int().positive('Die Datei ist leer.').max(NWD_MAX_BYTES, 'Die Datei ist größer als 200 MB. Bitte als IFC/OBJ exportieren.'),
})

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorizedResponse()
  try {
    if (!(await darfNwdKonvertieren(auth.userId))) return NextResponse.json({ success: false, error: 'Dafür fehlt die Berechtigung (CAD-Bereich).' }, { status: 403 })
    const v = validiere(schema, await req.json().catch(() => null))
    if (!v.ok) return v.response
    const konfig = apsKonfig()
    if (!konfig) return NextResponse.json({ success: false, error: `Die NWD-Konvertierung ist auf diesem System nicht eingerichtet (Autodesk-Zugang fehlt). ${FALLBACK_HINWEIS}` }, { status: 503 })

    const d = standardAbhaengigkeiten()
    const limit = await startePruefung(auth.userId, d)
    if (!limit.ok) return NextResponse.json({ success: false, error: limit.meldung, grund: limit.grund }, { status: 429, headers: limit.warteSekunden ? { 'Retry-After': String(limit.warteSekunden) } : undefined })

    await raeumeAltesAuf(d).catch(() => 0)
    const objekt = `nwd-${randomUUID()}.nwd`
    const job = await d.speicher.anlegen({ user_id: auth.userId, dateiname: v.data.dateiname, bytes: v.data.bytes, aps_objekt: objekt })
    try {
      const { uploadKey, url } = await signierteUploadUrl(konfig, objekt)
      return NextResponse.json({ success: true, id: job.id, uploadUrl: url, uploadKey })
    } catch (e) {
      const f = fehlerAus(e)
      await d.speicher.aendern(job.id, { status: 'fehler', fehler_code: f.code, fehler_text: f.text, aufgeraeumt: true })
      return NextResponse.json({ success: false, error: f.text }, { status: e instanceof ApsFehler && e.code === 'kontingent' ? 429 : 502 })
    }
  } catch (e) {
    return serverErrorResponse(e)
  }
}
