import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">🏗️ SCAFFOLD OS</h1>
          <div className="flex gap-3">
            <Link href="/login" className="text-sm text-slate-300 hover:text-white transition">Anmelden</Link>
            <Link href="/register" className="text-sm bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition">Registrieren</Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl text-center space-y-6">
          <h2 className="text-4xl md:text-5xl font-extrabold leading-tight">
            KI-gestützte <span className="text-orange-500">Gerüstbau-Software</span>
          </h2>
          <p className="text-lg text-slate-400">
            Aufmaß in 10 Minuten. Automatische Materialliste, Kostenkalkulation, 3D-Zwilling und PDF-Angebot.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link href="/aufmass/schritt1" className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-8 py-4 rounded-xl transition">
              Neues Projekt →
            </Link>
            <Link href="/dashboard" className="bg-slate-800 hover:bg-slate-700 text-white font-semibold px-8 py-4 rounded-xl transition">
              Dashboard
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-800 py-6 text-center text-sm text-slate-500">
        SCAFFOLD OS © 2026
      </footer>
    </div>
  );
}