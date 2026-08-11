import Link from 'next/link';
import { HardHat, Building2, Rocket, Gift, ArrowRight } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Startseite
// Bewusst schlicht: Logo + Anmelden. Alles Weitere liegt
// hinter dem Login – jeder landet automatisch in seinem
// Bereich (Rolle steht im Profil, das CEO/Dispo angelegt hat).
//
// Anfrage-Formular: Buttons für Interessenten → /anfrage
// (öffentlich, legt KEIN Konto an, schickt nur eine E-Mail).
//
// Pilotkunden-Aktion: hochwertiger Angebotsblock mittig unter
// den Buttons + kleiner Sticky-CTA unten rechts.
// ============================================================

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <HardHat className="w-20 h-20 text-amber-400 mb-6" />
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-10">SCAFFOLD OS</h1>
        <Link
          href="/login"
          className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold px-10 py-3.5 rounded-lg transition-colors text-lg"
        >
          Anmelden
        </Link>

        {/* ─── Anfragen für Interessenten ─── */}
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

        {/* ─── Angebotsblock: Pilotkunden-Aktion ─── */}
        <div className="mt-12 w-full max-w-2xl">
          <div className="rounded-2xl bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400 p-[2px] shadow-2xl shadow-orange-500/20">
            <div className="rounded-2xl bg-slate-900/95 px-8 py-8 text-center">
              <span className="inline-block rounded-full bg-orange-500/15 border border-orange-400/40 px-4 py-1 text-[11px] font-bold uppercase tracking-widest text-orange-300">
                🔥 Nur für kurze Zeit
              </span>
              <h2 className="mt-4 text-2xl md:text-3xl font-black tracking-tight">
                Jetzt <span className="text-amber-400">Pilotkunde</span> werden
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Sichern Sie sich noch bis <strong className="text-slate-200">September</strong> den Einführungspreis.
              </p>

              {/* Preise */}
              <div className="mt-6 grid grid-cols-2 gap-4 max-w-md mx-auto">
                <div className="rounded-xl bg-slate-800/80 border border-slate-700 px-4 py-4">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Kleiner Betrieb</p>
                  <p className="mt-1 text-2xl font-black text-white">199 €<span className="text-sm font-medium text-slate-400">/Monat</span></p>
                </div>
                <div className="rounded-xl bg-slate-800/80 border border-amber-500/40 px-4 py-4">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Großer Betrieb</p>
                  <p className="mt-1 text-2xl font-black text-amber-400">499 €<span className="text-sm font-medium text-slate-400">/Monat</span></p>
                </div>
              </div>

              {/* Geschenk */}
              <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-400/30 px-4 py-2.5 text-sm font-semibold text-emerald-300">
                <Gift className="w-4 h-4 shrink-0" />
                Onboarding + Einrichtung im Wert von <span className="line-through text-slate-400">2.490 €</span> <span className="text-emerald-200 font-black">geschenkt</span>
              </div>

              <Link
                href="/anfrage?art=pilot"
                className="mt-6 inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black uppercase tracking-wide text-sm px-8 py-3.5 rounded-lg transition-colors shadow-lg shadow-amber-500/25"
              >
                Als Pilotkunde anmelden
                <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="mt-3 text-[11px] text-slate-500">Einfach anmelden – wir melden uns bei Ihnen.</p>
            </div>
          </div>
        </div>
      </div>

      <footer className="pb-6 text-center text-slate-500 text-sm">
        powered by <span className="font-semibold text-slate-400">AI Integration</span>
      </footer>

      {/* ─── Sticky CTA unten rechts ─── */}
      <Link
        href="/anfrage?art=pilot"
        className="fixed bottom-5 right-5 z-50 group flex items-center gap-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-900 pl-4 pr-5 py-3 shadow-2xl shadow-orange-500/40 transition-colors"
      >
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest leading-none">🟧 Pilotprogramm 2026</p>
          <p className="text-[11px] font-semibold mt-1 leading-tight">Einrichtung im Wert von 2.490 € inklusive</p>
          <p className="text-[11px] font-black mt-0.5 leading-none underline underline-offset-2">Pilotprojekt anfragen →</p>
        </div>
      </Link>
    </div>
  );
}
