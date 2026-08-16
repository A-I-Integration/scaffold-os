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
    <div className="min-h-screen bg-[#fbfbfd] flex items-center justify-center p-6">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl border border-black/10 shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <HardHat className="w-8 h-8 text-[#e8590c]" />
            <span className="text-xl font-bold text-[#1d1d1f] tracking-tight">SCAFFOLD OS</span>
          </div>
          <h1 className="text-lg font-semibold text-[#1d1d1f]">Neues Passwort setzen</h1>
        </div>

        {done ? (
          <div className="p-4 bg-emerald-900/40 border border-emerald-200 rounded-xl text-emerald-700 text-sm text-center">
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
                className="w-full px-4 py-2.5 bg-[#fbfbfd] border border-black/10 rounded-xl text-[#1d1d1f] placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-[#e8590c] focus:border-transparent transition"
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
                className="w-full px-4 py-2.5 bg-[#fbfbfd] border border-black/10 rounded-xl text-[#1d1d1f] placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-[#e8590c] focus:border-transparent transition"
                placeholder="nochmal eingeben"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#e8590c] hover:bg-[#d9480f] text-white font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              {loading ? 'Speichere…' : 'Passwort speichern'}
            </button>

            <p className="text-center">
              <Link href="/login" className="text-[#64748b] hover:text-[#1d1d1f] text-sm transition">
                ← Zurück zur Anmeldung
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
