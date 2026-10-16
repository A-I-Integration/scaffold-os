import { NextRequest, NextResponse } from 'next/server';
import { serverErrorResponse } from '@/lib/auth';
import { ansichtAusProjektdaten, linkStatus, TOKEN_MUSTER } from '@/lib/ansicht-link';

// ============================================================
// SCAFFOLD OS – Öffentliche 3D-Ansicht (nur lesend, ohne Login)
//
// GET ?token=... → Gebäudedaten + System des EINEN zum Token passenden
// CAD-Projekts. Bewusst NICHT enthalten: Preise, Kundendaten, Notizen,
// andere Projekte. Zugriff ausschließlich über den unerratbaren Token;
// abgelaufene oder widerrufene Links antworten wie unbekannte (404).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';
const NICHT_GEFUNDEN = 'Dieser Link ist ungültig, abgelaufen oder wurde widerrufen.';
const kein_cache = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || '';
    if (!TOKEN_MUSTER.test(token)) return NextResponse.json({ success: false, error: NICHT_GEFUNDEN }, { status: 404, headers: kein_cache });

    const lRes = await fetch(`${url}/rest/v1/project_view_links?token=eq.${token}&select=project_id,expires_at,revoked_at`, { headers });
    if (!lRes.ok) throw new Error(await lRes.text());
    const link = (await lRes.json())?.[0];
    if (!link || linkStatus(link) !== 'aktiv') return NextResponse.json({ success: false, error: NICHT_GEFUNDEN }, { status: 404, headers: kein_cache });

    const [pRes, cRes] = await Promise.all([
      fetch(`${url}/rest/v1/projects?id=eq.${link.project_id}&select=name,adresse,data`, { headers }),
      fetch(`${url}/rest/v1/company_settings?id=eq.${SINGLETON_ID}&select=company_name`, { headers }),
    ]);
    if (!pRes.ok) throw new Error(await pRes.text());
    const projekt = (await pRes.json())?.[0];
    const ansicht = projekt ? ansichtAusProjektdaten(projekt.data) : null;
    if (!projekt || !ansicht) return NextResponse.json({ success: false, error: NICHT_GEFUNDEN }, { status: 404, headers: kein_cache });
    const firma = cRes.ok ? (await cRes.json())?.[0]?.company_name || null : null;

    return NextResponse.json({
      success: true,
      projektName: projekt.name,
      adresse: projekt.adresse || null,
      firma,
      gueltigBis: link.expires_at,
      building: ansicht.building,
      systemId: ansicht.systemId,
    }, { headers: kein_cache });
  } catch (err) {
    return serverErrorResponse(err, 'public/ansicht GET');
  }
}
