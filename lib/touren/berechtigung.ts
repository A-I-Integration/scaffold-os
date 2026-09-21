import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Zuständigkeits-Prüfung für Touren/Tour-Stopps (Phase 90)
//
// Gemeinsam genutzt von app/api/tour-stops/route.ts (PUT) und
// app/api/tour-stops/nicht-fertig/route.ts, damit beide Endpunkte
// dieselbe Regel anwenden: admin/disponent dürfen immer, ansonsten
// nur der Mitarbeiter, der laut Tour (driver_id oder team_ids)
// tatsächlich für diese Tour zuständig ist.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

export async function darfStoppAendern(tourId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile && ['admin', 'disponent'].includes(profile.role)) return true;

  const { data: employee } = await supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle();
  if (!employee) return false;

  const fahrerRes = await fetch(`${url}/rest/v1/drivers?employee_id=eq.${employee.id}&select=id`, { headers });
  const fahrerRows = fahrerRes.ok ? await fahrerRes.json() : [];
  const eigeneFahrerIds: string[] = fahrerRows.map((f: any) => f.id);
  if (eigeneFahrerIds.length === 0) return false;

  const tourRes = await fetch(`${url}/rest/v1/tours?id=eq.${tourId}&select=driver_id,team_ids`, { headers });
  const tourRows = tourRes.ok ? await tourRes.json() : [];
  const tour = tourRows?.[0];
  if (!tour) return false;

  const teamIds: string[] = Array.isArray(tour.team_ids) ? tour.team_ids : [];
  return eigeneFahrerIds.includes(tour.driver_id) || eigeneFahrerIds.some((id) => teamIds.includes(id));
}

// Liefert die employees.id des eingeloggten Nutzers, falls sein Login mit
// einem Mitarbeiter-Datensatz verknüpft ist (sonst null).
export async function eigeneEmployeeId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: employee } = await supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle();
  return employee?.id || null;
}
