import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { kiRateLimitPruefen } from '@/lib/rate-limit'
import { kiFetchMitRetry, KI_UEBERLASTET_MELDUNG } from '@/lib/ki-fetch'
import { pruefeZaehlAntwort } from '@/lib/ki-zaehlen'

// ============================================================
// SCAFFOLD OS – KI-Lagererfassung, Paket 2: Rückgabe-Foto zählen (Rollen wie die Rückgabe: Admin, Disposition, Lager, Bauleiter)
//
// POST { bild: "data:image/jpeg;base64,…", artikel: [{ name, einheit? }] } → { zaehlung: [{ nr, anzahl, sicherheit }], hinweis }
// Die KI zählt nur Artikel aus der übergebenen Liste (laut Buchung auf der Baustelle). Es wird nichts gespeichert und nichts gebucht.
// Die Zuordnung Nummer → Artikel und die Prüfung gegen die Menge vor Ort macht der Browser/die Rückgabe-Route.
// ============================================================

const BILD_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/
const MAX_ZEICHEN = 5_500_000

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.LAGER)
  if (!r.ok) return r.response
  try {
    const rl = await kiRateLimitPruefen(req, r.userId)
    if (!rl.ok) return rl.response
    const body = await req.json().catch(() => ({}))
    const bild = typeof body?.bild === 'string' ? body.bild : ''
    if (!BILD_RE.test(bild)) return NextResponse.json({ success: false, error: 'Bitte ein Foto (JPEG, PNG oder WebP) hochladen.' }, { status: 400 })
    if (bild.length > MAX_ZEICHEN) return NextResponse.json({ success: false, error: 'Das Foto ist zu groß.' }, { status: 413 })
    const liste = Array.isArray(body?.artikel) ? body.artikel.slice(0, 60) : []
    const namen: string[] = liste.map((a: unknown) => {
      const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>
      return typeof o.name === 'string' ? o.name.trim().slice(0, 100) : ''
    })
    if (namen.length === 0 || namen.some((n) => !n)) return NextResponse.json({ success: false, error: 'Artikelliste fehlt oder ist unvollständig.' }, { status: 400 })

    const apiKey = process.env.KI_API_KEY
    if (!apiKey) return NextResponse.json({ success: false, error: 'KI_API_KEY fehlt (Vercel → Environment Variables).' }, { status: 400 })
    const baseUrl = process.env.KI_BASE_URL || 'https://api.openai.com/v1'
    const model = process.env.KI_VISION_MODEL || 'mistral-small-2506'

    const prompt = `Auf dem Foto liegt zurückgebrachtes Gerüstmaterial (Stangen, Rahmen, Beläge, Diagonalen, Geländer usw.). Zähle, wie viele Stück von jedem Artikel der folgenden nummerierten Liste du auf dem Foto SIEHST:
${namen.map((n, i) => `${i + 1}. ${n}`).join('\n')}
Antworte AUSSCHLIESSLICH als JSON: {"zaehlung": [{"nr": <Nummer>, "anzahl": <ganze Zahl oder null>, "sicherheit": "hoch" | "mittel" | "niedrig"}], "hinweis": "<kurz, z. B. Foto unscharf oder Stapel verdeckt, sonst null>"}
Regeln: Nur Artikel aus der Liste, kein anderer Artikel. Zähle nur, was sichtbar ist, schätze nichts Verdecktes dazu. Ist ein Artikel nicht zu sehen oder nicht sicher zu unterscheiden: anzahl null. Stapel, bei denen du nicht einzeln zählen kannst: sicherheit "niedrig". Kein Text außerhalb des JSON.`

    const kiRes = await kiFetchMitRetry(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: bild } }] }], temperature: 0, max_tokens: 1500, response_format: { type: 'json_object' } }),
    })
    if (!kiRes.ok) {
      if (kiRes.status === 429) return NextResponse.json({ success: false, error: KI_UEBERLASTET_MELDUNG }, { status: 429 })
      return NextResponse.json({ success: false, error: `KI-Fehler (${kiRes.status}). Ist ein Bild-Modell (KI_VISION_MODEL) eingestellt?` }, { status: 502 })
    }
    const raw = (await kiRes.json()).choices?.[0]?.message?.content?.trim()
    if (!raw) return NextResponse.json({ success: false, error: 'Die KI hat keine Antwort geliefert.' }, { status: 502 })
    let roh: unknown
    try { roh = JSON.parse(raw) } catch { return NextResponse.json({ success: false, error: 'Die KI-Antwort war nicht lesbar. Bitte ein schärferes Foto versuchen.' }, { status: 502 }) }
    const e = pruefeZaehlAntwort(roh, namen.length)
    return NextResponse.json({ success: true, ...e }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) { return serverErrorResponse(err, 'ki-lager-zaehlen POST') }
}
