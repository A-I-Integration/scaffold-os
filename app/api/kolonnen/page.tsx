'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ============================================================
// SCAFFOLD OS – Kolonnen-Verwaltung (Phase 55)
//
// Admin/Disposition legen Kolonnen an, weisen einen Bauleiter zu und
// verteilen Mitarbeiter – jederzeit änderbar, wie gefordert.
// ============================================================

interface Employee { id: string; first_name: string; last_name: string; kolonne_id: string | null }
interface Kolonne { id: string; name: string; bauleiter_id: string | null; bauleiter?: { id: string; first_name: string; last_name: string } | null; mitglieder: Employee[] }

export default function KolonnenPage() {
  const [kolonnen, setKolonnen] = useState<Kolonne[]>([])
  const [alleMitarbeiter, setAlleMitarbeiter] = useState<Employee[]>([])
  const [laden, setLaden] = useState(true)
  const [neuerName, setNeuerName] = useState('')
  const [neuerBauleiter, setNeuerBauleiter] = useState('')
  const [istVerwaltung, setIstVerwaltung] = useState(false)

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        setIstVerwaltung(data?.role === 'admin' || data?.role === 'disponent')
      }
    })()
  }, [])

  const laden_fn = useCallback(async () => {
    setLaden(true)
    const kRes = await fetch('/api/kolonnen').then((r) => r.json())
    if (kRes.success) { setKolonnen(kRes.kolonnen); setAlleMitarbeiter(kRes.alleMitarbeiter || []) }
    setLaden(false)
  }, [])

  useEffect(() => { laden_fn() }, [laden_fn])

  async function kolonneAnlegen() {
    if (!neuerName.trim()) return
    const res = await fetch('/api/kolonnen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: neuerName.trim(), bauleiter_id: neuerBauleiter || null }),
    })
    const json = await res.json()
    if (json.success) { setNeuerName(''); setNeuerBauleiter(''); laden_fn() }
    else alert('❌ ' + json.error)
  }

  async function kolonneAufloesen(id: string) {
    if (!confirm('Kolonne wirklich auflösen? Mitglieder bleiben erhalten, verlieren nur die Zuordnung.')) return
    await fetch(`/api/kolonnen?id=${id}`, { method: 'DELETE' })
    laden_fn()
  }

  async function mitarbeiterZuordnen(employeeId: string, kolonneId: string) {
    const res = await fetch('/api/kolonnen', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: employeeId, kolonne_id: kolonneId || null }),
    })
    const json = await res.json()
    if (json.success) laden_fn()
    else alert('❌ ' + json.error)
  }

  const zugeordneteIds = new Set(kolonnen.flatMap((k) => k.mitglieder.map((m) => m.id)))
  const unzugeordnete = alleMitarbeiter.filter((m) => !zugeordneteIds.has(m.id))

  if (laden) return <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center text-sm text-[#86868b]">Lädt…</div>

  return (
    <div className="min-h-screen bg-[#f5f5f7] p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold text-[#1d1d1f] mb-1">👷 Kolonnen-Verwaltung</h1>
        <p className="text-sm text-[#86868b] mb-6">Feste Teams mit einem Bauleiter – jederzeit umverteilbar. Der Bauleiter sieht danach in der Wochenplanung nur seine eigene Kolonne.</p>

        {istVerwaltung && (
          <div className="bg-white rounded-2xl border border-black/5 p-4 mb-6 flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs text-[#86868b] mb-1">Neue Kolonne</label>
              <input value={neuerName} onChange={(e) => setNeuerName(e.target.value)} placeholder="z.B. Kolonne 1 / Team Nord" className="w-full px-3 py-2 border rounded-xl text-sm" />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#86868b] mb-1">Bauleiter</label>
              <select value={neuerBauleiter} onChange={(e) => setNeuerBauleiter(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm">
                <option value="">– später zuweisen –</option>
                {alleMitarbeiter.map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
              </select>
            </div>
            <button onClick={kolonneAnlegen} className="px-4 py-2 bg-[#e8590c] text-white text-sm font-semibold rounded-xl">+ Anlegen</button>
          </div>
        )}

        <div className="space-y-4">
          {kolonnen.map((k) => (
            <div key={k.id} className="bg-white rounded-2xl border border-black/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-semibold text-[#1d1d1f]">{k.name}</p>
                  <p className="text-xs text-[#86868b]">Bauleiter: {k.bauleiter ? `${k.bauleiter.first_name} ${k.bauleiter.last_name}` : '– keiner zugewiesen –'}</p>
                </div>
                {istVerwaltung && <button onClick={() => kolonneAufloesen(k.id)} className="text-xs text-red-600 hover:underline">Auflösen</button>}
              </div>
              <div className="flex flex-wrap gap-2">
                {k.mitglieder.map((m) => (
                  <span key={m.id} className="px-2.5 py-1 rounded-lg bg-[#f5f5f7] text-xs flex items-center gap-1.5">
                    {m.first_name} {m.last_name}
                    {istVerwaltung && <button onClick={() => mitarbeiterZuordnen(m.id, '')} className="text-[#86868b] hover:text-red-600">✕</button>}
                  </span>
                ))}
                {k.mitglieder.length === 0 && <span className="text-xs text-[#c7c7cc]">Noch keine Mitglieder</span>}
              </div>
              {istVerwaltung && (
                <select onChange={(e) => { if (e.target.value) { mitarbeiterZuordnen(e.target.value, k.id); e.target.value = '' } }} className="mt-2 text-xs px-2 py-1 border rounded-lg">
                  <option value="">+ Mitarbeiter hinzufügen…</option>
                  {unzugeordnete.map((m) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                </select>
              )}
            </div>
          ))}
          {kolonnen.length === 0 && <p className="text-sm text-[#86868b]">Noch keine Kolonnen angelegt.</p>}
        </div>

        {unzugeordnete.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-[#1d1d1f] mb-2">Noch keiner Kolonne zugeordnet</h2>
            <div className="flex flex-wrap gap-2">
              {unzugeordnete.map((m) => <span key={m.id} className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">{m.first_name} {m.last_name}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
