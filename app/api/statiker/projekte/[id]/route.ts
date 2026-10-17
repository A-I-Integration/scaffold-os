import { NextRequest, NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/auth'
import { pruefeStatiker } from '@/lib/statiker-auth'
import { ansichtAusProjektdaten, UUID_MUSTER } from '@/lib/ansicht-link'

// ============================================================
// SCAFFOLD OS – Statiker: ein freigegebenes Projekt ansehen
//
// GET → dieselben bereinigten Daten wie der öffentliche 3D-Link
// (Gebäude + System, keine Preise, keine Kundendaten). Nur wenn das Projekt
// DIESEM Statiker freigegeben ist; sonst immer dieselbe 404-Antwort, egal ob
// das Projekt nicht existiert oder nur nicht freigegeben ist.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }
const SINGLETON_ID = '00000000-0000-0000-0000-000000000001'
const NICHT_GEFUNDEN = 'Dieses Projekt ist nicht vorhanden oder nicht für Sie freigegeben.'
const kein_cache = { 'Cache-Control': 'no-store' }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await pruefeStatiker()
  if (!auth.ok) return auth.response
  const { id } = await params
  if (!UUID_MUSTER.test(id)) return NextResponse.json({ success: false, error: NICHT_GEFUNDEN }, { status: 404, headers: kein_cache })
  try {
    const zRes = await fetch(`${url}/rest/v1/project_statiker?user_id=eq.${auth.userId}&project_id=eq.${id}&select=project_id`, { headers })
    if (!zRes.ok) throw new Error(await zRes.text())
    if (!(await zRes.json())?.length) return NextResponse.json({ success: false, error: NICHT_GEFUNDEN }, { status: 404, headers: kein_cache })

    const [pRes, cRes] = await Promise.all([
      fetch(`${url}/rest/v1/projects?id=eq.${id}&select=name,adresse,data`, { headers }),
      fetch(`${url}/rest/v1/company_settings?id=eq.${SINGLETON_ID}&select=company_name`, { headers }),
    ])
    if (!pRes.ok) throw new Error(await pRes.text())
    const projekt = (await pRes.json())?.[0]
    const ansicht = projekt ? ansichtAusProjektdaten(projekt.data) : null
    if (!projekt || !ansicht) return NextResponse.json({ success: false, error: NICHT_GEFUNDEN }, { status: 404, headers: kein_cache })
    const firma = cRes.ok ? (await cRes.json())?.[0]?.company_name || null : null

    return NextResponse.json({
      success: true,
      projektName: projekt.name,
      adresse: projekt.adresse || null,
      firma,
      gueltigBis: null,
      building: ansicht.building,
      systemId: ansicht.systemId,
    }, { headers: kein_cache })
  } catch (err) {
    return serverErrorResponse(err, 'statiker/projekte/[id] GET')
  }
}
