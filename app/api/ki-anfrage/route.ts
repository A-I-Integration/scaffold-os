import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { kiRateLimitPruefen } from '@/lib/rate-limit'
import { kiFetchMitRetry, KI_UEBERLASTET_MELDUNG } from '@/lib/ki-fetch'
import { fehlendeAngaben, findeKunden, pruefeKiAntwort } from '@/lib/ki-anfrage'

// ============================================================
// SCAFFOLD OS – KI-Angebotsassistent, Paket 1: Anfrage-Entwurf aus freiem Text (nur Admin/Disposition)
//
// POST { text } → { entwurf, verworfen, fehlend, treffer }
// Die KI liest nur Angaben heraus. Es wird nichts gespeichert und nichts berechnet.
// Straße, PLZ, Telefon, E-Mail werden vor dem Versand an die KI pseudonymisiert (lib/ki-fetch → ki-dsgvo)
// und die Adresse wird lokal aus dem Originaltext gelesen. Jede Angabe der KI wird gegen den Text geprüft.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { apikey: key, Authorization: `Bearer ${key}` }

const PROMPT = `Du liest aus einer Gerüstbau-Kundenanfrage (Telefonnotiz oder Chat) nur Angaben heraus. Antworte ausschließlich mit einem JSON-Objekt mit diesen Schlüsseln:
kunde (Name der Firma oder Person, wörtlich aus dem Text), ort (Ortsname der Baustelle, wörtlich), leistung (Art des Gerüsts, z. B. "Fassadengerüst", wörtlich), flaeche_m2 (Zahl), arbeitshoehe_m (Zahl), standzeit_wochen (Zahl, nur wenn im Text in Wochen genannt), wunschtermin (wörtlich, z. B. "Anfang Januar"), bemerkung (wichtige Zusatzangaben, wörtlich, sonst null).
Regeln: Nichts schätzen, nichts berechnen, nichts ergänzen. Steht eine Angabe nicht im Text, setze null. Platzhalter wie [STRASSE], [PLZ-ORT], [TELEFON], [E-MAIL] sind absichtlich geschwärzt und werden ignoriert.

Text:
`

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO)
  if (!r.ok) return r.response
  try {
    const rl = await kiRateLimitPruefen(req, r.userId)
    if (!rl.ok) return rl.response
    const body = await req.json().catch(() => ({}))
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    if (text.length < 10) return NextResponse.json({ success: false, error: 'Bitte die Anfrage in ein paar Sätzen beschreiben.' }, { status: 400 })
    if (text.length > 4000) return NextResponse.json({ success: false, error: 'Der Text ist zu lang (höchstens 4000 Zeichen).' }, { status: 400 })

    const apiKey = process.env.KI_API_KEY
    if (!apiKey) return NextResponse.json({ success: false, error: 'KI_API_KEY fehlt (Vercel → Environment Variables).' }, { status: 400 })
    const baseUrl = process.env.KI_BASE_URL || 'https://api.openai.com/v1'
    const model = process.env.KI_MODEL || 'gpt-4o-mini'

    const kiRes = await kiFetchMitRetry(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: PROMPT + text }], temperature: 0, max_tokens: 500, response_format: { type: 'json_object' } }),
    })
    if (!kiRes.ok) {
      if (kiRes.status === 429) return NextResponse.json({ success: false, error: KI_UEBERLASTET_MELDUNG }, { status: 429 })
      return NextResponse.json({ success: false, error: `KI-Fehler (${kiRes.status}).` }, { status: 502 })
    }
    const raw = (await kiRes.json()).choices?.[0]?.message?.content?.trim()
    if (!raw) return NextResponse.json({ success: false, error: 'Die KI hat keine Antwort geliefert.' }, { status: 502 })
    let roh: unknown
    try { roh = JSON.parse(raw) } catch { return NextResponse.json({ success: false, error: 'Die KI-Antwort war nicht lesbar. Bitte noch einmal versuchen.' }, { status: 502 }) }

    const kundeVorgegeben = body?.kundeVorgegeben === true
    const { entwurf, verworfen } = pruefeKiAntwort(roh, text)
    const kRes = await fetch(`${url}/rest/v1/customers?select=id,name&order=name.asc&limit=2000`, { headers })
    const kunden = kRes.ok ? await kRes.json() : []
    return NextResponse.json({ success: true, entwurf, verworfen, fehlend: fehlendeAngaben(entwurf, { ohneKunde: kundeVorgegeben }), treffer: kundeVorgegeben ? [] : findeKunden(entwurf.kunde, kunden) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) { return serverErrorResponse(err, 'ki-anfrage POST') }
}
