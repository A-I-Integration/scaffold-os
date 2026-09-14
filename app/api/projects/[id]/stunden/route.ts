import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

// GET /api/projects/[id]/stunden – Summe der tatsächlich erfassten
// Stunden für dieses Projekt (Soll-Ist-Vergleich mit
// kiResult.estimatedLaborHours aus der Kalkulation).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth())) return unauthorizedResponse();
  const { id } = await params;
  try {
    const res = await fetch(`${url}/rest/v1/time_entries?project_id=eq.${id}&select=hours`, { headers });
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    const summeStunden = rows.reduce((s: number, r: any) => s + (Number(r.hours) || 0), 0);
    return NextResponse.json({ success: true, istStunden: Math.round(summeStunden * 10) / 10, anzahlEintraege: rows.length });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
