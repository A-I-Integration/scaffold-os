// ============================================================
// SCAFFOLD OS – Mitarbeiter-Planung TypeScript Types
// ============================================================

export type EmployeeRole = 'monteur' | 'fahrer' | 'teamleiter' | 'bauleiter';
export type EmployeeStatus = 'active' | 'inactive' | 'on_leave';
export type SkillLevel = 'basic' | 'advanced' | 'expert';
export type AbsenceType = 'vacation' | 'sick' | 'training' | 'other';
export type AbsenceStatus = 'pending' | 'approved' | 'rejected';
export type TourStatus = 'planned' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type TourRole = 'driver' | 'worker' | 'teamlead';

// ─── Mitarbeiter ───
export interface Employee {
  id: string;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  role: EmployeeRole;
  status: EmployeeStatus;
  weekly_hours: number;
  hourly_rate: number;
  drivers_license: string | null;
  license_expires: string | null;
  home_address: string | null;
  home_lat: number | null;
  home_lng: number | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
}

// ─── Mit Skills ───
export interface EmployeeWithSkills extends Employee {
  skills: EmployeeSkill[];
  full_name: string;
  is_available_today: boolean;
}

// ─── Qualifikationen ───
export interface EmployeeSkill {
  id: string;
  created_at: string;
  employee_id: string;
  skill_name: string;
  level: SkillLevel;
  certified_until: string | null;
  certificate_number: string | null;
}

// ─── Urlaub / Krankheit ───
export interface Absence {
  id: string;
  created_at: string;
  updated_at: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  type: AbsenceType;
  status: AbsenceStatus;
  reason: string | null;
  certificate_uploaded: boolean;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  // Joined
  employee?: { id: string; first_name: string; last_name: string };
  approved_by_user?: { id: string; full_name: string } | null;
}

// ─── Tour / Einsatzplan ───
export interface TourPlan {
  id: string;
  created_at: string;
  updated_at: string;
  project_id: string | null;
  transport_order_id: string | null;
  planned_date: string;
  start_time: string | null;
  end_time: string | null;
  status: TourStatus;
  vehicle_id: string | null;
  is_optimized: boolean;
  optimization_notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  // Joined
  project?: { id: string; name: string } | null;
  transport_order?: { id: string; status: string } | null;
  assignments?: TourAssignment[];
  employee_count?: number;
}

// ─── Mitarbeiter-Zuordnung ───
export interface TourAssignment {
  id: string;
  created_at: string;
  tour_id: string;
  employee_id: string;
  role_in_tour: TourRole;
  confirmed: boolean;
  confirmed_at: string | null;
  // Joined
  employee?: Employee;
}

// ─── Dashboard Stats ───
export interface EmployeeStats {
  totalEmployees: number;
  activeEmployees: number;
  onLeaveEmployees: number;
  pendingVacations: number;
  sickToday: number;
  plannedTours: number;
}

// ─── KI-Empfehlung ───
export interface EmployeeRecommendation {
  employee_id: string;
  employee_name: string;
  reason: string;
  match_score: number; // 0-100
  conflicts: string[];
}

// ─── Verfügbarkeits-Check ───
export interface AvailabilityResult {
  employee_id: string;
  employee_name: string;
  is_available: boolean;
  conflicts: Absence[];
  current_tours: TourPlan[];
}