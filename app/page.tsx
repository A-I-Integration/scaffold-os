import Link from 'next/link';
import { HardHat, ArrowRight, Ruler, FileText, Route, Timer, Warehouse, ShieldCheck, Check } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Startseite (Design v2 „Apple")
// Hell, ruhig, großzügig. Marke: Sicherheits-Orange (#E8590C).
// Inhalt unverändert: Login, Kaufen, Pilot-Anfrage, Rechtliches.
// ============================================================

const FEATURES = [
  { icon: Ruler, titel: 'Aufmaß & KI-Angebot', text: 'Baustelle in 6 Schritten erfassen – die KI liefert Materialliste, Kalkulation und Angebots-PDF.' },
  { icon: Route, titel: 'Touren & Disposition', text: 'Routen-KI plant den Tag, GPS zeigt die Fahrzeuge, Umdisposition bei Krankheit oder Wetter.' },
  { icon: FileText, titel: 'Rechnungen & DATEV', text: 'GoBD-konforme Rechnungen mit Mahnwesen – Buchungsstapel und Lohndaten direkt für den Steuerberater.' },
  { icon: Timer, titel: 'Zeiterfassung', text: 'Stempeln am Handy, Soll-Ist-Vergleich, Überstunden – ohne Zettelwirtschaft.' },
  { icon: Warehouse, titel: 'Lager & Prognose', text: 'Bestände im Blick, automatische Stückliste, KI warnt bevor Material knapp wird.' },
  { icon: ShieldCheck, titel: 'Datenschutz aus Frankfurt', text: 'Eigene Datenbank pro Betrieb, EU-Hosting, DSGVO- und EU-AI-Act-konform.' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] flex flex-col">

      {/* ─── Navigation ─── */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/70 border-b border-black/5">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <HardHat className="w-5 h-5 text-[#e8590c]" />
            SCAFFOLD OS
          </span>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/login" className="text-[#6e6e73] hover:text-[#1d1d1f] transition-colors">Anmelden</Link>
            <Link
              href="/kaufen"
              className="bg-[#e8590c] hover:bg-[#d9480f] text-white font-medium px-4 py-1.5 rounded-full transition-colors"
            >
              3 Tage kostenlos testen
            </Link>
          </nav>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="px-6 pt-20 pb-16 md:pt-28 md:pb-24 text-center">
        <p className="text-sm font-semibold tracking-widest text-[#e8590c] uppercase mb-4">
          Software für Gerüstbau-Betriebe
        </p>
        <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.08] max-w-3xl mx-auto">
          Vom Kundenanruf bis zur Rechnung.
          <span className="text-[#86868b]"> Ein System.</span>
        </h1>
        <p className="mt-6 text-lg md:text-xl text-[#6e6e73] max-w-2xl mx-auto leading-relaxed">
          Aufmaß mit KI, Angebot in Minuten, Touren mit GPS, Zeiterfassung am Handy,
          GoBD-konforme Abrechnung. Ohne Installation, ohne Zettel, ohne Medienbruch.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/kaufen"
            className="inline-flex items-center gap-2 bg-[#e8590c] hover:bg-[#d9480f] text-white font-medium text-lg px-8 py-3.5 rounded-full transition-all hover:scale-[1.02] shadow-lg shadow-orange-600/20"
          >
            Jetzt abonnieren – 3 Tage kostenlos
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="/anfrage?art=pilot"
            className="text-[#e8590c] hover:underline font-medium text-lg"
          >
            Pilotprojekt anfragen →
          </Link>
        </div>
      </section>

      {/* ─── Pilotkunden-Aktion ─── */}
      <section className="px-6 pb-20">
        <div className="max-w-3xl mx-auto rounded-3xl bg-[#1d1d1f] text-white px-8 py-10 md:px-14 md:py-12 text-center shadow-2xl shadow-black/10">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#ff922b]">Pilotprogramm 2026</p>
          <h2 className="mt-3 text-2xl md:text-4xl font-semibold tracking-tight">
            Einführungspreis sichern – bis 30. September.
          </h2>
          <p className="mt-6 text-5xl font-semibold tracking-tight">
            249 €<span className="text-lg font-normal text-white/60">/Monat</span>
          </p>
          <div className="mt-6 flex flex-col items-center gap-1.5 text-sm">
            <p className="inline-flex items-center gap-2 font-semibold text-[#69db7c]">
              <Check className="w-4 h-4" /> Onboarding + Einrichtung inklusive
            </p>
            <p className="text-white/50 text-xs">Regulärer Wert: 2.490 €</p>
          </div>
          <Link
            href="/anfrage?art=pilot"
            className="mt-8 inline-flex items-center gap-2 bg-white text-[#1d1d1f] hover:bg-white/90 font-semibold px-8 py-3 rounded-full transition-all hover:scale-[1.02]"
          >
            Pilotprojekt anfragen
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="mt-3 text-xs text-white/40">Unverbindlich – wir melden uns bei Ihnen.</p>
        </div>
      </section>

      {/* ─── Funktionen ─── */}
      <section className="px-6 pb-24">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-center">
            Alles drin. <span className="text-[#86868b]">Nichts doppelt.</span>
          </h2>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12">
            {FEATURES.map((f) => (
              <div key={f.titel}>
                <f.icon className="w-7 h-7 text-[#e8590c] mb-4" strokeWidth={1.5} />
                <h3 className="font-semibold text-lg tracking-tight">{f.titel}</h3>
                <p className="mt-2 text-[#6e6e73] leading-relaxed text-[15px]">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="mt-auto border-t border-black/5 py-8 text-center text-sm text-[#86868b]">
        <div className="flex items-center justify-center gap-3 mb-3 text-[13px]">
          <Link href="/impressum" className="hover:text-[#1d1d1f] transition-colors">Impressum</Link>
          <span className="text-black/10">·</span>
          <Link href="/datenschutz" className="hover:text-[#1d1d1f] transition-colors">Datenschutz</Link>
          <span className="text-black/10">·</span>
          <Link href="/agb" className="hover:text-[#1d1d1f] transition-colors">AGB</Link>
        </div>
        powered by <span className="font-semibold text-[#6e6e73]">AI Integration</span>
      </footer>
    </div>
  );
}
