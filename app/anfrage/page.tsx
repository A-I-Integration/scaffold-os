'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { HardHat, ArrowLeft, CheckCircle2, Send, Building2, Rocket } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Anfrage-Seite (öffentlich, ohne Login)
//
// Zwei Anliegen, ein Formular:
//   /anfrage?art=nutzung  → „Software nutzen" (Direkt-Nutzung)
//   /anfrage?art=pilot    → „Pilotprojekt" (Infos + Testphase)
//
// Die Anfrage geht per E-Mail (Resend) an AI Integration –
// es wird KEIN Konto angelegt und NICHTS in der Datenbank
// gespeichert (Registrierung bleibt geschlossen).
// ============================================================

type AnfrageArt = 'nutzung' | 'pilot';

const TEXT: Record<AnfrageArt, { titel: string; untertitel: string; button: string }> = {
  nutzung: {
    titel: 'SCAFFOLD OS nutzen',
    untertitel:
      'Sie möchten SCAFFOLD OS direkt in Ihrem Gerüstbau-Betrieb einsetzen? Schreiben Sie uns kurz, wer Sie sind – wir melden uns mit Konditionen und Einrichtung.',
    button: 'Nutzung anfragen',
  },
  pilot: {
    titel: 'Pilotprojekt anfragen',
    untertitel:
      'Sie möchten SCAFFOLD OS erst unverbindlich kennenlernen? Als Pilotkunde testen Sie die Software mit Ihren echten Abläufen – wir begleiten die Einführung persönlich.',
    button: 'Pilotprojekt anfragen',
  },
};

function AnfrageFormular() {
  const params = useSearchParams();
  const artParam = params.get('art');
  const [art, setArt] = useState<AnfrageArt>(artParam === 'pilot' ? 'pilot' : 'nutzung');

  const [name, setName] = useState('');
  const [firma, setFirma] = useState('');
  const [email, setEmail] = useState('');
  const [telefon, setTelefon] = useState('');
  const [nachricht, setNachricht] = useState('');
  const [honeypot, setHoneypot] = useState(''); // Bot-Falle, unsichtbar

  const [laden, setLaden] = useState(false);
  const [fertig, setFertig] = useState(false);
  const [fehler, setFehler] = useState('');

  async function absenden(e: React.FormEvent) {
    e.preventDefault();
    setFehler('');
    setLaden(true);
    try {
      const res = await fetch('/api/anfrage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ art, name, firma, email, telefon, nachricht, website: honeypot }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFehler(json.error || 'Senden fehlgeschlagen – bitte später erneut versuchen.');
      } else {
        setFertig(true);
      }
    } catch {
      setFehler('Keine Verbindung – bitte später erneut versuchen.');
    } finally {
      setLaden(false);
    }
  }

  const inputCls =
    'w-full bg-[#f5f5f7] border border-black/10 rounded-lg px-4 py-2.5 text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#e8590c] transition-colors';

  return (
    <div className="w-full max-w-lg p-8 bg-white rounded-2xl border border-black/10 shadow-2xl">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[#86868b] hover:text-[#e8590c] transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Zurück zur Startseite
      </Link>

      {fertig ? (
        <div className="text-center py-6">
          <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-[#1d1d1f] mb-2">Anfrage gesendet!</h1>
          <p className="text-sm text-[#86868b] mb-6">
            Vielen Dank, {name.split(' ')[0] || 'und'} – wir haben Ihre Anfrage erhalten
            und melden uns in der Regel innerhalb von 2 Werktagen bei Ihnen.
          </p>
          <Link
            href="/"
            className="inline-block bg-[#e8590c] hover:bg-[#d9480f] text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
          >
            Zur Startseite
          </Link>
        </div>
      ) : (
        <>
          {/* Umschalter: Nutzung / Pilotprojekt */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#fbfbfd] rounded-xl mb-6">
            <button
              type="button"
              onClick={() => setArt('nutzung')}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                art === 'nutzung' ? 'bg-[#e8590c] text-white' : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              <Building2 className="w-4 h-4" /> Nutzung
            </button>
            <button
              type="button"
              onClick={() => setArt('pilot')}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                art === 'pilot' ? 'bg-[#e8590c] text-white' : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              <Rocket className="w-4 h-4" /> Pilotprojekt
            </button>
          </div>

          <h1 className="text-xl font-semibold text-[#1d1d1f] mb-2">{TEXT[art].titel}</h1>
          <p className="text-sm text-[#86868b] mb-6">{TEXT[art].untertitel}</p>

          <form onSubmit={absenden} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#86868b] mb-1.5">Ihr Name *</label>
                <input required maxLength={100} value={name} onChange={e => setName(e.target.value)}
                  placeholder="Max Mustermann" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm text-[#86868b] mb-1.5">Firma *</label>
                <input required maxLength={150} value={firma} onChange={e => setFirma(e.target.value)}
                  placeholder="Gerüstbau Mustermann GmbH" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#86868b] mb-1.5">E-Mail *</label>
                <input required type="email" maxLength={150} value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="max@geruestbau.de" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm text-[#86868b] mb-1.5">Telefon (optional)</label>
                <input type="tel" maxLength={50} value={telefon} onChange={e => setTelefon(e.target.value)}
                  placeholder="0123 456789" className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-sm text-[#86868b] mb-1.5">Nachricht (optional)</label>
              <textarea rows={4} maxLength={2000} value={nachricht} onChange={e => setNachricht(e.target.value)}
                placeholder={art === 'pilot'
                  ? 'z. B. Betriebsgröße, was Sie testen möchten, Zeitraum …'
                  : 'z. B. Betriebsgröße, Anzahl Mitarbeiter, gewünschter Start …'}
                className={`${inputCls} resize-none`} />
            </div>

            {/* Bot-Falle: für Menschen unsichtbar */}
            <input
              type="text" value={honeypot} onChange={e => setHoneypot(e.target.value)}
              tabIndex={-1} autoComplete="off" aria-hidden="true"
              className="hidden" name="website"
            />

            {fehler && (
              <p className="text-sm text-red-600 bg-red-400/10 border border-red-400/30 rounded-xl px-4 py-2.5">
                {fehler}
              </p>
            )}

            <button
              type="submit" disabled={laden}
              className="w-full inline-flex items-center justify-center gap-2 bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              <Send className="w-4 h-4" />
              {laden ? 'Wird gesendet …' : TEXT[art].button}
            </button>
            <p className="text-xs text-[#64748b] text-center">
              Mit dem Absenden stimmen Sie zu, dass wir Ihre Angaben zur Bearbeitung
              der Anfrage per E-Mail verwenden. Es wird kein Konto angelegt.
            </p>
          </form>
        </>
      )}
    </div>
  );
}

export default function AnfragePage() {
  return (
    <div className="min-h-screen bg-[#fbfbfd] flex flex-col items-center justify-center p-6">
      <div className="inline-flex items-center gap-2 mb-6">
        <HardHat className="w-8 h-8 text-[#e8590c]" />
        <span className="text-xl font-bold text-[#1d1d1f] tracking-tight">SCAFFOLD OS</span>
      </div>
      <Suspense>
        <AnfrageFormular />
      </Suspense>
      <footer className="pt-8 text-center text-[#86868b] text-sm">
        powered by <span className="font-semibold text-[#86868b]">AI Integration</span>
      </footer>
    </div>
  );
}
