'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'bauleiter' | 'disponent'>('bauleiter')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: role,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/verify')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
      <div className="w-full max-w-md p-8 bg-[#1e293b] rounded-2xl border border-[#334155] shadow-2xl">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🏗️</div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Konto erstellen</h1>
          <p className="text-[#94a3b8] mt-2 text-sm">SCAFFOLD OS</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-[#cbd5e1] mb-1.5">
              Vollständiger Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#334155] rounded-lg text-white placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              placeholder="Max Mustermann"
              required
            />
          </div>

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
              Passwort (min. 6 Zeichen)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#334155] rounded-lg text-white placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#cbd5e1] mb-1.5">
              Rolle
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'bauleiter' | 'disponent')}
              className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#334155] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            >
              <option value="bauleiter">Bauleiter</option>
              <option value="disponent">Disponent</option>
            </select>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20"
          >
            {loading ? 'Konto wird erstellt...' : 'Konto erstellen'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#64748b]">
          Bereits registriert?{' '}
          <a href="/login" className="text-blue-400 hover:text-blue-300 font-medium transition">
            Anmelden
          </a>
        </p>
      </div>
    </div>
  )
}