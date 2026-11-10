import { NextRequest, NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/auth'
import { pruefeStatiker } from '@/lib/statiker-auth'
import { UUID_MUSTER } from '@/lib/ansicht-link'
import { aktionSchema, fuehreStatikAktionAus, ladeDokumente, StatikFehler } from '@/lib/statik-dokumente-server'

// Statik-Dokumente für den Statiker – nur für ihm freigegebene Projekte (sonst dieselbe 404-Antwort wie überall).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }
const NICHT_GEFUNDEN = 'Dieses Projekt ist nicht vorhanden oder nicht für Sie freigegeben.'
const kein_cache = { 'Cache-Control': 'no-store' }

async function freigegeben(userId: string, projectId: string): Promise<boolean> {
  const z = await fetch(`${url}/rest/v1/project_statiker?user_id=eq.${userId}&project_id=eq.${projectId}&select=project_id`, { headers })
  if (!z.ok) throw new Error(await z.text())
  return (await z.json())?.length > 0
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await pruefeStatiker()
  if (!auth.ok) return auth.response
  const { id } = await params
  try {
    if (!UUID_MUSTER.test(id) || !(await freigegeben(auth.userId, id))) return NextResponse.json({ success: false, error: NICHT_GEFUNDEN }, { status: 404, headers: kein_cache })
    return NextResponse.json({ success: true, ...(await ladeDokumente(id)) }, { headers: kein_cache })
  } catch (err) {
    return serverErrorResponse(err, 'statiker dokumente GET')
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await pruefeStatiker()
  if (!auth.ok) return auth.response
  const { id } = await params
  try {
    if (!UUID_MUSTER.test(id) || !(await freigegeben(auth.userId, id))) return NextResponse.json({ success: false, error: NICHT_GEFUNDEN }, { status: 404, headers: kein_cache })
    const aktion = aktionSchema.safeParse(await req.json().catch(() => null))
    if (!aktion.success) return NextResponse.json({ success: false, error: 'Ungültige Eingabe.' }, { status: 400 })
    const ergebnis = await fuehreStatikAktionAus({ absender: 'statiker', userId: auth.userId, projectId: id }, aktion.data)
    return NextResponse.json({ success: true, ...ergebnis }, { headers: kein_cache })
  } catch (err) {
    if (err instanceof StatikFehler) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    return serverErrorResponse(err, 'statiker dokumente POST')
  }
}
