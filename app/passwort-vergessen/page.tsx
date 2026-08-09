'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { HardHat, Mail } from 'lucide-react'

// ============================================================
// SCAFFOLD OS – Passwort vergessen
// Schickt einen Reset-Link per E-Mail (Supabase Auth).
// Der Link führt auf /passwort-reset.
// ============================================================

export default function PasswortVergessenPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/passwort-reset`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md p-8 bg-[#1e293b] rounded-2xl border border-[#334155] shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <HardHat className="w-8 h-8 text-amber-400" />
            <span className="text-xl font-bold text-white tracking-tight">SCAFFOLD OS</span>
          </div>
          <h1 className="text-lg font-semibold text-white">Passwort vergessen?</h1>
          <p className="text-[#94a3b8] text-sm mt-1">
            Gib deine E-Mail ein – wir schicken dir einen Link zum Zurücksetzen.
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="p-4 bg-emerald-900/40 border border-emerald-700 rounded-xl text-emerald-200 text-sm">
              ✅ E-Mail ist unterwegs! Klicke auf den Link in der Mail und vergib ein neues Passwort.
            </div>
            <p className="text-[#64748b] text-xs">Kein Postfach-Eingang? Schau auch im Spam-Ordner nach.</p>
            <Link href="/login" className="inline-block text-amber-400 hover:text-amber-300 text-sm font-medium">
              ← Zurück zur Anmeldung
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#cbd5e1] mb-1.5">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#334155] rounded-lg text-white placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                placeholder="name@firma.de"
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
              <Mail className="w-4 h-4" />
              {loading ? 'Sende…' : 'Link zum Zurücksetzen senden'}
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
