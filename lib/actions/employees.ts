'use server';

// ============================================================
// SCAFFOLD OS – Mitarbeiter-Planung Server Actions
// ============================================================

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
// NEU (E-Mail-Benachrichtigungen): Versand Fehler brechen die Aktionen nie
import { notifyAbsenceCreated, notifyAbsenceDecision } from '@/lib/notify';
import {
  Employee,
  EmployeeWithSkills,
  EmployeeSkill,
  Absence,
  TourPlan,
  TourAssignment,
  EmployeeStats,
  EmployeeRecommendation,
} from '@/types/employees';

// ═══════════════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════════════

async function checkAdminOrDisponent(supabase: any): Promise<{ allowed: boolean; userId?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false, error: 'Nicht authentifiziert' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'disponent'].includes(profile.role)) {
    return { allowed: false, error: 'Keine Berechtigung' };
  }

  return { allowed: true, userId: user.id };
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════
// EMPLOYEES
// ═══════════════════════════════════════════════════════════

export async function getEmployees(): Promise<EmployeeWithSkills[]> {
  const supabase = await createClient();

  const { data: employees, error } = await supabase
    .from('employees')
    .select('*')
    .order('last_name');

  if (error) throw new Error(`Fehler beim Laden: ${error.message}`);

  const today = getTodayDate();

  const result: EmployeeWithSkills[] = [];
  for (const emp of (employees || [])) {
    const { data: skills } = await supabase
      .from('employee_skills')
      .select('*')
      .eq('employee_id', emp.id);

    const { data: absences } = await supabase
      .from('absences')
      .select('*')
      .eq('employee_id', emp.id)
      .lte('start_date', today)
      .gte('end_date', today)
      .eq('status', 'approved');

    result.push({
      ...emp,
      skills: skills || [],
      full_name: `${emp.first_name} ${emp.last_name}`,
      is_available_today: !(absences && absences.length > 0),
    });
  }

  return result;
}

export async function getEmployee(id: string): Promise<EmployeeWithSkills | null> {
  const supabase = await createClient();

  const { data: emp, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !emp) return null;

  const { data: skills } = await supabase
    .from('employee_skills')
    .select('*')
    .eq('employee_id', id);

  const today = getTodayDate();
  const { data: absences } = await supabase
    .from('absences')
    .select('*')
    .eq('employee_id', id)
    .lte('start_date', today)
    .gte('end_date', today)
    .eq('status', 'approved');

  return {
    ...emp,
    skills: skills || [],
    full_name: `${emp.first_name} ${emp.last_name}`,
    is_available_today: !(absences && absences.length > 0),
  };
}

export async function createEmployee(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const auth = await checkAdminOrDisponent(supabase);
  if (!auth.allowed) return { success: false, error: auth.error };

  const employee = {
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    role: (formData.get('role') as string) || 'monteur',
    status: 'active',
    weekly_hours: parseInt(formData.get('weekly_hours') as string) || 40,
    hourly_rate: parseFloat(formData.get('hourly_rate') as string) || 0,
    drivers_license: (formData.get('drivers_license') as string) || null,
    license_expires: (formData.get('license_expires') as string) || null,
    home_address: (formData.get('home_address') as string) || null,
    notes: (formData.get('notes') as string) || null,
    created_by: auth.userId,
    updated_by: auth.userId,
  };

  const { error } = await supabase.from('employees').insert(employee);
  if (error) return { success: false, error: error.message };

  revalidatePath('/planung');
  return { success: true };
}

export async function updateEmployee(id: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const auth = await checkAdminOrDisponent(supabase);
  if (!auth.allowed) return { success: false, error: auth.error };

  const employee = {
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    email: (formData.get('email') as string) || null,
    phone: (formData.get('phone') as string) || null,
    role: (formData.get('role') as string) || 'monteur',
    status: (formData.get('status') as string) || 'active',
    weekly_hours: parseInt(formData.get('weekly_hours') as string) || 40,
    hourly_rate: parseFloat(formData.get('hourly_rate') as string) || 0,
    drivers_license: (formData.get('drivers_license') as string) || null,
    license_expires: (formData.get('license_expires') as string) || null,
    home_address: (formData.get('home_address') as string) || null,
    notes: (formData.get('notes') as string) || null,
    updated_by: auth.userId,
  };

  const { error } = await supabase.from('employees').update(employee).eq('id', id);
  if (error) return { success: false, error: error.message };

  revalidatePath('/planung');
  return { success: true };
}

export async function deleteEmployee(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Nicht authentifiziert' };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') return { success: false, error: 'Nur Admin' };

  const { error } = await supabase.from('employees').update({ status: 'inactive', updated_by: user.id }).eq('id', id);
  if (error) return { success: false, error: error.message };

  revalidatePath('/planung');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════
// SKILLS
// ═══════════════════════════════════════════════════════════

