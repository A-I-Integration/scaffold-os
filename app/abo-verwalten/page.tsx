'use client';

import { useState } from 'react';
import Link from 'next/link';

// ============================================================
// SCAFFOLD OS – Abo verwalten (Selbstservice für Kunden)
//
// Kunde gibt seine Kauf-E-Mail ein → wir öffnen das
// Stripe-Kundenportal: kündigen, Zahlungsart ändern,
// Rechnungen herunterladen.
// ============================================================

export default function AboVerwaltenPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [fehler, setFehler] = useState('');

  async function absenden(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFehler('');
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Fehler');
      window.location.href = json.url; // → Stripe-Kundenportal
    } catch (err: any) {
      setFehler(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm">← Zur Startseite</Link>
          <h1 className="text-3xl font-black mt-4">Abo verwalten</h1>
          <p className="text-slate-400 mt-2 text-sm">
            Kündigen, Zahlungsart ändern oder Rechnungen herunterladen.
          </p>
        </div>

        <form onSubmit={absenden} className="bg-slate-800 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">E-Mail-Adresse aus dem Kauf *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              placeholder="chef@musterbau.de"
            />
          </div>

          {fehler && (
            <div className="bg-red-900/40 border border-red-500 rounded-lg p-3 text-red-200 text-sm">{fehler}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 font-black uppercase tracking-wide py-4 rounded-xl transition"
          >
            {loading ? 'Öffne Kundenportal…' : 'Kundenportal öffnen →'}
          </button>
        </form>
      </div>
    </div>
  );
}
