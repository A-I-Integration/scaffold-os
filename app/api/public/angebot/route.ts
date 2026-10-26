import { NextRequest, NextResponse, after } from 'next/server';
import { serverErrorResponse } from '@/lib/auth';
import { beiAngebotsannahmeSicher } from '@/lib/angebot-annahme';
import { notifyAngebotRueckmeldung } from '@/lib/notify';
import { ANTWORT_ZU_STATUS, antwortErlaubt, pruefeRueckmeldung, verlaufMit } from '@/lib/angebot-rueckmeldung';

// ============================================================
// SCAFFOLD OS – Öffentliche Angebots-Ansicht/Annahme (Phase 33)
//
// GET  ?token=... → Angebotsdaten für die Fern-Annahme-Seite
//                    (NUR das eine, zum Token passende Projekt –
//                    nie eine Liste, nie interne IDs im Klartext)
// POST { token, art?, notiz?, name? } → Antwort des Kunden:
//        art 'annehmen' (Standard, ohne Unterschrift – Vermerk "per Link angenommen"),
//        'korrektur' (Notiz Pflicht: was nicht passt / fehlt) oder 'ablehnen' (Notiz optional).
//        Jede Antwort landet im Verlauf data.angebotRueckmeldungen.
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
        letzteRueckmeldung: Array.isArray(d.angebotRueckmeldungen) && d.angebotRueckmeldungen.length
          ? (({ art, notiz, am }: any) => ({ art, notiz, am }))(d.angebotRueckmeldungen[d.angebotRueckmeldungen.length - 1])
          : null,
        endpreis: ki?.suggestedPrice ?? null,
        gerüstklasse: ki?.scaffoldClass ?? null,
        flaecheM2: ki?.totalAreaM2 ?? null,
        company,
      },
    });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    if (!token || typeof token !== 'string') return NextResponse.json({ success: false, error: 'Kein Token angegeben.' }, { status: 400 });
    const eingabe = pruefeRueckmeldung(body);
    if (!eingabe.ok) return NextResponse.json({ success: false, error: eingabe.fehler }, { status: 400 });

    const projectId = await projektZuToken(token);
    if (!projectId) return NextResponse.json({ success: false, error: 'Ungültiger oder abgelaufener Link.' }, { status: 404 });

    const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=data`, { headers });
    if (!pRes.ok) throw new Error(await pRes.text());
    const pRows = await pRes.json();
    const projekt = pRows?.[0];
    if (!projekt) return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 });

    const d = projekt.data || {};
    if (!antwortErlaubt(d.angebotsStatus)) {
      if (eingabe.art === 'annehmen') return NextResponse.json({ success: true, bereitsAngenommen: true });
      return NextResponse.json({ success: false, error: 'Dieses Angebot wurde bereits angenommen. Bitte melden Sie sich direkt bei uns.' }, { status: 409 });
    }

    const jetzt = new Date().toISOString();
    const neueDaten: Record<string, unknown> = {
      ...d,
      angebotsStatus: ANTWORT_ZU_STATUS[eingabe.art],
      angebotRueckmeldungen: verlaufMit(d.angebotRueckmeldungen, { art: eingabe.art, notiz: eingabe.notiz, name: eingabe.name, am: jetzt }),
    };
    if (eingabe.art === 'annehmen') {
      neueDaten.angebotAngenommenAm = jetzt;
      neueDaten.angebotAngenommenVia = 'link';
    }
    const updRes = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ data: neueDaten }),
    });
    if (!updRes.ok) throw new Error(await updRes.text());

    // Nur bei Annahme: Lager reservieren + Transportaufträge anlegen (Zusammenspiel Aufmaß→Lager→Tour).
    // Läuft im Hintergrund, blockiert die Antwort an den Kunden nicht bei einem Fehler.
    if (eingabe.art === 'annehmen') after(() => beiAngebotsannahmeSicher(projectId));
    else {
      const art = eingabe.art;
      // E-Mail an die Firma (Einstellungen → E-Mail); darf die Antwort an den Kunden nie blockieren
      after(() => notifyAngebotRueckmeldung(projectId, art, eingabe.notiz, eingabe.name));
    }

    return NextResponse.json({ success: true, art: eingabe.art });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
