'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { HardHat, Ruler, Route, Timer } from 'lucide-react'

// ============================================================
// SCAFFOLD OS – Login (Design v2 „Apple")
// Helle, ruhige Karte auf neutralem Grau. Die Anmelde-Logik ist
// unverändert (Supabase signInWithPassword + Rollen-Routing).
// Registrierung bleibt bewusst entfernt – Zugänge legt
// CEO/Dispo unter „Zugänge" an.
// ============================================================

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

    // Demo-Gate: Nur aktiv, wenn auf dieser Instanz DEMO_LOGIN_EMAIL
    // gesetzt ist (Demo-Instanz). Sonst antwortet die Route mit
    // { demo: false } und der Login läuft exakt wie bisher.
    try {
      const gate = await fetch('/api/auth/demo-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phase: 'check' }),
      })
      if (gate.status === 403) {
        setError('Dieser Demo-Zugang wurde von diesem Anschluss bereits genutzt. Fordern Sie gern einen persönlichen Testzugang über scaffoldos.de/kaufen an – 3 Tage kostenlos.')
        setLoading(false)
        return
      }
    } catch {
      // Gate nicht erreichbar → Login normal versuchen (Demo nie hart blockieren)
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Login erfolgreich → IP im Demo-Gate registrieren (fire-and-forget;
    // auf Nicht-Demo-Instanzen ein No-Op)
    fetch('/api/auth/demo-gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phase: 'register' }),
    }).catch(() => {})

    // Rolle holen → direkt in den eigenen Bereich weiterleiten.
    const { data: { user } } = await supabase.auth.getUser()
    let target = '/meine-touren'
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      const role = profile?.role
      if (role === 'admin' || role === 'disponent') target = '/dashboard'
      else if (role === 'bauleiter') target = '/aufmass/schritt1'
      else if (role === 'lager') target = '/lager'
    }
    router.push(target)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-6">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-12 items-center">

        {/* ─── Linke Seite: Marke & Nutzen ─── */}
        <div className="hidden md:block">
          <div className="inline-flex items-center gap-2.5 mb-6">
            <HardHat className="w-8 h-8 text-[#e8590c]" strokeWidth={1.5} />
            <span className="text-2xl font-semibold tracking-tight text-[#1d1d1f]">SCAFFOLD OS</span>
          </div>
          <p className="text-[#1d1d1f] text-2xl font-medium tracking-tight leading-snug mb-10">
            Die digitale Baustellenverwaltung für den Gerüstbau – vom Aufmaß bis zur Abrechnung.
          </p>
          <ul className="space-y-6">
            <li className="flex items-start gap-3.5">
              <Ruler className="w-5 h-5 text-[#e8590c] shrink-0 mt-0.5" strokeWidth={1.5} />
              <span className="text-[15px] text-[#6e6e73] leading-relaxed">
                <strong className="text-[#1d1d1f] font-medium">Aufmaß & Angebot:</strong> Baustelle erfassen, KI erstellt Materialliste und Kalkulation.
              </span>
            </li>
            <li className="flex items-start gap-3.5">
              <Route className="w-5 h-5 text-[#e8590c] shrink-0 mt-0.5" strokeWidth={1.5} />
              <span className="text-[15px] text-[#6e6e73] leading-relaxed">
                <strong className="text-[#1d1d1f] font-medium">Lager & Touren:</strong> Material reservieren, Touren disponieren, Fahrer navigieren digital.
              </span>
            </li>
            <li className="flex items-start gap-3.5">
              <Timer className="w-5 h-5 text-[#e8590c] shrink-0 mt-0.5" strokeWidth={1.5} />
              <span className="text-[15px] text-[#6e6e73] leading-relaxed">
                <strong className="text-[#1d1d1f] font-medium">Zeiterfassung:</strong> Kommen/Gehen stempeln, Krank & Urlaub eintragen – direkt am Handy.
              </span>
            </li>
          </ul>
        </div>

        {/* ─── Rechte Seite: Login-Karte ─── */}
        <div className="w-full bg-white rounded-3xl px-8 py-10 md:px-10 shadow-[0_8px_40px_rgba(0,0,0,0.06)] border border-black/[0.04]">
          {/* Mobile: Marke über der Karte-Inhalt */}
          <div className="flex md:hidden items-center gap-2 mb-6">
            <HardHat className="w-6 h-6 text-[#e8590c]" strokeWidth={1.5} />
            <span className="text-lg font-semibold tracking-tight text-[#1d1d1f]">SCAFFOLD OS</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-[#1d1d1f]">Anmelden</h1>
          <p className="text-[#86868b] text-sm mt-1 mb-8">Mit Ihrem Firmenzugang einloggen.</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[13px] font-medium text-[#6e6e73] mb-1.5">
                E-Mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[#f5f5f7] border border-transparent rounded-xl text-[#1d1d1f] placeholder-[#aeaeb2] focus:outline-none focus:bg-white focus:border-[#e8590c]/40 focus:ring-4 focus:ring-[#e8590c]/10 transition"
                placeholder="name@firma.de"
                required
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#6e6e73] mb-1.5">
                Passwort
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#f5f5f7] border border-transparent rounded-xl text-[#1d1d1f] placeholder-[#aeaeb2] focus:outline-none focus:bg-white focus:border-[#e8590c]/40 focus:ring-4 focus:ring-[#e8590c]/10 transition"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="px-4 py-3 bg-[#fff0f0] border border-[#ffc9c9] rounded-xl text-[#c92a2a] text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-[#e8590c] hover:bg-[#d9480f] text-white font-medium rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
            >
              {loading ? 'Anmelden …' : 'Anmelden'}
            </button>
          </form>

          <p className="mt-5 text-center">
            <a href="/passwort-vergessen" className="text-[#e8590c] hover:underline text-sm font-medium">
              Passwort vergessen?
            </a>
          </p>

          <p className="mt-5 text-center text-[13px] text-[#86868b] leading-relaxed">
            Noch kein Zugang? Ihre Geschäftsführung oder Disposition legt ihn unter „Zugänge" für Sie an.
          </p>
        </div>
      </div>
    </div>
  )
}
