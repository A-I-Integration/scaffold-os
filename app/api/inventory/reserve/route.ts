import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth';
import { validiere, materialZuordnungSchema } from '@/lib/validation';
import { bucheAusZentrallager } from '@/lib/inventory/buchung';

// POST /api/inventory/reserve
// Body: { inventory_id, project_id, quantity, notes? }
// Nutzt die zentrale Buchungsfunktion (lib/inventory/buchung.ts) –
// gleiche Logik wie /api/transport-orders und lib/angebot-annahme.ts.
export async function POST(req: Request) {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const parsed = validiere(materialZuordnungSchema, await req.json());
    if (!parsed.ok) return parsed.response;
    const { inventory_id, project_id, quantity, notes } = parsed.data;
    if (!project_id) {
      return NextResponse.json({ success: false, error: 'project_id erforderlich' }, { status: 400 });
    }

    const ergebnis = await bucheAusZentrallager({
      inventory_id,
      project_id,
      quantity,
      reason: notes || `Reservierung für Projekt ${project_id}`,
      reference_type: 'reservation',
    });

    if (!ergebnis.success) {
      return NextResponse.json({ success: false, error: ergebnis.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `${quantity} ${ergebnis.unit || ''} reserviert`,
      remaining: ergebnis.remaining,
    });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}