import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { kiRateLimitPruefen } from '@/lib/rate-limit'
import { kiFetchMitRetry, KI_UEBERLASTET_MELDUNG } from '@/lib/ki-fetch'
import { findeArtikel, pruefeLagerAntwort, type ArtikelKurz } from '@/lib/ki-lager'

// ============================================================
// SCAFFOLD OS – KI-Lagererfassung, Paket 1: Lieferschein-Foto lesen (nur Admin/Disposition)
//
// POST { bild: "data:image/jpeg;base64,…" } → { belegnummer, positionen: [{ gelesen, treffer }] }
// Die KI liest nur Zeilen vom Beleg. Es wird nichts gespeichert und nichts gebucht. Der Abgleich mit dem Artikelstamm
// läuft hier lokal. Gebucht wird erst, wenn der Nutzer bestätigt (POST /api/lager/buchen).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { apikey: key, Authorization: `Bearer ${key}` }
const BILD_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/
const MAX_ZEICHEN = 5_500_000 // ca. 4 MB Bild; der Browser verkleinert vorher

const PROMPT = `Du liest einen Lieferschein oder eine Warenliste aus einem Foto. Antworte AUSSCHLIESSLICH als JSON-Objekt:
{"belegnummer": "<Lieferschein-/Belegnummer wörtlich, sonst null>", "positionen": [{"bezeichnung": "<Artikelbezeichnung wörtlich wie auf dem Beleg>", "menge": <ganze Zahl, nur wenn auf dem Beleg lesbar, sonst null>, "einheit": "<z. B. Stk, m, sonst null>", "artikelnummer": "<Artikelnummer wörtlich, sonst null>"}]}
Regeln: Nur was auf dem Bild wirklich lesbar steht. Nichts raten, nichts ergänzen, keine Preise. Unleserlich oder unklar: null. Keine Summenzeilen. Kein Text außerhalb des JSON.`

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO)
  if (!r.ok) return r.response
  try {
    const rl = await kiRateLimitPruefen(req, r.userId)
    if (!rl.ok) return rl.response
    const body = await req.json().catch(() => ({}))
    const bild = typeof body?.bild === 'string' ? body.bild : ''
    if (!BILD_RE.test(bild)) return NextResponse.json({ success: false, error: 'Bitte ein Foto (JPEG, PNG oder WebP) hochladen.' }, { status: 400 })
    if (bild.length > MAX_ZEICHEN) return NextResponse.json({ success: false, error: 'Das Foto ist zu groß.' }, { status: 413 })

    const apiKey = process.env.KI_API_KEY
    if (!apiKey) return NextResponse.json({ success: false, error: 'KI_API_KEY fehlt (Vercel → Environment Variables).' }, { status: 400 })
    const baseUrl = process.env.KI_BASE_URL || 'https://api.openai.com/v1'
    const model = process.env.KI_VISION_MODEL || 'mistral-small-2506'

    const kiRes = await kiFetchMitRetry(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: bild } }] }], temperature: 0, max_tokens: 2500, response_format: { type: 'json_object' } }),
    })
    if (!kiRes.ok) {
      if (kiRes.status === 429) return NextResponse.json({ success: false, error: KI_UEBERLASTET_MELDUNG }, { status: 429 })
      return NextResponse.json({ success: false, error: `KI-Fehler (${kiRes.status}). Ist ein Bild-Modell (KI_VISION_MODEL) eingestellt?` }, { status: 502 })
    }
    const raw = (await kiRes.json()).choices?.[0]?.message?.content?.trim()
    if (!raw) return NextResponse.json({ success: false, error: 'Die KI hat keine Antwort geliefert.' }, { status: 502 })
    let roh: unknown
    try { roh = JSON.parse(raw) } catch { return NextResponse.json({ success: false, error: 'Die KI-Antwort war nicht lesbar. Bitte ein schärferes Foto versuchen.' }, { status: 502 }) }

    const gelesen = pruefeLagerAntwort(roh)
    const aRes = await fetch(`${url}/rest/v1/inventory?select=id,sku,name,unit,barcode&is_active=eq.true&order=name&limit=5000`, { headers })
    const artikel: ArtikelKurz[] = aRes.ok ? await aRes.json() : []
    const positionen = gelesen.positionen.map((g) => ({ gelesen: g, treffer: findeArtikel(g, artikel) }))
    return NextResponse.json({ success: true, belegnummer: gelesen.belegnummer, positionen }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) { return serverErrorResponse(err, 'ki-lager-lesen POST') }
}
