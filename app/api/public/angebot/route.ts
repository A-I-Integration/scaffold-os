import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// SCAFFOLD OS – Öffentliche Angebots-Ansicht/Annahme (Phase 33)
//
// GET  ?token=... → Angebotsdaten für die Fern-Annahme-Seite
//                    (NUR das eine, zum Token passende Projekt –
//                    nie eine Liste, nie interne IDs im Klartext)
// POST { token }   → Angebot annehmen (setzt angebotsStatus, ohne
//                     Unterschrift – Vermerk "per Link angenommen")
//
// KEIN Login nötig – der Empfänger ist der Kunde selbst. Zugriff
// ausschließlich über den unerratbaren Token, nie über die Projekt-ID.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
};
const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

async function projektZuToken(token: string) {
  const tRes = await fetch(`${url}/rest/v1/project_access_tokens?token=eq.${encodeURIComponent(token)}&select=project_id`, { headers });
  if (!tRes.ok) return null;
  const tRows = await tRes.json();
  return tRows?.[0]?.project_id || null;
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) return NextResponse.json({ success: false, error: 'Kein Token angegeben.' }, { status: 400 });

    const projectId = await projektZuToken(token);
    if (!projectId) return NextResponse.json({ success: false, error: 'Ungültiger oder abgelaufener Link.' }, { status: 404 });

    const [pRes, cRes] = await Promise.all([
      fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=id,name,adresse,data`, { headers }),
      fetch(`${url}/rest/v1/company_settings?id=eq.${SINGLETON_ID}&select=company_name,street,zip,city,phone,email`, { headers }),
    ]);
    if (!pRes.ok) throw new Error(await pRes.text());
    const pRows = await pRes.json();
    const projekt = pRows?.[0];
    if (!projekt) return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 });

    const company = cRes.ok ? (await cRes.json())?.[0] || null : null;
    const d = projekt.data || {};
    const ki = d.kiResult || null;

    // Bewusst NUR das Nötigste nach außen geben: kein interner Preisbasis-
    // Umschalter, keine Kostenaufstellung, keine anderen Projekte.
    return NextResponse.json({
      success: true,
      angebot: {
        projektName: projekt.name,
        adresse: projekt.adresse,
        angebotsStatus: d.angebotsStatus || 'versendet',
        endpreis: ki?.suggestedPrice ?? null,
        gerüstklasse: ki?.scaffoldClass ?? null,
        flaecheM2: ki?.totalAreaM2 ?? null,
        company,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ success: false, error: 'Kein Token angegeben.' }, { status: 400 });

    const projectId = await projektZuToken(token);
    if (!projectId) return NextResponse.json({ success: false, error: 'Ungültiger oder abgelaufener Link.' }, { status: 404 });

    const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=data`, { headers });
    if (!pRes.ok) throw new Error(await pRes.text());
    const pRows = await pRes.json();
    const projekt = pRows?.[0];
    if (!projekt) return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 });

    const d = projekt.data || {};
    if (d.angebotsStatus === 'angenommen') {
      return NextResponse.json({ success: true, bereitsAngenommen: true });
    }

    const updRes = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({
        data: { ...d, angebotsStatus: 'angenommen', angebotAngenommenAm: new Date().toISOString(), angebotAngenommenVia: 'link' },
      }),
    });
    if (!updRes.ok) throw new Error(await updRes.text());

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
