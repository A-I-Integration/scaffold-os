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

// ─── Werbe-Kleber: Pilotkunden-Aktion ───
function PilotKleber({ className = '' }: { className?: string }) {
  return (
    <div className={`relative max-w-xs -rotate-2 rounded-xl bg-gradient-to-br from-amber-300 via-amber-400 to-orange-400 p-5 text-slate-900 shadow-2xl shadow-orange-500/30 border-4 border-dashed border-white/60 ${className}`}>
      {/* Klebeband-Optik oben */}
      <div className="absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 rotate-2 rounded-sm bg-white/70 shadow-sm" />
      <p className="text-[11px] font-black uppercase tracking-widest text-orange-900">🔥 Nur für kurze Zeit</p>
      <h3 className="mt-1 text-xl font-black leading-tight">Jetzt PILOTKUNDE werden!</h3>
      <div className="mt-3 space-y-1.5 text-sm font-semibold">
        <p>Aktionspreis: kleiner Betrieb <span className="text-lg font-black">199 €</span>/Monat · großer Betrieb <span className="text-lg font-black">499 €</span>/Monat</p>
        <p className="rounded-lg bg-white/50 px-3 py-1.5 font-bold">🎁 Onboarding + Einrichtung im Wert von 2.490 € <span className="underline decoration-2">geschenkt!</span></p>
        <p>Sichern Sie sich noch bis <strong>September</strong> den Einführungspreis.</p>
      </div>
      <Link
        href="/anfrage?art=pilot"
        className="mt-4 block w-full rounded-lg bg-slate-900 py-3 text-center text-sm font-black uppercase tracking-wide text-amber-400 transition hover:bg-slate-800"
      >
        Als Pilotkunde anmelden →
      </Link>
      <p className="mt-2 text-center text-[11px] font-medium text-orange-900">Einfach anmelden – wir melden uns bei Ihnen.</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col">
      {/* Kleber links (Desktop) */}
      <PilotKleber className="hidden lg:block absolute left-10 top-1/2 -translate-y-1/2 z-10" />
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

        {/* Kleber unter dem Inhalt (Handy/Tablet) */}
        <div className="lg:hidden mt-12">
          <PilotKleber />
        </div>
      </div>
      <footer className="pb-6 text-center text-slate-500 text-sm">
        powered by <span className="font-semibold text-slate-400">AI Integration</span>
      </footer>
    </div>
  );
}
