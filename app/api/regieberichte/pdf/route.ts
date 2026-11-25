import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { BETRIEB_ROLLEN, UUID, ladeBericht, pdfFuer } from '@/lib/regiebericht-server';

// PDF eines Regiebericht (zum Ansehen, Drucken, Unterschreiben). Mitarbeiter bekommen es ohne Preise.
export async function GET(req: NextRequest) {
  const rolle = await pruefeRolle(BETRIEB_ROLLEN);
  if (!rolle.ok) return rolle.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return NextResponse.json({ success: false, error: 'id erforderlich' }, { status: 400 });
  try {
    const b = await ladeBericht(id);
    if (!b) return NextResponse.json({ success: false, error: 'Regiebericht nicht gefunden.' }, { status: 404 });
    const pdf = await pdfFuer(b, rolle.role);
    return new NextResponse(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${b.nummer}.pdf"` } });
  } catch (err) { return serverErrorResponse(err, 'regieberichte/pdf'); }
}
