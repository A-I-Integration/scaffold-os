import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { ROLLEN } from '@/lib/rollen';
import { UUID_MUSTER } from '@/lib/ansicht-link';
import { angebotLinkAnzeige, sichereAngebotToken, widerrufeAngebotLink, ANGEBOT_LINK_TAGE } from '@/lib/angebot-link';

// ============================================================
// SCAFFOLD OS – Angebots-Link (Fern-Annahme) verwalten
//
// GET    ?project_id=… → Status des Links (aktiv / abgelaufen / widerrufen, gültig bis)
// POST   { project_id } → Link bereitstellen: bestehenden verlängern (60 Tage) oder – nach Widerruf – einen neuen anlegen
// DELETE ?project_id=… → Link widerrufen (sofort gesperrt)
// Admin, Disposition, Bauleiter. Der Link selbst ist öffentlich (/angebot/[token], /api/public/angebot).
// ============================================================

const ungueltig = () => NextResponse.json({ success: false, error: 'project_id fehlt oder ist ungültig.' }, { status: 400 });

export async function GET(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER);
  if (!r.ok) return r.response;
  try {
    const id = req.nextUrl.searchParams.get('project_id') || '';
    if (!UUID_MUSTER.test(id)) return ungueltig();
    return NextResponse.json({ success: true, link: await angebotLinkAnzeige(id), tage: ANGEBOT_LINK_TAGE });
  } catch (err) {
    return serverErrorResponse(err, 'access-token GET');
  }
}

export async function POST(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER);
  if (!r.ok) return r.response;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.project_id || '');
    if (!UUID_MUSTER.test(id)) return ungueltig();
    const token = await sichereAngebotToken(id);
    return NextResponse.json({ success: true, token });
  } catch (err) {
    return serverErrorResponse(err, 'access-token POST');
  }
}

export async function DELETE(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO_BAULEITER);
  if (!r.ok) return r.response;
  try {
    const id = req.nextUrl.searchParams.get('project_id') || '';
    if (!UUID_MUSTER.test(id)) return ungueltig();
    const gab = await widerrufeAngebotLink(id);
    if (!gab) return NextResponse.json({ success: false, error: 'Für dieses Projekt gibt es keinen Angebots-Link.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverErrorResponse(err, 'access-token DELETE');
  }
}
