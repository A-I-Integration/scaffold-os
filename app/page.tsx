import Link from 'next/link';
import { ArrowRight, HardHat, Ruler, Warehouse, Truck, CalendarClock, Smartphone, BarChart3 } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Startseite / Landing
// Optik-Stufe 1 (Demo-Design übernommen)
// Öffentlich erreichbar – alle Bereiche dahinter sind
// durch Login + Rollen geschützt (proxy.ts).
// ============================================================

const FEATURES = [
  { icon: Ruler, title: 'Aufmaß', desc: 'Vor Ort erfassen, KI kalkuliert Material & Preis', color: 'text-amber-400' },
  { icon: Warehouse, title: 'Lager', desc: 'Bestände, Reservierungen, Transportaufträge', color: 'text-emerald-400' },
  { icon: Truck, title: 'Disposition', desc: 'Touren planen, Leerfahrten vermeiden', color: 'text-blue-400' },
  { icon: Smartphone, title: 'Fahrer-App', desc: 'Tour des Tages, Navigation, Packliste, Stempeln', color: 'text-sky-400' },
  { icon: CalendarClock, title: 'Planung', desc: 'Mitarbeiter, Einsatzpläne, Krank & Urlaub', color: 'text-rose-400' },
  { icon: BarChart3, title: 'Dashboard', desc: 'Umsatz, Marge, Betrieb heute – auf einen Blick', color: 'text-purple-400' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
        {/* ─── Hero ─── */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-3 mb-6">
            <HardHat className="w-12 h-12 text-amber-400" />
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">SCAFFOLD OS</h1>
          </div>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Die digitale Baustellenverwaltung für den Gerüstbau.
            Vom Aufmaß über Lager und Disposition bis zur Zeiterfassung – alles in einer App.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Anmelden <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Zugänge werden von der Geschäftsführung oder Disposition vergeben.
          </p>
        </div>

        {/* ─── Bereiche ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
            >
              <f.icon className={`w-10 h-10 ${f.color} mb-4`} />
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center text-slate-500 text-sm">
          <p>SCAFFOLD OS – Aufmaß · Lager · Touren · Zeiterfassung</p>
        </div>
      </div>
    </div>
  );
}
