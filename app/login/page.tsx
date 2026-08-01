'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
      <div className="w-full max-w-md p-8 bg-[#1e293b] rounded-2xl border border-[#334155] shadow-2xl">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🏗️</div>
          <h1 className="text-2xl font-bold text-white tracking-tight">SCAFFOLD OS</h1>
          <p className="text-[#94a3b8] mt-2 text-sm">Digitales Aufmaß & KI-Planung</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-[#cbd5e1] mb-1.5">
              E-Mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#334155] rounded-lg text-white placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              placeholder="name@firma.de"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#cbd5e1] mb-1.5">
              Passwort
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#334155] rounded-lg text-white placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              placeholder="••••••••"
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
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
          >
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#64748b]">
          Noch kein Konto?{' '}
          <a href="/register" className="text-blue-400 hover:text-blue-300 font-medium transition">
            Registrieren
          </a>
        </p>
      </div>
    </div>
  )
}