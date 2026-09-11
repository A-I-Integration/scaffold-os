'use client'

import { useState, useEffect, useCallback } from 'react'

// ============================================================
// SCAFFOLD OS – Wochenplanung (Phase 54)
//
// Drag & Drop-Wochenübersicht für Disponent/CEO/Bauleiter: welcher
// Mitarbeiter ist wann welchem Projekt zugeordnet, Urlaub/Krankheit
// direkt sichtbar überlagert. Nutzt natives HTML5-Drag&Drop (kein
// Zusatzpaket nötig).
// ============================================================

interface Employee { id: string; first_name: string; last_name: string }
interface Einsatz { id: string; employee_id: string; einsatz_datum: string; project_id: string | null; project?: { id: string; name: string } | null }
interface Absence { id: string; employee_id: string; start_date: string; end_date: string; type: string; status: string }
interface Project { id: string; name: string; data?: any }

const ABSENCE_LABEL: Record<string, { label: string; farbe: string }> = {
  vacation: { label: '🏖️ Urlaub', farbe: 'bg-blue-100 text-blue-800 border-blue-300' },
  sick: { label: '🤒 Krank', farbe: 'bg-red-100 text-red-800 border-red-300' },
  training: { label: '📚 Schulung', farbe: 'bg-purple-100 text-purple-800 border-purple-300' },
  other: { label: '⏸️ Abwesend', farbe: 'bg-gray-100 text-gray-700 border-gray-300' },
}

