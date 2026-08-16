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
    <div className="min-h-screen bg-white text-[#1d1d1f] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-[#86868b] hover:text-[#424245] text-sm">← Zur Startseite</Link>
          <h1 className="text-3xl font-black mt-4">Abo verwalten</h1>
          <p className="text-[#86868b] mt-2 text-sm">
            Kündigen, Zahlungsart ändern oder Rechnungen herunterladen.
          </p>
        </div>

        <form onSubmit={absenden} className="bg-[#f5f5f7] rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-[#424245]">E-Mail-Adresse aus dem Kauf *</label>
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
            {loading ? 'Öffne Kundenportal…' : 'Kundenportal öffnen →'}
          </button>
        </form>
      </div>
    </div>
  );
}
