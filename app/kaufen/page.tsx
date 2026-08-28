'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { Check } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Kauf-Seite (Abo abschließen)
//
// Sammelt Firma/Name/E-Mail und schickt den Kunden zum
// Stripe-Checkout (SEPA-Lastschrift oder Kreditkarte,
// 3 Tage kostenlos testen, Mindestvertragslaufzeit 24 Monate).
// Die eigentliche Zahlung läuft komplett bei Stripe.
//
// Das Paket kommt per URL: /kaufen?plan=starter|priority|enterprise
// (Standard: starter). Die Preis-Zuordnung passiert serverseitig
// in /api/stripe/checkout über die STRIPE_PRICE_ID_*-Variablen.
// ============================================================

const PLAENE: Record<string, { name: string; preis: string; features: string[] }> = {
  starter: {
    name: 'Starter',
    preis: '249 €',
    features: ['1 Admin-/CEO-Zugang', '2 Dispo-Zugänge', 'Bis zu 5 Mitarbeiter', 'Lager bis 10.000 Teile'],
  },
  priority: {
    name: 'Priority',
    preis: '495 €',
    features: ['CEO-, Dispo-, Bauleiter- & Lager-Zugänge', 'Bis zu 20 Mitarbeiter', 'Lager bis 20.000 Teile'],
  },
  enterprise: {
    name: 'Enterprise',
    preis: '749 €',
    features: ['Alle Rollen unbegrenzt', 'Mitarbeiter unbegrenzt', 'Lager unbegrenzt'],
  },
};

// Vorauszahlung: 36 Monate auf einmal → 5 % Erlass (Abwicklung per Rechnung/Überweisung)
const VORAUSZAHLUNG: Record<string, { monat: number; gesamt: string; rabatt: string; ersparnis: string }> = {
  starter: { monat: 249, gesamt: '8.964 €', rabatt: '8.515,80 €', ersparnis: '448,20 €' },
  priority: { monat: 495, gesamt: '17.820 €', rabatt: '16.929 €', ersparnis: '891 €' },
  enterprise: { monat: 749, gesamt: '26.964 €', rabatt: '25.615,80 €', ersparnis: '1.348,20 €' },
};

