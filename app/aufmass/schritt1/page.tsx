'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PhotoUpload from '@/components/aufmaß/PhotoUpload';
import LiDARUpload from '@/components/aufmaß/LiDARUpload';

export default function Schritt1Page() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    adresse: '',
    gewerk: '',
    dauer: '',
    notizen: '',
  });

  const [sessionId, setSessionId] = useState<string>('');

  useEffect(() => {
    let sid = localStorage.getItem('scaffold_session_id');
    if (!sid) {
      sid = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('scaffold_session_id', sid);
    }
    setSessionId(sid);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('scaffold_step1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setForm((prev) => ({ ...prev, ...parsed }));
      } catch {
        // ignore
      }
    }
  }, []);

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleWeiter() {
    if (!form.name || !form.adresse) {
      alert('Bitte gib mindestens Kunde und Adresse ein!');
      return;
    }
    localStorage.setItem('scaffold_step1', JSON.stringify(form));
    router.push('/aufmass/schritt2');
  }

  const gewerke = [
    'Fassade',
    'Dach',
    'Kamin',
    'Werbeanlage',
    'Fenster',
    'Allgemein',
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">📋 Projekt anlegen</h1>
        <p className="text-slate-400 mb-6">Baustelle: Schritt 1 von 6</p>

        <div className="bg-slate-800 rounded-xl p-6 space-y-6">

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">
              Kunde / Projektname *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
              placeholder="z.B. Musterbau GmbH"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">
              Baustellen-Adresse *
            </label>
            <input
              type="text"
              value={form.adresse}
              onChange={(e) => handleChange('adresse', e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
              placeholder="z.B. Musterstraße 1, 12345 Berlin"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Gewerk</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {gewerke.map((g) => (
                <button
                  key={g}
                  onClick={() => handleChange('gewerk', g)}
                  className={`p-3 rounded-lg border text-sm transition ${
                    form.gewerk === g
                      ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">
              Projektdauer (Tage)
            </label>
            <input
              type="number"
              value={form.dauer}
              onChange={(e) => handleChange('dauer', e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
              placeholder="z.B. 30"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">
              Zusätzliche Notizen
            </label>
            <textarea
              value={form.notizen}
              onChange={(e) => handleChange('notizen', e.target.value)}
              rows={3}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition resize-none"
              placeholder="Besonderheiten, Ansprechpartner vor Ort..."
            />
          </div>

          {/* FOTO-UPLOAD */}
          <div className="bg-slate-700/30 rounded-xl p-6 border border-slate-700">
            <h3 className="text-lg font-bold text-white mb-2">📸 Baustellen-Fotos</h3>
            <p className="text-sm text-slate-400 mb-4">
              Fotos werden mit dem Projekt verknüpft, sobald es gespeichert wird.
              Auf dem Handy öffnet sich direkt die Kamera.
            </p>
            {sessionId ? (
              <PhotoUpload sessionId={sessionId} />
            ) : (
              <div className="h-20 animate-pulse rounded-lg bg-slate-700"></div>
            )}
          </div>

          {/* LiDAR / 3D-SCAN */}
          <div className="bg-slate-700/30 rounded-xl p-6 border border-slate-700">
            <h3 className="text-lg font-bold text-white mb-2">📱 LiDAR / 3D-Scan</h3>
            <p className="text-sm text-slate-400 mb-4">
              Lade einen 3D-Scan hoch. Die Maße werden automatisch extrahiert.
            </p>
            {sessionId ? (
              <LiDARUpload sessionId={sessionId} />
            ) : (
              <div className="h-16 animate-pulse rounded-lg bg-slate-700" />
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => router.push('/')}
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