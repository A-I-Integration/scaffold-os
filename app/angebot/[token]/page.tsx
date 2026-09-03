'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Building2 } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Angebot online ansehen & annehmen (Phase 33)
// Öffentlich, KEIN Login nötig – Zugriff nur über den Token in der
// URL. SidebarLayout zeigt hier automatisch keine Navigation an
// (kein eingeloggter Nutzer).
// ============================================================

interface AngebotDaten {
  projektName: string; adresse: string; angebotsStatus: string;
  endpreis: number | null; gerüstklasse: string | null; flaecheM2: number | null;
  company: { company_name: string; street: string; zip: string; city: string; phone: string; email: string } | null;
}

export default function OeffentlichesAngebotPage() {
  const { token } = useParams<{ token: string }>();
  const [daten, setDaten] = useState<AngebotDaten | null>(null);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState('');
  const [annehmenLaeuft, setAnnehmenLaeuft] = useState(false);
  const [angenommen, setAngenommen] = useState(false);

  useEffect(() => {
    fetch(`/api/public/angebot?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(j => {
        if (!j.success) { setFehler(j.error || 'Angebot nicht gefunden.'); return; }
        setDaten(j.angebot);
        if (j.angebot.angebotsStatus === 'angenommen') setAngenommen(true);
      })
      .catch(() => setFehler('Angebot konnte nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function annehmen() {
    setAnnehmenLaeuft(true);
    setFehler('');
    try {
      const res = await fetch('/api/public/angebot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Annahme fehlgeschlagen.');
      setAngenommen(true);
    } catch (e: any) {
      setFehler(e.message);
    }
    setAnnehmenLaeuft(false);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#fbfbfd]"><p className="text-sm text-[#86868b]">Lade Angebot…</p></div>;
  }
  if (fehler && !daten) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fbfbfd] p-6">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold text-[#1d1d1f] mb-2">Angebot nicht gefunden</p>
          <p className="text-sm text-[#86868b]">{fehler}</p>
        </div>
      </div>
    );
  }
  if (!daten) return null;

  return (
    <div className="min-h-screen bg-[#fbfbfd] p-4 md:p-8">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <div className="bg-[#1e3a8a] text-white p-6">
            <div className="flex items-center gap-2 mb-1"><Building2 className="h-5 w-5" /><span className="font-semibold">{daten.company?.company_name || 'Gerüstbau'}</span></div>
            <h1 className="text-xl font-bold">Ihr Angebot</h1>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <p className="text-xs text-[#86868b] uppercase tracking-wide">Objekt</p>
              <p className="text-[#1d1d1f] font-medium">{daten.projektName}</p>
              <p className="text-sm text-[#86868b]">{daten.adresse}</p>
            </div>

            {(daten.gerüstklasse || daten.flaecheM2) && (
              <div className="grid grid-cols-2 gap-3">
                {daten.gerüstklasse && <div className="bg-[#f5f5f7] rounded-xl p-3"><p className="text-[10px] text-[#86868b] uppercase">Gerüstklasse</p><p className="text-sm font-medium text-[#1d1d1f]">{daten.gerüstklasse}</p></div>}
                {daten.flaecheM2 && <div className="bg-[#f5f5f7] rounded-xl p-3"><p className="text-[10px] text-[#86868b] uppercase">Fläche</p><p className="text-sm font-medium text-[#1d1d1f]">{daten.flaecheM2} m²</p></div>}
              </div>
            )}

            {daten.endpreis != null && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                <p className="text-xs text-emerald-700 uppercase tracking-wide">Angebotspreis</p>
                <p className="text-2xl font-bold text-emerald-800">{daten.endpreis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</p>
              </div>
            )}

            {angenommen ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-800 font-medium">Vielen Dank! Sie haben dieses Angebot angenommen. Wir melden uns zeitnah bei Ihnen.</p>
              </div>
            ) : (
              <>
                {fehler && <p className="text-sm text-red-600">❌ {fehler}</p>}
                <button
                  onClick={annehmen}
                  disabled={annehmenLaeuft}
                  className="w-full rounded-xl bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 text-white font-semibold py-3.5 transition"
                >
                  {annehmenLaeuft ? 'Wird übermittelt…' : '✓ Angebot annehmen'}
                </button>
                <p className="text-[11px] text-[#86868b] text-center">Mit Klick auf „Angebot annehmen" bestätigen Sie die Beauftragung zu den genannten Konditionen.</p>
              </>
            )}

            {daten.company && (
              <div className="pt-4 border-t border-black/5 text-xs text-[#86868b]">
                <p>{daten.company.company_name}</p>
                <p>{daten.company.street}, {daten.company.zip} {daten.company.city}</p>
                {daten.company.phone && <p>Tel: {daten.company.phone}</p>}
                {daten.company.email && <p>{daten.company.email}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
