import { createClient } from '@/lib/supabase/server';
import { standortErfassungAn } from '@/lib/touren/hof';

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

// Ist der eingeloggte Nutzer admin oder disponent? (z. B. für GPS-Positionen,
// die nur diese beiden Rollen sehen dürfen)
export async function istAdminOderDispo(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return !!profile && ['admin', 'disponent'].includes(profile.role);
}

// Ist die Standort-Erfassung bei Touren eingeschaltet (Einstellungen)?
// Fehlt nur die Spalte (SQL phase-101 noch nicht ausgeführt) -> Standard "an".
// Bei jedem anderen Fehler wird aus Datenschutzgründen NICHT erfasst.
export async function standortErfassungAktiv(): Promise<boolean> {
  try {
    const r = await fetch(
      `${url}/rest/v1/company_settings?id=eq.00000000-0000-0000-0000-000000000001&select=tour_standort_erfassen`,
      { headers }
    );
    if (!r.ok) {
      const txt = await r.text();
      return /tour_standort_erfassen/.test(txt);
    }
    const rows = await r.json();
    return standortErfassungAn(rows?.[0]);
  } catch {
    return false;
  }
}
