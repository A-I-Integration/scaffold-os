import Link from 'next/link';
import { HardHat } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Startseite
// Bewusst schlicht: Logo + Anmelden. Alles Weitere liegt
// hinter dem Login – jeder landet automatisch in seinem
// Bereich (Rolle steht im Profil, das CEO/Dispo angelegt hat).
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
      </div>
      <footer className="pb-6 text-center text-slate-500 text-sm">
        powered by <span className="font-semibold text-slate-400">AI Integration</span>
      </footer>
    </div>
  );
}
