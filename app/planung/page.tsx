'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getEmployees,
  getAbsences,
  getTourPlans,
  getEmployeeStats,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  addEmployeeSkill,
  createAbsence,
  approveAbsence,
  rejectAbsence,
  updateAbsence,
  deleteAbsence,
  createTourPlan,
  assignEmployeeToTour,
  removeEmployeeFromTour,
  getRecommendedEmployees,
} from '@/lib/actions/employees';
import {
  EmployeeWithSkills,
  Absence,
  TourPlan,
  EmployeeStats,
  EmployeeRecommendation,
} from '@/types/employees';

type Tab = 'overview' | 'employees' | 'absences' | 'tours';

export default function PlanungPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [employees, setEmployees] = useState<EmployeeWithSkills[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [tours, setTours] = useState<TourPlan[]>([]);
  const [stats, setStats] = useState<EmployeeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showAddAbsence, setShowAddAbsence] = useState(false);
  // NEU: Abwesenheit bearbeiten (Admin/Dispo)
  const [editAbsence, setEditAbsence] = useState<Absence | null>(null);
  const [showAddTour, setShowAddTour] = useState(false);
  const [showRecommend, setShowRecommend] = useState(false);
  const [showEditEmployee, setShowEditEmployee] = useState(false);

  // NEU: KI-Umdisposition bei Ausfällen
  const [showUmdispo, setShowUmdispo] = useState(false);
  const [umdispoDate, setUmdispoDate] = useState(new Date().toISOString().slice(0, 10));
  const [umdispoLoading, setUmdispoLoading] = useState(false);
  const [umdispoResult, setUmdispoResult] = useState<{ zusammenfassung: string; vorschlaege: { tour: string; betroffen: string; ersatz: string; begruendung: string }[]; warnungen: string[] } | null>(null);
  const [umdispoError, setUmdispoError] = useState<string | null>(null);

  // Form
  const [editingEmployee, setEditingEmployee] = useState<EmployeeWithSkills | null>(null);
  const [recommendDate, setRecommendDate] = useState('');
  const [recommendations, setRecommendations] = useState<EmployeeRecommendation[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [transports, setTransports] = useState<{ id: string; status: string }[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [empData, absData, tourData, statsData] = await Promise.all([
        getEmployees(),
        getAbsences(),
        getTourPlans(),
        getEmployeeStats(),
      ]);
      setEmployees(empData);
      setAbsences(absData);
      setTours(tourData);
      setStats(statsData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    async function loadRefs() {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: p } = await supabase.from('projects').select('id, name').order('name');
      if (p) setProjects(p);
      const { data: t } = await supabase.from('transport_orders').select('id, status').eq('status', 'pending');
      if (t) setTransports(t);
    }
    loadRefs();
  }, [loadData]);

  async function handleAddEmployee(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const result = await createEmployee(new FormData(e.currentTarget));
    if (result.success) {
      setFormSuccess('Mitarbeiter erstellt!');
      setShowAddEmployee(false);
      loadData();
      setTimeout(() => setFormSuccess(null), 3000);
    } else {
      setFormError(result.error || 'Fehler');
    }
  }

  async function handleEditEmployee(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingEmployee) return;
    setFormError(null);
    const result = await updateEmployee(editingEmployee.id, new FormData(e.currentTarget));
    if (result.success) {
      setFormSuccess('Mitarbeiter aktualisiert!');
      setShowEditEmployee(false);
      setEditingEmployee(null);
      loadData();
      setTimeout(() => setFormSuccess(null), 3000);
    } else {
      setFormError(result.error || 'Fehler');
    }
  }

  async function handleDeleteEmployee(id: string) {
    if (!confirm('Mitarbeiter wirklich deaktivieren?')) return;
    const result = await deleteEmployee(id);
    if (result.success) loadData(); else alert(result.error);
  }

  async function handleAddSkill(employeeId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = await addEmployeeSkill(employeeId, new FormData(e.currentTarget));
    if (result.success) { loadData(); (e.target as HTMLFormElement).reset(); }
    else alert(result.error);
  }

  async function handleAddAbsence(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const result = await createAbsence(new FormData(e.currentTarget));
    if (result.success) {
      setFormSuccess('Abwesenheit eingetragen!');
      setShowAddAbsence(false);
      loadData();
      setTimeout(() => setFormSuccess(null), 3000);
    } else {
      setFormError(result.error || 'Fehler');
    }
  }

  async function handleApproveAbsence(id: string) {
    const result = await approveAbsence(id);
    if (result.success) loadData(); else alert(result.error);
  }

  async function handleRejectAbsence(id: string) {
    const result = await rejectAbsence(id);
    if (result.success) loadData(); else alert(result.error);
  }

  // NEU: Abwesenheit speichern (Bearbeiten-Modal)
  async function handleUpdateAbsence(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    if (!editAbsence) return;
    const result = await updateAbsence(editAbsence.id, new FormData(e.currentTarget));
    if (result.success) {
      setEditAbsence(null);
      loadData();
    } else {
      setFormError(result.error || 'Fehler beim Speichern');
    }
  }

  // NEU: Abwesenheit löschen (mit Sicherheitsabfrage)
  async function handleDeleteAbsence(abs: Absence) {
    const name = `${abs.employee?.first_name || ''} ${abs.employee?.last_name || ''}`.trim();
    const zeitraum = `${new Date(abs.start_date).toLocaleDateString('de-DE')} – ${new Date(abs.end_date).toLocaleDateString('de-DE')}`;
    if (!window.confirm(`Abwesenheit von ${name} (${zeitraum}) wirklich löschen?`)) return;
    const result = await deleteAbsence(abs.id);
    if (result.success) loadData(); else alert(result.error);
  }

  // NEU: KI-Umdisposition abrufen
  async function handleUmdispo() {
    if (!umdispoDate) return;
    setUmdispoLoading(true);
    setUmdispoError(null);
    setUmdispoResult(null);
    try {
      const res = await fetch('/api/umdisposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: umdispoDate }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Umdisposition fehlgeschlagen');
      setUmdispoResult(json);
    } catch (err: any) {
      setUmdispoError(err.message);
    } finally {
      setUmdispoLoading(false);
    }
  }

  async function handleCreateTour(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const result = await createTourPlan(new FormData(e.currentTarget));
    if (result.success) {
      setFormSuccess('Tour erstellt!');
      setShowAddTour(false);
      loadData();
      setTimeout(() => setFormSuccess(null), 3000);
    } else {
      setFormError(result.error || 'Fehler');
    }
  }

  async function handleGetRecommendations() {
    if (!recommendDate) { setFormError('Bitte Datum wählen'); return; }
    setFormError(null);
    try {
      const recs = await getRecommendedEmployees(recommendDate, ['Gerüstbau'], true);
      setRecommendations(recs);
      setShowRecommend(true);
    } catch (err: any) { setFormError(err.message); }
  }

  async function handleAssignEmployee(tourId: string, employeeId: string) {
    const result = await assignEmployeeToTour(tourId, employeeId);
    if (result.success) loadData(); else alert(result.error);
  }

  async function handleRemoveAssignment(assignmentId: string) {
    const result = await removeEmployeeFromTour(assignmentId);
    if (result.success) loadData(); else alert(result.error);
  }

  const tabClass = (tab: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Mitarbeiter-Planung</h1>
              <p className="text-sm text-gray-500 mt-1">Personal, Urlaub, Krankheit & Einsatzplanung</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowAddTour(true); setFormError(null); }} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">+ Tour</button>
              <button onClick={() => { setShowAddAbsence(true); setFormError(null); }} className="px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700">+ Abwesenheit</button>
              <button onClick={() => { setShowUmdispo(true); setUmdispoResult(null); setUmdispoError(null); }} className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700">🔮 KI-Umdisposition</button>
              <button onClick={() => { setShowAddEmployee(true); setFormError(null); }} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">+ Mitarbeiter</button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-6">
            <button onClick={() => setActiveTab('overview')} className={tabClass('overview')}>Übersicht</button>
            <button onClick={() => setActiveTab('employees')} className={tabClass('employees')}>Mitarbeiter</button>
            <button onClick={() => setActiveTab('absences')} className={tabClass('absences')}>Abwesenheiten</button>
            <button onClick={() => setActiveTab('tours')} className={tabClass('tours')}>Einsatzpläne</button>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
        {formSuccess && <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{formSuccess}</div>}

        {/* ÜBERSICHT */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-sm font-medium text-gray-500">Mitarbeiter gesamt</div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{stats?.totalEmployees || 0}</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-sm font-medium text-gray-500">Aktiv</div>
              <div className="text-3xl font-bold text-green-600 mt-2">{stats?.activeEmployees || 0}</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-sm font-medium text-gray-500">Abwesend</div>
              <div className="text-3xl font-bold text-red-600 mt-2">{stats?.onLeaveEmployees || 0}</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-sm font-medium text-gray-500">Urlaub beantragt</div>
              <div className="text-3xl font-bold text-yellow-600 mt-2">{stats?.pendingVacations || 0}</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-sm font-medium text-gray-500">Krank heute</div>
              <div className="text-3xl font-bold text-orange-600 mt-2">{stats?.sickToday || 0}</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-sm font-medium text-gray-500">Geplante Touren</div>
              <div className="text-3xl font-bold text-blue-600 mt-2">{stats?.plannedTours || 0}</div>
            </div>
          </div>
        )}

        {/* MITARBEITER */}
        {activeTab === 'employees' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-900">
                <thead className="bg-gray-100 font-semibold text-gray-800">
                  <tr>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Rolle</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Verfügbar</th>
                    <th className="px-6 py-3">Qualifikationen</th>
                    <th className="px-6 py-3">Führerschein</th>
                    <th className="px-6 py-3 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {employees.map(emp => (
                    <tr key={emp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">
                        <div>{emp.full_name}</div>
                        <div className="text-xs text-gray-500">{emp.email}</div>
                      </td>
                      <td className="px-6 py-4 text-gray-600 capitalize">{emp.role}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          emp.status === 'active' ? 'bg-green-100 text-green-800' :
                          emp.status === 'on_leave' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>{emp.status}</span>
                      </td>
                      <td className="px-6 py-4">
                        {emp.is_available_today ? (
                          <span className="text-green-600 font-semibold text-xs">✓ Verfügbar</span>
                        ) : (
                          <span className="text-red-600 font-semibold text-xs">✗ Abwesend</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {emp.skills.map(s => (
                            <span key={s.id} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                              {s.skill_name} ({s.level})
                            </span>
                          ))}
                          <form onSubmit={(e) => handleAddSkill(emp.id, e)} className="flex gap-1 mt-1">
                            <input name="skill_name" placeholder="Skill" className="w-20 px-2 py-0.5 text-xs border rounded" required />
                            <select name="level" className="w-16 text-xs border rounded">
                              <option value="basic">Basic</option>
                              <option value="advanced">Adv</option>
                              <option value="expert">Exp</option>
                            </select>
                            <button type="submit" className="text-xs text-blue-600 font-bold">+</button>
                          </form>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-xs">{emp.drivers_license || '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => { setEditingEmployee(emp); setShowEditEmployee(true); }} className="text-blue-600 text-xs mr-2 hover:underline">Bearbeiten</button>
                        <button onClick={() => handleDeleteEmployee(emp.id)} className="text-red-600 text-xs hover:underline">Deaktivieren</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {employees.length === 0 && <div className="p-8 text-center text-gray-500 text-sm">Keine Mitarbeiter</div>}
            </div>
          </div>
        )}

        {/* ABWESENHEITEN */}
        {activeTab === 'absences' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-900">
                <thead className="bg-gray-100 font-semibold text-gray-800">
                  <tr>
                    <th className="px-6 py-3">Mitarbeiter</th>
                    <th className="px-6 py-3">Typ</th>
                    <th className="px-6 py-3">Von</th>
                    <th className="px-6 py-3">Bis</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Grund</th>
                    <th className="px-6 py-3 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {absences.map(abs => (
                    <tr key={abs.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {abs.employee?.first_name} {abs.employee?.last_name}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          abs.type === 'vacation' ? 'bg-blue-100 text-blue-800' :
                          abs.type === 'sick' ? 'bg-red-100 text-red-800' :
                          abs.type === 'training' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {abs.type === 'vacation' ? 'Urlaub' : abs.type === 'sick' ? 'Krank' : abs.type === 'training' ? 'Schulung' : 'Sonstiges'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{new Date(abs.start_date).toLocaleDateString('de-DE')}</td>
                      <td className="px-6 py-4 text-gray-600">{new Date(abs.end_date).toLocaleDateString('de-DE')}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          abs.status === 'approved' ? 'bg-green-100 text-green-800' :
                          abs.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {abs.status === 'approved' ? 'Genehmigt' : abs.status === 'pending' ? 'Ausstehend' : 'Abgelehnt'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-xs">{abs.reason || '-'}</td>
                      <td className="px-6 py-4 text-right">
                        {abs.status === 'pending' && (
                          <>
                            <button onClick={() => handleApproveAbsence(abs.id)} className="text-green-600 text-xs mr-2 hover:underline">Genehmigen</button>
                            <button onClick={() => handleRejectAbsence(abs.id)} className="text-red-600 text-xs mr-2 hover:underline">Ablehnen</button>
                          </>
                        )}
                        {/* NEU: ändern & löschen immer möglich (Admin/Dispo) */}
                        <button onClick={() => { setEditAbsence(abs); setFormError(null); }} className="text-blue-600 text-xs mr-2 hover:underline">Bearbeiten</button>
                        <button onClick={() => handleDeleteAbsence(abs)} className="text-red-600 text-xs hover:underline">Löschen</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {absences.length === 0 && <div className="p-8 text-center text-gray-500 text-sm">Keine Abwesenheiten</div>}
            </div>
          </div>
        )}

        {/* TOURS */}
        {activeTab === 'tours' && (
          <div className="space-y-4">
            <div className="flex gap-2 mb-4">
              <input type="date" value={recommendDate} onChange={e => setRecommendDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
              <button onClick={handleGetRecommendations} className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700">🧠 KI-Empfehlung</button>
            </div>

            {tours.map(tour => (
              <div key={tour.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{tour.project?.name || 'Tour'} – {new Date(tour.planned_date).toLocaleDateString('de-DE')}</h3>
                    <p className="text-sm text-gray-500">{tour.start_time || '--:--'} – {tour.end_time || '--:--'} | Fahrzeug: {tour.vehicle_id || 'Nicht zugewiesen'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      tour.status === 'completed' ? 'bg-green-100 text-green-800' :
                      tour.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                      tour.status === 'confirmed' ? 'bg-purple-100 text-purple-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {tour.status === 'planned' ? 'Geplant' : tour.status === 'confirmed' ? 'Bestätigt' : tour.status === 'in_progress' ? 'Aktiv' : tour.status === 'completed' ? 'Abgeschlossen' : 'Storniert'}
                    </span>
                    {tour.is_optimized && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">KI</span>}
                  </div>
                </div>
                <div className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-700 mb-2">Zugewiesene Mitarbeiter ({tour.employee_count || 0}):</div>
                  <div className="flex flex-wrap gap-2">
                    {tour.assignments?.map(a => (
                      <span key={a.id} className="px-3 py-1 bg-gray-100 rounded-full text-xs flex items-center gap-2">
                        {a.employee?.first_name} {a.employee?.last_name} ({a.role_in_tour})
                        <button onClick={() => handleRemoveAssignment(a.id)} className="text-red-500 hover:text-red-700">×</button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-3">
                    <select onChange={e => { if (e.target.value) { handleAssignEmployee(tour.id, e.target.value); e.target.value = ''; } }} className="px-3 py-1 border rounded text-sm">
                      <option value="">+ Mitarbeiter zuweisen</option>
                      {employees.filter(e => e.is_available_today && !tour.assignments?.some(a => a.employee_id === e.id)).map(e => (
                        <option key={e.id} value={e.id}>{e.full_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
            {tours.length === 0 && <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">Keine Touren geplant</div>}
          </div>
        )}
      </div>

      {/* ADD EMPLOYEE MODAL */}
      {showAddEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Neuer Mitarbeiter</h3>
              <button onClick={() => setShowAddEmployee(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleAddEmployee} className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{formError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Vorname *</label><input name="first_name" required className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Nachname *</label><input name="last_name" required className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label><input name="email" type="email" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label><input name="phone" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Rolle</label>
                  <select name="role" className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="monteur">Monteur</option>
                    <option value="fahrer">Fahrer</option>
                    <option value="teamleiter">Teamleiter</option>
                    <option value="bauleiter">Bauleiter</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Wochenstunden</label><input name="weekly_hours" type="number" defaultValue="40" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Stundensatz (€)</label><input name="hourly_rate" type="number" step="0.01" defaultValue="0" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Führerschein</label><input name="drivers_license" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label><input name="home_address" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label><textarea name="notes" rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddEmployee(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Abbrechen</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Speichern</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT EMPLOYEE MODAL */}
      {showEditEmployee && editingEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Mitarbeiter bearbeiten</h3>
              <button onClick={() => { setShowEditEmployee(false); setEditingEmployee(null); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleEditEmployee} className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{formError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Vorname *</label><input name="first_name" defaultValue={editingEmployee.first_name} required className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Nachname *</label><input name="last_name" defaultValue={editingEmployee.last_name} required className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label><input name="email" type="email" defaultValue={editingEmployee.email || ''} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label><input name="phone" defaultValue={editingEmployee.phone || ''} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Rolle</label>
                  <select name="role" defaultValue={editingEmployee.role} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="monteur">Monteur</option>
                    <option value="fahrer">Fahrer</option>
                    <option value="teamleiter">Teamleiter</option>
                    <option value="bauleiter">Bauleiter</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select name="status" defaultValue={editingEmployee.status} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="active">Aktiv</option>
                    <option value="inactive">Inaktiv</option>
                    <option value="on_leave">Abwesend</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Wochenstunden</label><input name="weekly_hours" type="number" defaultValue={editingEmployee.weekly_hours} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Stundensatz (€)</label><input name="hourly_rate" type="number" step="0.01" defaultValue={editingEmployee.hourly_rate} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Führerschein</label><input name="drivers_license" defaultValue={editingEmployee.drivers_license || ''} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label><input name="home_address" defaultValue={editingEmployee.home_address || ''} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label><textarea name="notes" defaultValue={editingEmployee.notes || ''} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setShowEditEmployee(false); setEditingEmployee(null); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Abbrechen</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Speichern</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD ABSENCE MODAL */}
      {showAddAbsence && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Abwesenheit eintragen</h3>
              <button onClick={() => setShowAddAbsence(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleAddAbsence} className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{formError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mitarbeiter *</label>
                <select name="employee_id" required className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Bitte wählen</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Von *</label><input name="start_date" type="date" required className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Bis *</label><input name="end_date" type="date" required className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Typ *</label>
                <select name="type" required className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="vacation">Urlaub</option>
                  <option value="sick">Krankheit</option>
                  <option value="training">Schulung</option>
                  <option value="other">Sonstiges</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Grund</label><textarea name="reason" rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddAbsence(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Abbrechen</button>
                <button type="submit" className="px-4 py-2 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700">Speichern</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEU: EDIT ABSENCE MODAL (Admin/Dispo: ändern statt nur genehmigen) */}
      {editAbsence && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Abwesenheit bearbeiten</h3>
              <button onClick={() => setEditAbsence(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleUpdateAbsence} className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{formError}</div>}
              <p className="text-sm text-gray-600">
                Mitarbeiter: <strong className="text-gray-900">{editAbsence.employee?.first_name} {editAbsence.employee?.last_name}</strong>
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Von *</label>
                  <input name="start_date" type="date" required defaultValue={editAbsence.start_date} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bis *</label>
                  <input name="end_date" type="date" required defaultValue={editAbsence.end_date} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Typ *</label>
                  <select name="type" required defaultValue={editAbsence.type} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="vacation">Urlaub</option>
                    <option value="sick">Krankheit</option>
                    <option value="training">Schulung</option>
                    <option value="other">Sonstiges</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                  <select name="status" required defaultValue={editAbsence.status} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="pending">Ausstehend</option>
                    <option value="approved">Genehmigt</option>
                    <option value="rejected">Abgelehnt</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grund</label>
                <textarea name="reason" rows={2} defaultValue={editAbsence.reason || ''} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <p className="text-xs text-gray-500">
                Wird der Status auf „Genehmigt" oder „Abgelehnt" geändert,
                bekommt der Mitarbeiter automatisch eine E-Mail.
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditAbsence(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Abbrechen</button>
                <button type="submit" className="px-4 py-2 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700">Speichern</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD TOUR MODAL */}
      {showAddTour && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Tour anlegen</h3>
              <button onClick={() => setShowAddTour(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleCreateTour} className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{formError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projekt</label>
                <select name="project_id" className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Kein Projekt</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Transportauftrag</label>
                <select name="transport_order_id" className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Kein Transport</option>
                  {transports.map(t => <option key={t.id} value={t.id}>{t.id.slice(0,8)}...</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Datum *</label><input name="planned_date" type="date" required className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Fahrzeug</label><input name="vehicle_id" placeholder="z.B. K-AB 123" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Start</label><input name="start_time" type="time" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Ende</label><input name="end_time" type="time" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddTour(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Abbrechen</button>
                <button type="submit" className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Anlegen</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* KI RECOMMENDATION MODAL */}
      {showRecommend && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h3 className="text-lg font-semibold text-gray-900">🧠 KI-Mitarbeiter-Empfehlung</h3>
              <button onClick={() => setShowRecommend(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {recommendations.length === 0 ? (
                <p className="text-gray-500 text-sm">Keine Empfehlungen verfügbar.</p>
              ) : (
                recommendations.map((rec, idx) => (
                  <div key={idx} className={`p-4 rounded-lg border ${rec.match_score > 70 ? 'border-green-300 bg-green-50' : rec.match_score > 40 ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-gray-900">{rec.employee_name}</div>
                        <div className="text-sm text-gray-600 mt-1">Match-Score: <span className="font-bold">{rec.match_score}%</span></div>
                        <div className="text-sm text-gray-500 mt-1">{rec.reason}</div>
                        {rec.conflicts.length > 0 && (
                          <div className="mt-2 text-xs text-red-600">⚠️ {rec.conflicts.join(', ')}</div>
                        )}
                      </div>
                      {rec.match_score > 70 && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">TOP</span>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div className="flex justify-end pt-2">
                <button onClick={() => setShowRecommend(false)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Schließen</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: KI-UMDISPOSITION ─── */}
      {showUmdispo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowUmdispo(false)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">🔮 KI-Umdisposition bei Ausfällen</h3>
            <p className="text-sm text-gray-500 mt-1">
              Die KI prüft, welche Touren von Abwesenheiten betroffen sind, und schlägt Ersatzfahrer vor.
            </p>
            <div className="flex items-end gap-2 mt-4">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Datum</label>
                <input
                  type="date"
                  value={umdispoDate}
                  onChange={(e) => setUmdispoDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <button
                onClick={handleUmdispo}
                disabled={umdispoLoading}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {umdispoLoading ? 'KI prüft...' : 'Vorschlag erstellen'}
              </button>
            </div>

            {umdispoError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">❌ {umdispoError}</div>
            )}

            {umdispoResult && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-gray-700">{umdispoResult.zusammenfassung}</p>
                {umdispoResult.vorschlaege.map((v, i) => (
                  <div key={i} className="p-3 rounded-lg border border-purple-200 bg-purple-50">
                    <div className="font-semibold text-gray-900 text-sm">{v.tour}</div>
                    <div className="text-sm text-gray-700 mt-1">❌ {v.betroffen} → ✅ <strong>{v.ersatz}</strong></div>
                    <div className="text-xs text-gray-500 mt-1">{v.begruendung}</div>
                  </div>
                ))}
                {umdispoResult.warnungen.length > 0 && (
                  <ul className="text-sm text-yellow-700 list-disc list-inside">
                    {umdispoResult.warnungen.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
                <p className="text-xs text-gray-400">Vorschlag der KI – die Entscheidung trifft die Disposition.</p>
              </div>
            )}

            <div className="flex justify-end pt-4">
              <button onClick={() => setShowUmdispo(false)} className="px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Schließen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}