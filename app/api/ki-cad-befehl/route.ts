import { NextRequest, NextResponse } from 'next/server'
import { pruefeRolle, serverErrorResponse } from '@/lib/auth'
import { ROLLEN } from '@/lib/rollen'
import { kiRateLimitPruefen } from '@/lib/rate-limit'
import { kiFetchMitRetry, KI_UEBERLASTET_MELDUNG } from '@/lib/ki-fetch'
import { pruefeBefehl } from '@/lib/cad/befehle'

// ============================================================
// SCAFFOLD OS – CAD-Befehlsleiste: Satz → Befehl aus fester Liste
//
// POST { text } → { success, befehl } oder { success:false, grund }
// Die KI wählt nur einen Befehl aus vier erlaubten und liest die Werte aus dem Satz. Sie erzeugt keine Geometrie.
// Geprüft wird die Antwort lokal (pruefeBefehl), geplant und ausgeführt wird erst nach Bestätigung im CAD.
// ============================================================

const PROMPT = `Du übersetzt einen kurzen Satz zur Steuerung eines Gerüst-CAD in genau einen Befehl. Antworte ausschließlich mit einem JSON-Objekt.
Erlaubte Befehle:
1. {"befehl":"verschieben","richtung":"hoch|runter|vorne|hinten|links|rechts","betrag_m":Zahl in Metern} – die aktuelle Auswahl verschieben.
2. {"befehl":"feld_entfernen","seite":"vorne|hinten|links|rechts","nummer":ganze Zahl,"lage":ganze Zahl oder null} – ein Feld entfernen; lage nur, wenn im Satz eine Lage genannt ist.
3. {"befehl":"treppe_setzen","seite":"vorne|hinten|links|rechts","nummer":ganze Zahl} – Treppe auf ein Feld setzen.
4. {"befehl":"hoehe_aendern","hoehe_m":Zahl in Metern} – Gebäudehöhe ändern.
Regeln: Nur Werte, die im Satz stehen. Nichts schätzen, nichts umrechnen außer Zentimeter in Meter. Passt der Satz zu keinem der vier Befehle oder fehlt eine Angabe, antworte {"befehl":"unklar","frage":"kurze Rückfrage auf Deutsch"}. Nie einen anderen Befehl erfinden.

Satz:
`

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER)
  if (!r.ok) return r.response
  try {
    const rl = await kiRateLimitPruefen(req, r.userId)
    if (!rl.ok) return rl.response
    const body = await req.json().catch(() => ({}))
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    if (text.length < 3) return NextResponse.json({ success: false, grund: 'Bitte einen Befehl eingeben.' }, { status: 400 })
    if (text.length > 300) return NextResponse.json({ success: false, grund: 'Der Befehl ist zu lang (höchstens 300 Zeichen).' }, { status: 400 })

    const apiKey = process.env.KI_API_KEY
    if (!apiKey) return NextResponse.json({ success: false, grund: 'KI_API_KEY fehlt (Vercel → Environment Variables).' }, { status: 400 })
    const baseUrl = process.env.KI_BASE_URL || 'https://api.openai.com/v1'
    const model = process.env.KI_MODEL || 'gpt-4o-mini'

    const kiRes = await kiFetchMitRetry(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: PROMPT + text }], temperature: 0, max_tokens: 200, response_format: { type: 'json_object' } }),
    })
    if (!kiRes.ok) {
      if (kiRes.status === 429) return NextResponse.json({ success: false, grund: KI_UEBERLASTET_MELDUNG }, { status: 429 })
      return NextResponse.json({ success: false, grund: `KI-Fehler (${kiRes.status}).` }, { status: 502 })
    }
    const raw = (await kiRes.json()).choices?.[0]?.message?.content?.trim()
    if (!raw) return NextResponse.json({ success: false, grund: 'Die KI hat keine Antwort geliefert.' }, { status: 502 })
    let roh: unknown
    try { roh = JSON.parse(raw) } catch { return NextResponse.json({ success: false, grund: 'Die KI-Antwort war nicht lesbar. Bitte noch einmal versuchen.' }, { status: 502 }) }

    const p = pruefeBefehl(roh)
    if (!p.ok) return NextResponse.json({ success: false, grund: p.grund }, { headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.json({ success: true, befehl: p.befehl }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) { return serverErrorResponse(err, 'ki-cad-befehl POST') }
}