function KaufenForm() {
  const [firma, setFirma] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [fehler, setFehler] = useState('');
  const params = useSearchParams();
  const abgebrochen = params.get('abgebrochen') === '1';

  const planId = params.get('plan') || 'starter';
  const plan = PLAENE[planId] || PLAENE.starter;

  async function absenden(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFehler('');
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: firma, admin_name: name, admin_email: email, plan: planId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Checkout fehlgeschlagen');
      window.location.href = json.url; // → Stripe
    } catch (err: any) {
      setFehler(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-[#86868b] hover:text-[#424245] text-sm">← Zur Startseite</Link>
          <h1 className="text-3xl font-black mt-4">SCAFFOLD OS abonnieren</h1>
          <p className="text-[#86868b] mt-2 text-sm">
            3 Tage kostenlos testen, danach{' '}
            <span className="text-[#e8590c] font-bold">{plan.preis}/Monat</span> ({plan.name}).
            Mindestvertragslaufzeit 24 Monate, danach monatlich kündbar.
          </p>
        </div>

        {/* Gewähltes Paket */}
        <div className="mb-6 bg-[#f5f5f7] rounded-xl p-5">
          <div className="flex items-baseline justify-between">
            <p className="font-bold text-lg">{plan.name}</p>
            <p className="text-[#e8590c] font-bold">{plan.preis}<span className="text-[#86868b] font-normal text-sm">/Monat</span></p>
          </div>
          <ul className="mt-3 space-y-1.5">
            {plan.features.map((f) => (
              <li key={f} className="flex gap-2 text-sm text-[#424245]">
                <Check className="w-4 h-4 text-[#e8590c] shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[#86868b]">
            Anderes Paket? <Link href="/#pakete" className="text-[#e8590c] hover:underline">Zur Paket-Übersicht</Link>
          </p>
        </div>

        {/* Vorauszahlungs-Angebot: 36 Monate auf einmal → 5 % Erlass */}
        <div className="mb-6 bg-[#fff4ec] border border-[#e8590c]/30 rounded-xl p-5">
          <p className="text-sm font-bold text-[#1d1d1f]">
            Lieber auf einmal zahlen? <span className="text-[#e8590c]">5 % sparen</span>
          </p>
          <p className="mt-1.5 text-sm text-[#6e6e73] leading-relaxed">
            {plan.name} für 36 Monate: statt {VORAUSZAHLUNG[planId]?.gesamt ?? VORAUSZAHLUNG.starter.gesamt} nur{' '}
            <span className="font-bold text-[#1d1d1f]">{VORAUSZAHLUNG[planId]?.rabatt ?? VORAUSZAHLUNG.starter.rabatt}</span>{' '}
            (Ersparnis {VORAUSZAHLUNG[planId]?.ersparnis ?? VORAUSZAHLUNG.starter.ersparnis}).
            Abwicklung per Rechnung und Überweisung statt Stripe-Abo.
          </p>
          <p className="mt-2 text-xs text-[#86868b]">
            Interesse?{' '}
            <a
              href={`mailto:info@scaffoldos.de?subject=Vorauszahlung%2036%20Monate%20(${plan.name})`}
              className="text-[#e8590c] hover:underline font-semibold"
            >
              Kurze E-Mail an info@scaffoldos.de
            </a>{' '}
            genügt – wir stellen die Rechnung aus.
          </p>
        </div>

        {abgebrochen && (
          <div className="mb-6 bg-orange-50 border border-[#e8590c]/40 rounded-xl p-4 text-amber-800 text-sm">
            Der Bezahlvorgang wurde abgebrochen – es wurde nichts abgebucht. Du kannst es hier jederzeit erneut versuchen.
          </div>
        )}

        <form onSubmit={absenden} className="bg-[#f5f5f7] rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-[#424245]">Firma *</label>
            <input
              type="text"
              value={firma}
              onChange={(e) => setFirma(e.target.value)}
              required
              className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-3 text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#e8590c] transition"
              placeholder="z. B. Musterbau Gerüstbau GmbH"
            />
            <p className="text-[11px] text-[#86868b] mt-1">Daraus entsteht deine Subdomain, z. B. musterbau-gerüstbau.scaffoldos.de</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-[#424245]">Dein Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-3 text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#e8590c] transition"
              placeholder="Max Mustermann"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-[#424245]">E-Mail (wird dein Login) *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-3 text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#e8590c] transition"
              placeholder="chef@musterbau.de"
            />
          </div>

          {fehler && (
            <div className="bg-red-900/40 border border-red-500 rounded-xl p-3 text-red-700 text-sm">{fehler}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 text-white font-black uppercase tracking-wide py-4 rounded-xl transition"
          >
            {loading ? 'Weiter zu Stripe…' : `Jetzt 3 Tage kostenlos testen →`}
          </button>

          <p className="text-[11px] text-[#86868b] text-center leading-relaxed">
            Sichere Zahlung über Stripe (SEPA-Lastschrift oder Kreditkarte).<br />
            Erste Abbuchung erst nach der 3-tägigen Testphase. Monatliche Rechnung per E-Mail.<br />
            Vertragslaufzeit: 24 Monate, danach monatlich kündbar.<br />
            Mit dem Kauf akzeptierst du unsere{' '}
            <Link href="/agb" className="underline hover:text-[#424245]">AGB</Link> und{' '}
            <Link href="/datenschutz" className="underline hover:text-[#424245]">Datenschutzerklärung</Link>.
          </p>
        </form>

        <p className="text-center text-xs text-[#86868b] mt-4">
          Schon Kunde? <Link href="/login" className="text-[#e8590c] hover:underline">Zum Login</Link>
          {' · '}
          <Link href="/abo-verwalten" className="text-[#e8590c] hover:underline">Abo verwalten</Link>
        </p>
      </div>
    </div>
  );
}

export default function KaufenPage() {
  return (
    <Suspense>
      <KaufenForm />
    </Suspense>
  );
}
