'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { HardHat, Ruler, Truck, Clock } from 'lucide-react'

// ============================================================
// SCAFFOLD OS – Login
// Optik-Stufe 1: Demo-Design + kurze Erklärung links.
// Die Anmelde-Logik ist unverändert (Supabase signInWithPassword).
// Registrierung ist bewusst entfernt – Zugänge legt CEO/Dispo
// unter „Zugänge" an.
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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Rolle holen → direkt in den eigenen Bereich weiterleiten.
    // Die Rolle steht im Profil – sie wurde beim Anlegen des
    // Zugangs (durch CEO/Dispo) festgelegt.
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-10 items-center">

        {/* ─── Linke Seite: Erklärung ─── */}
        <div className="text-white">
          <div className="inline-flex items-center gap-3 mb-5">
            <HardHat className="w-10 h-10 text-amber-400" />
            <h1 className="text-3xl font-bold tracking-tight">SCAFFOLD OS</h1>
          </div>
          <p className="text-slate-300 text-lg mb-8">
            Die digitale Baustellenverwaltung für den Gerüstbau – vom Aufmaß bis zur Abrechnung.
          </p>
          <ul className="space-y-4 text-sm">
            <li className="flex items-start gap-3">
              <Ruler className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <span className="text-slate-300"><strong className="text-white">Aufmaß & Angebot:</strong> Baustelle erfassen, KI erstellt Materialliste und Kalkulation.</span>
            </li>
            <li className="flex items-start gap-3">
              <Truck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <span className="text-slate-300"><strong className="text-white">Lager & Touren:</strong> Material reservieren, Touren disponieren, Fahrer navigieren digital.</span>
            </li>
            <li className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <span className="text-slate-300"><strong className="text-white">Zeiterfassung:</strong> Kommen/Gehen stempeln, Krank & Urlaub eintragen – direkt am Handy.</span>
            </li>
          </ul>

          {/* ─── Werbe-Kleber: Pilotkunden-Aktion ─── */}
          <div className="relative mt-10 max-w-md -rotate-1 rounded-xl bg-gradient-to-br from-amber-300 via-amber-400 to-orange-400 p-6 text-slate-900 shadow-2xl shadow-orange-500/20 border-4 border-dashed border-white/60">
            {/* Klebeband-Optik oben */}
            <div className="absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 rotate-2 rounded-sm bg-white/70 shadow-sm" />
            <p className="text-[11px] font-black uppercase tracking-widest text-orange-900">🔥 Nur für kurze Zeit</p>
            <h3 className="mt-1 text-2xl font-black leading-tight">Jetzt PILOTKUNDE werden!</h3>
            <div className="mt-3 space-y-1.5 text-sm font-semibold">
              <p>Aktionspreis: kleiner Betrieb <span className="text-lg font-black">199 €</span>/Monat · großer Betrieb <span className="text-lg font-black">499 €</span>/Monat</p>
              <p className="rounded-lg bg-white/50 px-3 py-1.5 font-bold">🎁 Onboarding + Einrichtung im Wert von 2.490 € <span className="underline decoration-2">geschenkt!</span></p>
              <p>Sichere dir noch bis <strong>September</strong> den Einführungspreis.</p>
            </div>
            <a
              href="/anfrage?art=pilot"
              className="mt-4 block w-full rounded-lg bg-slate-900 py-3 text-center text-sm font-black uppercase tracking-wide text-amber-400 transition hover:bg-slate-800"
            >
              Als Pilotkunde anmelden →
            </a>
            <p className="mt-2 text-center text-[11px] font-medium text-orange-900">Einfach anmelden – wir melden uns bei dir.</p>
          </div>
        </div>

        {/* ─── Rechte Seite: Login-Karte ─── */}
        <div className="w-full p-8 bg-[#1e293b] rounded-2xl border border-[#334155] shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-1">Anmelden</h2>
          <p className="text-[#94a3b8] text-sm mb-6">Mit deinem Firmenzugang einloggen.</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#cbd5e1] mb-1.5">
                E-Mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#334155] rounded-lg text-white placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
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
                className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#334155] rounded-lg text-white placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
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
              className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
            >
              {loading ? 'Anmelden...' : 'Anmelden'}
            </button>
          </form>

          <p className="mt-4 text-center">
            <a href="/passwort-vergessen" className="text-amber-400 hover:text-amber-300 text-sm font-medium transition">
              Passwort vergessen?
            </a>
          </p>

          <p className="mt-4 text-center text-sm text-[#64748b]">
            Noch kein Zugang? Deine Geschäftsführung oder Disposition legt ihn unter „Zugänge" für dich an.
          </p>
        </div>
      </div>
    </div>
  )
}