export async function addEmployeeSkill(employeeId: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const auth = await checkAdminOrDisponent(supabase);
  if (!auth.allowed) return { success: false, error: auth.error };

  const skill = {
    employee_id: employeeId,
    skill_name: formData.get('skill_name') as string,
    level: (formData.get('level') as string) || 'basic',
    certified_until: (formData.get('certified_until') as string) || null,
    certificate_number: (formData.get('certificate_number') as string) || null,
  };

  const { error } = await supabase.from('employee_skills').insert(skill);
  if (error) return { success: false, error: error.message };

  revalidatePath('/planung');
  return { success: true };
}

export async function deleteSkill(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const auth = await checkAdminOrDisponent(supabase);
  if (!auth.allowed) return { success: false, error: auth.error };

  const { error } = await supabase.from('employee_skills').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  revalidatePath('/planung');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════
// ABSENCES (FIXED: approved_by Join entfernt)
// ═══════════════════════════════════════════════════════════

export async function getAbsences(employeeId?: string): Promise<Absence[]> {
  const supabase = await createClient();

  let query = supabase
    .from('absences')
    .select(`
      *,
      employee:employee_id(id, first_name, last_name)
    `)
    .order('start_date', { ascending: false });

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Fehler: ${error.message}`);
  return data || [];
}

export async function createAbsence(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Nicht authentifiziert' };

  const absence = {
    employee_id: formData.get('employee_id') as string,
    start_date: formData.get('start_date') as string,
    end_date: formData.get('end_date') as string,
    type: formData.get('type') as string,
    status: 'pending',
    reason: (formData.get('reason') as string) || null,
    created_by: user.id,
  };

  // NEU: .select('id') → wir brauchen die ID für die Mail an Chef/Dispo
  const { data: inserted, error } = await supabase.from('absences').insert(absence).select('id').single();
  if (error) return { success: false, error: error.message };

  // NEU (E-Mail): Chef/Dispo über den neuen Antrag informieren
  if (inserted?.id) {
    try { await notifyAbsenceCreated(inserted.id); } catch (e) { console.error('Mail Antrag:', e); }
  }

  revalidatePath('/planung');
  return { success: true };
}

export async function approveAbsence(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const auth = await checkAdminOrDisponent(supabase);
  if (!auth.allowed) return { success: false, error: auth.error };

  const { error } = await supabase
    .from('absences')
    .update({
      status: 'approved',
      approved_by: auth.userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  // NEU (E-Mail): Mitarbeiter über die Genehmigung informieren
  try { await notifyAbsenceDecision(id, 'approved'); } catch (e) { console.error('Mail Genehmigung:', e); }

  revalidatePath('/planung');
  return { success: true };
}

export async function rejectAbsence(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const auth = await checkAdminOrDisponent(supabase);
  if (!auth.allowed) return { success: false, error: auth.error };

  const { error } = await supabase.from('absences').update({ status: 'rejected' }).eq('id', id);
  if (error) return { success: false, error: error.message };

  // NEU (E-Mail): Mitarbeiter über die Ablehnung informieren
  try { await notifyAbsenceDecision(id, 'rejected'); } catch (e) { console.error('Mail Ablehnung:', e); }

  revalidatePath('/planung');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════
// TOUR PLANS
// ═══════════════════════════════════════════════════════════

export async function getTourPlans(date?: string): Promise<TourPlan[]> {
  const supabase = await createClient();

  let query = supabase
    .from('tour_plans')
    .select(`
      *,
      project:project_id(id, name),
      transport_order:transport_order_id(id, status)
    `)
    .order('planned_date', { ascending: true });

  if (date) {
    query = query.eq('planned_date', date);
  }

  const { data: tours, error } = await query;
  if (error) throw new Error(`Fehler: ${error.message}`);

  const result: TourPlan[] = [];
  for (const tour of (tours || [])) {
    const { data: assignments } = await supabase
      .from('tour_assignments')
      .select(`
        *,
        employee:employee_id(*)
      `)
      .eq('tour_id', tour.id);

    result.push({
      ...tour,
      assignments: assignments || [],
      employee_count: assignments?.length || 0,
    });
  }

  return result;
}

export async function createTourPlan(formData: FormData): Promise<{ success: boolean; error?: string; data?: any }> {
  const supabase = await createClient();
  const auth = await checkAdminOrDisponent(supabase);
  if (!auth.allowed) return { success: false, error: auth.error };

  const tour = {
    project_id: (formData.get('project_id') as string) || null,
    transport_order_id: (formData.get('transport_order_id') as string) || null,
    planned_date: formData.get('planned_date') as string,
    start_time: (formData.get('start_time') as string) || null,
    end_time: (formData.get('end_time') as string) || null,
    status: 'planned',
    vehicle_id: (formData.get('vehicle_id') as string) || null,
    created_by: auth.userId,
    updated_by: auth.userId,
  };

  const { data, error } = await supabase.from('tour_plans').insert(tour).select().single();
  if (error) return { success: false, error: error.message };

  revalidatePath('/planung');
  return { success: true, data };
}

export async function updateTourStatus(id: string, status: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const auth = await checkAdminOrDisponent(supabase);
  if (!auth.allowed) return { success: false, error: auth.error };

  const { error } = await supabase.from('tour_plans').update({ status, updated_by: auth.userId }).eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/planung');
  return { success: true };
}

export async function assignEmployeeToTour(tourId: string, employeeId: string, roleInTour: string = 'worker'): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const auth = await checkAdminOrDisponent(supabase);
  if (!auth.allowed) return { success: false, error: auth.error };

  const { error } = await supabase.from('tour_assignments').insert({
    tour_id: tourId,
    employee_id: employeeId,
    role_in_tour: roleInTour,
  });

  if (error) return { success: false, error: error.message };
  revalidatePath('/planung');
  return { success: true };
}

export async function removeEmployeeFromTour(assignmentId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const auth = await checkAdminOrDisponent(supabase);
  if (!auth.allowed) return { success: false, error: auth.error };

  const { error } = await supabase.from('tour_assignments').delete().eq('id', assignmentId);
  if (error) return { success: false, error: error.message };
  revalidatePath('/planung');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════
// KI-EMPFEHLUNG
// ═══════════════════════════════════════════════════════════

export async function getRecommendedEmployees(
  tourDate: string,
  requiredSkills: string[] = [],
  needDriver: boolean = false
): Promise<EmployeeRecommendation[]> {
  const supabase = await createClient();

  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .eq('status', 'active');

  if (!employees) return [];

  const recommendations: EmployeeRecommendation[] = [];

  for (const emp of employees) {
    let score = 50;
    const conflicts: string[] = [];

    const { data: absences } = await supabase
      .from('absences')
      .select('*')
      .eq('employee_id', emp.id)
      .lte('start_date', tourDate)
      .gte('end_date', tourDate)
      .eq('status', 'approved');

    if (absences && absences.length > 0) {
      conflicts.push(`Abwesend: ${absences[0].type}`);
      score -= 100;
    }

    const { data: existingTours } = await supabase
      .from('tour_assignments')
      .select('tour_id, tour:tour_id(planned_date)')
      .eq('employee_id', emp.id);

    const hasTour = existingTours?.some((a: any) => a.tour?.planned_date === tourDate);
    if (hasTour) {
      conflicts.push('Bereits in anderer Tour');
      score -= 80;
    }

    const { data: skills } = await supabase
      .from('employee_skills')
      .select('*')
      .eq('employee_id', emp.id);

    const skillNames = (skills || []).map((s: any) => s.skill_name.toLowerCase());
    const required = requiredSkills.map(s => s.toLowerCase());

    for (const req of required) {
      if (skillNames.includes(req)) {
        score += 20;
      } else {
        score -= 10;
        conflicts.push(`Fehlend: ${req}`);
      }
    }

    if (needDriver) {
      if (emp.drivers_license && ['C', 'CE'].some(l => emp.drivers_license?.includes(l))) {
        score += 30;
      } else {
        score -= 20;
        conflicts.push('Kein LKW-Führerschein');
      }
    }

    const expiredCerts = (skills || []).filter((s: any) => {
      if (!s.certified_until) return false;
      return new Date(s.certified_until) < new Date();
    });

    if (expiredCerts.length > 0) {
      score -= 15;
      conflicts.push(`${expiredCerts.length} abgelaufen`);
    }

    recommendations.push({
      employee_id: emp.id,
      employee_name: `${emp.first_name} ${emp.last_name}`,
      reason: score > 70 ? 'Sehr gut' : score > 40 ? 'Gut' : 'Eingeschränkt',
      match_score: Math.max(0, Math.min(100, score)),
      conflicts,
    });
  }

  return recommendations.sort((a, b) => b.match_score - a.match_score);
}

// ═══════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════

export async function getEmployeeStats(): Promise<EmployeeStats> {
  const supabase = await createClient();
  const today = getTodayDate();

  const { data: allEmployees } = await supabase.from('employees').select('status');
  const { data: active } = await supabase.from('employees').select('id').eq('status', 'active');
  const { data: onLeave } = await supabase.from('employees').select('id').eq('status', 'on_leave');
  const { data: pendingVacations } = await supabase.from('absences').select('id').eq('type', 'vacation').eq('status', 'pending');
  const { data: sickToday } = await supabase.from('absences').select('id').eq('type', 'sick').lte('start_date', today).gte('end_date', today).eq('status', 'approved');
  const { data: plannedTours } = await supabase.from('tour_plans').select('id').eq('status', 'planned');

  return {
    totalEmployees: allEmployees?.length || 0,
    activeEmployees: active?.length || 0,
    onLeaveEmployees: onLeave?.length || 0,
    pendingVacations: pendingVacations?.length || 0,
    sickToday: sickToday?.length || 0,
    plannedTours: plannedTours?.length || 0,
  };
}