'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Schritt2Page() {
  const router = useRouter();
  const [form, setForm] = useState({
    untergrund: '',
    gefaelle: false,
    lichtschaechte: false,
    lastverteilung: false,
  });
  const [gespeichert, setGespeichert] = useState(false);

  const untergrundTypen = [
    { id: 'asphalt', label: 'Asphalt' },
    { id: 'beton', label: 'Beton' },
    { id: 'pflaster', label: 'Pflaster' },
    { id: 'schotter', label: 'Schotter' },
    { id: 'rasen', label: 'Rasen / Erde' },
  ];

  function handleWeiter() {
    if (!form.untergrund) {
      alert('Bitte wähle einen Untergrundtyp aus!');
      return;
    }
    setGespeichert(true);
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-orange-400 text-sm font-semibold">Schritt 2 von 6</span>
        </div>
        <h1 className="text-3xl font-bold mb-2">🌍 Untergrund & Gelände</h1>
        <p className="text-slate-400 mb-8">Prüfung des Baustellen-Untergrunds für sichere Gerüstfundamente.</p>

        <div className="bg-slate-800 rounded-xl p-6 space-y-6">
          
          {/* Untergrundtyp */}
          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Untergrundtyp *</label>
            <div className="grid grid-cols-2 gap-3">
              {untergrundTypen.map(u => (
                <button
                  key={u.id}
                  onClick={() => { setForm({...form, untergrund: u.id}); setGespeichert(false); }}
                  className={`p-3 rounded-lg border text-left transition ${
                    form.untergrund === u.id
                      ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="font-semibold text-sm">{u.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Gefälle */}
          <div>
            <button
              onClick={() => { setForm({...form, gefaelle: !form.gefaelle}); setGespeichert(false); }}
              className={`w-full p-3 rounded-lg border text-left transition flex items-center justify-between ${
                form.gefaelle
                  ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                  : 'bg-slate-700 border-slate-600 text-slate-300'
              }`}
            >
              <div>
                <div className="font-semibold text-sm">Gefälle vorhanden</div>
                <div className="text-xs opacity-70">Hang, Schräge, Neigung</div>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                form.gefaelle ? 'border-orange-500 bg-orange-500' : 'border-slate-500'
              }`}>
                {form.gefaelle && <span className="text-white text-xs">✓</span>}
              </div>
            </button>
          </div>

          {/* Lichtschächte */}
          <div>
            <button
              onClick={() => { setForm({...form, lichtschaechte: !form.lichtschaechte}); setGespeichert(false); }}
              className={`w-full p-3 rounded-lg border text-left transition flex items-center justify-between ${
                form.lichtschaechte
                  ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                  : 'bg-slate-700 border-slate-600 text-slate-300'
              }`}
            >
              <div>
                <div className="font-semibold text-sm">Unterkellert / Lichtschächte</div>
                <div className="text-xs opacity-70">Kellerfenster, Lichtschächte im Bereich</div>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                form.lichtschaechte ? 'border-orange-500 bg-orange-500' : 'border-slate-500'
              }`}>
                {form.lichtschaechte && <span className="text-white text-xs">✓</span>}
              </div>
            </button>
            {form.lichtschaechte && (
              <div className="mt-2 p-2 bg-yellow-900/30 border border-yellow-600 rounded text-yellow-400 text-sm">
                ⚠️ Lastverteilung unter allen Gerüstfüßen zwingend erforderlich!
              </div>
            )}
          </div>

          {/* Lastverteilung */}
          <div>
            <button
              onClick={() => { setForm({...form, lastverteilung: !form.lastverteilung}); setGespeichert(false); }}
              className={`w-full p-3 rounded-lg border text-left transition flex items-center justify-between ${
                form.lastverteilung
                  ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                  : 'bg-slate-700 border-slate-600 text-slate-300'
              }`}
            >
              <div>
                <div className="font-semibold text-sm">Lastverteilung erforderlich</div>
                <div className="text-xs opacity-70">Fundamentplatten / Unterlagen nötig</div>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                form.lastverteilung ? 'border-orange-500 bg-orange-500' : 'border-slate-500'
              }`}>
                {form.lastverteilung && <span className="text-white text-xs">✓</span>}
              </div>
            </button>
          </div>

          {/* Ergebnis */}
          {gespeichert && (
            <div className="p-4 bg-green-900/30 border border-green-600 rounded-lg">
              <div className="text-green-400 font-semibold mb-2">✅ Schritt 2 gespeichert</div>
              <div className="text-sm text-slate-300 space-y-1">
                <div>Untergrund: <strong>{untergrundTypen.find(u => u.id === form.untergrund)?.label}</strong></div>
                <div>Gefälle: <strong>{form.gefaelle ? 'Ja' : 'Nein'}</strong></div>
                <div>Lichtschächte: <strong>{form.lichtschaechte ? 'Ja' : 'Nein'}</strong></div>
                <div>Lastverteilung: <strong>{form.lastverteilung ? 'Ja' : 'Nein'}</strong></div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3">
            <button 
              onClick={() => router.push('/aufmass')}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded-lg transition"
            >
              ← Zurück
            </button>
            <button 
              onClick={handleWeiter}
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-lg transition"
            >
              Weiter →
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}