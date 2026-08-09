'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { HardHat, KeyRound } from 'lucide-react'

// ============================================================
// SCAFFOLD OS – Neues Passwort setzen
// Zielseite des Reset-Links aus der E-Mail.
// Supabase erkennt den Token in der URL automatisch.
// ============================================================

export default function PasswortResetPage() {
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen haben.')
      return
    }
    if (password !== password2) {
      setError('Die Passwörter stimmen nicht überein.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setDone(true)
    setLoading(false)
    setTimeout(() => router.push('/login'), 2500)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md p-8 bg-[#1e293b] rounded-2xl border border-[#334155] shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <HardHat className="w-8 h-8 text-amber-400" />
            <span className="text-xl font-bold text-white tracking-tight">SCAFFOLD OS</span>
          </div>
          <h1 className="text-lg font-semibold text-white">Neues Passwort setzen</h1>
        </div>

        {done ? (
          <div className="p-4 bg-emerald-900/40 border border-emerald-700 rounded-xl text-emerald-200 text-sm text-center">
            ✅ Passwort geändert! Du wirst zur Anmeldung weitergeleitet…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#cbd5e1] mb-1.5">Neues Passwort</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#334155] rounded-lg text-white placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                placeholder="mind. 6 Zeichen"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#cbd5e1] mb-1.5">Wiederholen</label>
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#334155] rounded-lg text-white placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                placeholder="nochmal eingeben"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              {loading ? 'Speichere…' : 'Passwort speichern'}
            </button>

            <p className="text-center">
              <Link href="/login" className="text-[#64748b] hover:text-white text-sm transition">
                ← Zurück zur Anmeldung
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
