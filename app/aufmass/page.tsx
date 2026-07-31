'use client';

import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  const features = [
    {
      icon: '📋',
      title: 'Digitales Aufmaß',
      desc: 'Schritt für Schritt durch die Baustellenaufnahme. Keine Information wird vergessen.',
    },
    {
      icon: '🤖',
      title: 'KI Gerüstplanung',
      desc: 'Automatische Planung nach DIN EN 12811. Jede Entscheidung wird begründet.',
    },
    {
      icon: '📦',
      title: 'Stückliste',
      desc: 'Automatische Materialberechnung mit Gewicht, Ladevolumen und Fahrzeugempfehlung.',
    },
    {
      icon: '📄',
      title: 'PDF Export',
      desc: 'Professionelle PDF-Dokumentation zum Versenden an Lieferanten und Kunden.',
    },
    {
      icon: '⚖️',
      title: 'Lastklassen',
      desc: 'Automatische Ermittlung der richtigen Lastklasse nach DIN EN 12811-1.',
    },
    {
      icon: '🛡️',
      title: 'Sicherheit',
      desc: 'Prüfung von Windzonen, Ankerung, Schutzdächern und Genehmigungen.',
    },
  ];

  const steps = [
    { nr: '1', title: 'Aufmaß', desc: 'Projekt, Gebäude, Gerüsttyp, Sicherheit, Material' },
    { nr: '2', title: 'KI Planung', desc: 'Automatische Empfehlungen mit Begründung' },
    { nr: '3', title: 'Stückliste', desc: 'Berechnung aller Positionen in Sekunden' },
    { nr: '4', title: 'PDF Export', desc: 'Professionelles Dokument zum Versenden' },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      
      {/* Navigation */}
      <nav className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏗️</span>
            <span className="text-xl font-bold tracking-tight">SCAFFOLD<span className="text-orange-500">OS</span></span>
          </div>
          <button 
            onClick={() => router.push('/aufmass')}
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-5 py-2 rounded-lg text-sm transition"
          >
            Jetzt starten
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-1.5 mb-6">
          <span className="text-orange-400 text-xs font-semibold uppercase tracking-wider">Made for Gerüstbauer</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
          Digitales Aufmaß.<br />
          <span className="text-orange-500">KI-gestützte Planung.</span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto mb-10">
          Erstelle in Minuten ein komplettes Gerüstkonzept mit automatischer Stückliste, 
          DIN-konformer Prüfung und professionellem PDF-Export.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button 
            onClick={() => router.push('/aufmass')}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 px-8 rounded-xl text-lg transition shadow-lg shadow-orange-600/20"
          >
            🚀 Kostenlos starten
          </button>
          <button 
            onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            className="bg-slate-800 hover:bg-slate-700 text-white font-semibold py-4 px-8 rounded-xl text-lg transition border border-slate-700"
          >
            Mehr erfahren
          </button>
        </div>
      </section>

      {/* Preview Image / Stats */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8 md:p-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-orange-400 mb-1">6</div>
              <div className="text-slate-400 text-sm">Schritte im Wizard</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-orange-400 mb-1">14</div>
              <div className="text-slate-400 text-sm">KI-Entscheidungen</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-orange-400 mb-1">100%</div>
              <div className="text-slate-400 text-sm">DIN EN 12811</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-orange-400 mb-1">PDF</div>
              <div className="text-slate-400 text-sm">Export sofort</div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-800/50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">So funktioniert's</h2>
            <p className="text-slate-400">Vom Aufmaß bis zum PDF in wenigen Minuten</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <div key={i} className="bg-slate-800 rounded-xl p-6 border border-slate-700 relative">
                <div className="absolute -top-3 -left-3 w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center font-bold text-sm">
                  {step.nr}
                </div>
                <h3 className="text-lg font-bold mb-2 mt-2">{step.title}</h3>
                <p className="text-slate-400 text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Alles, was du brauchst</h2>
            <p className="text-slate-400">Spezialisiert auf den Gerüstbau</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div key={i} className="bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-orange-500/50 transition group">
                <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">{f.icon}</div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-2xl p-10 md:p-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Bereit für dein nächstes Projekt?</h2>
            <p className="text-orange-100 mb-8 text-lg">
              Erstelle jetzt dein erstes digitales Aufmaß – kostenlos und ohne Anmeldung.
            </p>
            <button 
              onClick={() => router.push('/aufmass')}
              className="bg-white text-orange-700 hover:bg-orange-50 font-bold py-4 px-10 rounded-xl text-lg transition shadow-xl"
            >
              🚀 Jetzt starten
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏗️</span>
            <span className="font-bold">SCAFFOLD<span className="text-orange-500">OS</span></span>
          </div>
          <div className="text-slate-500 text-sm">
            © 2026 Scaffold OS • Digitale Lösungen für den Gerüstbau
          </div>
          <div className="text-slate-500 text-sm">
            DIN EN 12811 • TRBS 2121 • DIBt
          </div>
        </div>
      </footer>
    </div>
  );
}