function montagDerWoche(datum: Date): Date {
  const d = new Date(datum)
  const tag = d.getDay() || 7 // Sonntag = 0 → 7
  d.setDate(d.getDate() - tag + 1)
  d.setHours(0, 0, 0, 0)
  return d
}
function isoTag(d: Date): string { return d.toISOString().slice(0, 10) }
const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export default function WochenplanungPage() {
  const [wocheStart, setWocheStart] = useState(() => montagDerWoche(new Date()))
  const [employees, setEmployees] = useState<Employee[]>([])
  const [einsaetze, setEinsaetze] = useState<Einsatz[]>([])
  const [absences, setAbsences] = useState<Absence[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [laden, setLaden] = useState(true)
  const [ziehendesProjekt, setZiehendesProjekt] = useState<string | null>(null)
  const [kiLaeuft, setKiLaeuft] = useState(false)
  const [kiVorschlag, setKiVorschlag] = useState<any>(null)

  const tage = Array.from({ length: 7 }, (_, i) => { const d = new Date(wocheStart); d.setDate(d.getDate() + i); return d })
  const start = isoTag(tage[0])
  const ende = isoTag(tage[6])

  const laden_fn = useCallback(() => {
    setLaden(true)
    fetch(`/api/wochenplanung?start=${start}&end=${ende}`).then((r) => r.json()).then((j) => {
      if (j.success) { setEmployees(j.employees); setEinsaetze(j.einsaetze); setAbsences(j.absences); setProjects(j.projects) }
    }).finally(() => setLaden(false))
  }, [start, ende])

  useEffect(() => { laden_fn() }, [laden_fn])

  function findeAbwesenheit(employeeId: string, datum: string): Absence | undefined {
    return absences.find((a) => a.employee_id === employeeId && a.start_date <= datum && a.end_date >= datum)
  }
  function findeEinsatz(employeeId: string, datum: string): Einsatz | undefined {
    return einsaetze.find((e) => e.employee_id === employeeId && e.einsatz_datum === datum)
  }

  async function setzeEinsatz(employeeId: string, datum: string, projectId: string | null) {
    const res = await fetch('/api/wochenplanung', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: employeeId, einsatz_datum: datum, project_id: projectId }),
    })
    const json = await res.json()
    if (json.success) laden_fn()
    else alert('❌ ' + json.error)
  }

  async function entferneEinsatz(employeeId: string, datum: string) {
    await fetch(`/api/wochenplanung?employee_id=${employeeId}&einsatz_datum=${datum}`, { method: 'DELETE' })
    laden_fn()
  }

  async function holeKiVorschlag() {
    setKiLaeuft(true)
    setKiVorschlag(null)
    try {
      const res = await fetch('/api/wochenplanung/ki-vorschlag', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, ende }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setKiVorschlag(json)
    } catch (err: any) {
      alert('❌ ' + err.message)
    }
    setKiLaeuft(false)
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] p-6">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-[#1d1d1f]">📅 Wochenplanung</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setWocheStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })} className="px-3 py-1.5 rounded-lg bg-white border text-sm">← Vorherige</button>
            <span className="text-sm font-medium text-[#424245]">{isoTag(tage[0])} – {isoTag(tage[6])}</span>
            <button onClick={() => setWocheStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })} className="px-3 py-1.5 rounded-lg bg-white border text-sm">Nächste →</button>
            <button onClick={holeKiVorschlag} disabled={kiLaeuft} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">
              {kiLaeuft ? 'KI prüft…' : '🤖 KI-Vorschlag für die Woche'}
            </button>
          </div>
        </div>

        {kiVorschlag && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-sm text-blue-900">
            <p className="font-medium mb-1">🤖 KI-Einschätzung – bitte prüfen, keine automatische Änderung:</p>
            <p>{kiVorschlag.hinweis}</p>
            {kiVorschlag.vorschlaege?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {kiVorschlag.vorschlaege.map((v: any, i: number) => (
                  <li key={i} className="flex items-center justify-between bg-white rounded-lg px-2 py-1">
                    <span>{v.text}</span>
                    {v.employee_id && v.datum && v.project_id && (
                      <button onClick={() => setzeEinsatz(v.employee_id, v.datum, v.project_id)} className="text-xs px-2 py-1 bg-blue-600 text-white rounded-lg">Übernehmen</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid grid-cols-[180px_repeat(7,1fr)] gap-1.5 bg-white rounded-2xl border border-black/5 p-3 overflow-x-auto">
          <div />
          {tage.map((t, i) => (
            <div key={i} className="text-center text-xs font-semibold text-[#424245] pb-1 border-b border-black/5">
              {WOCHENTAGE[i]} <span className="text-[#86868b] font-normal">{t.getDate()}.{t.getMonth() + 1}.</span>
            </div>
          ))}

          {laden && <div className="col-span-8 text-center text-sm text-[#86868b] py-8">Lädt…</div>}

          {!laden && employees.map((mitarbeiter) => (
            <>
              <div key={mitarbeiter.id} className="text-sm font-medium text-[#1d1d1f] flex items-center py-2 border-t border-black/5">
                {mitarbeiter.first_name} {mitarbeiter.last_name}
              </div>
              {tage.map((t, i) => {
                const datum = isoTag(t)
                const abwesenheit = findeAbwesenheit(mitarbeiter.id, datum)
                const einsatz = findeEinsatz(mitarbeiter.id, datum)
                if (abwesenheit) {
                  const info = ABSENCE_LABEL[abwesenheit.type] || ABSENCE_LABEL.other
                  return (
                    <div key={i} className={`rounded-lg border text-[11px] px-1.5 py-2 flex items-center justify-center text-center border-t ${info.farbe}`}>
                      {info.label}
                    </div>
                  )
                }
                return (
                  <div
                    key={i}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (ziehendesProjekt) setzeEinsatz(mitarbeiter.id, datum, ziehendesProjekt) }}
                    className="rounded-lg border border-dashed border-black/10 min-h-[52px] flex items-center justify-center p-1 border-t"
                  >
                    {einsatz?.project ? (
                      <div
                        draggable
                        onDragStart={() => setZiehendesProjekt(einsatz.project_id)}
                        onDragEnd={() => setZiehendesProjekt(null)}
                        className="w-full bg-emerald-100 border border-emerald-300 rounded-lg px-1.5 py-1 text-[11px] text-emerald-800 cursor-move flex items-center justify-between gap-1"
                      >
                        <span className="truncate">{einsatz.project.name}</span>
                        <button onClick={() => entferneEinsatz(mitarbeiter.id, datum)} className="shrink-0 text-emerald-600 hover:text-red-600">✕</button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-[#c7c7cc]">frei</span>
                    )}
                  </div>
                )
              })}
            </>
          ))}
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-[#1d1d1f] mb-2">Projekte zum Reinziehen</h2>
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={() => setZiehendesProjekt(p.id)}
                onDragEnd={() => setZiehendesProjekt(null)}
                className="px-3 py-1.5 rounded-xl bg-white border border-black/10 text-xs font-medium text-[#1d1d1f] cursor-move hover:border-[#e8590c]"
              >
                📁 {p.name}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[#86868b] mt-2">Projekt auf einen freien Tag bei einem Mitarbeiter ziehen, um zuzuweisen. Zugewiesene Kacheln lassen sich auf einen anderen Tag/Mitarbeiter ziehen, um sie zu verschieben.</p>
        </div>
      </div>
    </div>
  )
}
