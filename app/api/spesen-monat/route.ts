import { NextRequest, NextResponse } from 'next/server';
import { requireOwnEmployeeOrAdmin, forbiddenResponse, serverErrorResponse } from '@/lib/auth';
import { monatsGrenzen } from '@/lib/stundenzettel';
import { ladeSpesenTage } from '@/lib/spesen-server';
import { endbetrag } from '@/lib/spesen';

// ============================================================
// SCAFFOLD OS – Tages-Spesen eines Mitarbeiters für einen Monat (für den Stundenzettel)
// GET ?monat=JJJJ-MM&employee_id=… → je Tag der Endbetrag. Chef/Dispo für alle, ein Mitarbeiter nur für sich.
// Keine Vergleichswerte und keine Begründungen, nur die Beträge.
// ============================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const g = monatsGrenzen(sp.get('monat') || '');
  const employeeId = sp.get('employee_id') || '';
  if (!g || !UUID.test(employeeId)) return NextResponse.json({ success: false, error: 'monat=JJJJ-MM und employee_id erforderlich' }, { status: 400 });
  const erlaubt = await requireOwnEmployeeOrAdmin(employeeId);
  if (!erlaubt.allowed) return forbiddenResponse(erlaubt.error);
  try {
    const { tage } = await ladeSpesenTage(g.von, g.bis, [employeeId]);
    return NextResponse.json({ success: true, tage: tage.map((t) => ({ work_date: t.work_date, betrag: endbetrag(t) })) });
  } catch (err) {
    return serverErrorResponse(err, 'spesen-monat/GET');
  }
}
