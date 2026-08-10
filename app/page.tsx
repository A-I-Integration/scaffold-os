import Link from 'next/link';
import { HardHat, Building2, Rocket } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Startseite
// Bewusst schlicht: Logo + Anmelden. Alles Weitere liegt
// hinter dem Login – jeder landet automatisch in seinem
// Bereich (Rolle steht im Profil, das CEO/Dispo angelegt hat).
//
// NEU (Anfrage-Formular): Zwei dezente Buttons für
// Interessenten unter dem Anmelden-Button → /anfrage
// (öffentlich, legt KEIN Konto an, schickt nur eine E-Mail).
// ============================================================

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <HardHat className="w-20 h-20 text-amber-400 mb-6" />
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-10">SCAFFOLD OS</h1>
        <Link
          href="/login"
          className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold px-10 py-3.5 rounded-lg transition-colors text-lg"
        >
          Anmelden
        </Link>

        {/* ─── NEU: Anfragen für Interessenten ─── */}
        <div className="mt-10 flex flex-col items-center gap-4">
          <p className="text-slate-400 text-sm">Interesse an SCAFFOLD OS für Ihren Gerüstbau-Betrieb?</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/anfrage?art=nutzung"
              className="inline-flex items-center justify-center gap-2 border border-slate-600 hover:border-amber-400 text-slate-300 hover:text-amber-400 font-medium px-6 py-2.5 rounded-lg transition-colors"
            >
              <Building2 className="w-4 h-4" />
              Software nutzen
            </Link>
            <Link
              href="/anfrage?art=pilot"
              className="inline-flex items-center justify-center gap-2 border border-slate-600 hover:border-amber-400 text-slate-300 hover:text-amber-400 font-medium px-6 py-2.5 rounded-lg transition-colors"
            >
              <Rocket className="w-4 h-4" />
              Pilotprojekt anfragen
            </Link>
          </div>
        </div>
      </div>
      <footer className="pb-6 text-center text-slate-500 text-sm">
        powered by <span className="font-semibold text-slate-400">AI Integration</span>
      </footer>
    </div>
  );
}
