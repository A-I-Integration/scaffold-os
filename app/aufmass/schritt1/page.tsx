'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PhotoUpload from '@/components/aufmaß/PhotoUpload';
import LiDARUpload from '@/components/aufmaß/LiDARUpload';
import FotoAnalyse from '@/components/aufmaß/FotoAnalyse';
import GrundrissUpload from '@/components/aufmaß/GrundrissUpload';

export default function Schritt1Page() {
  const router = useRouter();

  const [form, setForm] = useState({
    // Projekt
    name: '',
    adresse: '',

    // Ansprechpartner
    ansprechpartnerName: '',
    ansprechpartnerTelefon: '',
    ansprechpartnerEmail: '',

    // Bauleiter
    bauleiterName: '',
    bauleiterTelefon: '',
    bauleiterEmail: '',

    // Termine
    projektbeginn: '',
    projektende: '',
    arbeitszeiten: 'Mo–Fr 7:00–17:00',

    // Gewerke & Dauer
    gewerke: [] as string[],
    dauer: '4',

    // Notizen
    notizen: '',

    // Digitale Erfassung
    fotos: false,
    videos: false,
    lidar: false,
    drohnen: false,
    grundrisse: false,
    gps: false,
  });

  const [sessionId, setSessionId] = useState<string>('');

  // Session-ID für Uploads
  useEffect(() => {
    let sid = localStorage.getItem('scaffold_session_id');
    if (!sid) {
      sid = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('scaffold_session_id', sid);
    }
    setSessionId(sid);
  }, []);

  // Gespeicherte Daten laden
  useEffect(() => {
    const saved = localStorage.getItem('scaffold_step1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migration: altes Format (gewerk: string) → neues Format (gewerke: string[])
        if (parsed.gewerk && !parsed.gewerke) {
          parsed.gewerke = [parsed.gewerk];
          delete parsed.gewerk;
        }
        setForm((prev) => ({ ...prev, ...parsed }));
      } catch {
        // ignore
      }
    }
  }, []);

  const gewerkListe = [
    { id: 'Maler', icon: '🎨', color: 'bg-blue-600/20 border-blue-500 text-blue-300' },
    { id: 'WDVS/Fassade', icon: '🏢', color: 'bg-orange-600/20 border-orange-500 text-orange-300' },
    { id: 'Fenster', icon: '🪟', color: 'bg-cyan-600/20 border-cyan-500 text-cyan-300' },
    { id: 'Dach', icon: '🏠', color: 'bg-red-600/20 border-red-500 text-red-300' },
    { id: 'Putz', icon: '🧱', color: 'bg-yellow-600/20 border-yellow-500 text-yellow-300' },
    { id: 'Sonstiges', icon: '🔧', color: 'bg-gray-600/20 border-gray-500 text-gray-300' },
  ];

  const erfassungKacheln = [
    { id: 'fotos', label: 'Fotos', icon: '📸' },
    { id: 'videos', label: 'Videos', icon: '🎥' },
    { id: 'lidar', label: 'LiDAR / 3D', icon: '📐' },
    { id: 'drohnen', label: 'Drohnen', icon: '🚁' },
    { id: 'grundrisse', label: 'Grundrisse', icon: '📋' },
    { id: 'gps', label: 'GPS', icon: '📍' },
  ];

  function toggleGewerk(g: string) {
    setForm((prev) => ({
      ...prev,
      gewerke: prev.gewerke.includes(g)
        ? prev.gewerke.filter((x) => x !== g)
        : [...prev.gewerke, g],
    }));
  }

  function toggleErfassung(id: string) {
    setForm((prev) => ({ ...prev, [id]: !prev[id as keyof typeof prev] }));
  }

  function getLastklasse() {
    const g = form.gewerke;
    if (g.includes('WDVS/Fassade') || g.includes('Putz')) return 'LK 3';
    if (g.includes('Maler')) return 'LK 2';
    if (g.includes('Dach')) return 'LK 4';
    return 'LK 2';
  }

  function getStandzeit() {
    if (!form.projektbeginn || !form.projektende) return null;
    const start = new Date(form.projektbeginn);
    const ende = new Date(form.projektende);
    const diff = Math.ceil((ende.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : null;
  }

  function getWochen() {
    const tage = getStandzeit();
    return tage ? Math.ceil(tage / 7) : parseInt(form.dauer) || 4;
  }

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleWeiter() {
    if (!form.name.trim() || !form.adresse.trim()) {
      alert('Bitte gib mindestens Kunde und Adresse ein!');
      return;
    }
    if (form.gewerke.length === 0) {
      alert('Bitte wähle mindestens ein Gewerk aus!');
      return;
    }
    localStorage.setItem('scaffold_step1', JSON.stringify(form));
    router.push('/aufmass/schritt2');
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">📋 Projekt anlegen</h1>
        <p className="text-slate-400 mb-8">Baustelle: Schritt 1 von 6</p>

        <div className="bg-slate-800 rounded-xl p-6 space-y-8">

          {/* ─── PROJEKT ─── */}
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">Projekt</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Kunde / Projektname *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
                  placeholder="z.B. Musterbau GmbH"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Baustellen-Adresse *</label>
                <input
                  type="text"
                  value={form.adresse}
                  onChange={(e) => handleChange('adresse', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
                  placeholder="z.B. Musterstraße 1, 12345 Berlin"
                />
              </div>
            </div>
          </div>

          {/* ─── ANSPRECHPARTNER ─── */}
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">Ansprechpartner vor Ort</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Name</label>
                <input
                  type="text"
                  value={form.ansprechpartnerName}
                  onChange={(e) => handleChange('ansprechpartnerName', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500 transition"
                  placeholder="Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Telefon</label>
                <input
                  type="tel"
                  value={form.ansprechpartnerTelefon}
                  onChange={(e) => handleChange('ansprechpartnerTelefon', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500 transition"
                  placeholder="+49..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">E-Mail</label>
                <input
                  type="email"
                  value={form.ansprechpartnerEmail}
                  onChange={(e) => handleChange('ansprechpartnerEmail', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500 transition"
                  placeholder="email@beispiel.de"
                />
              </div>
            </div>
          </div>

          {/* ─── BAULEITER ─── */}
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">Bauleiter</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Name</label>
                <input
                  type="text"
                  value={form.bauleiterName}
                  onChange={(e) => handleChange('bauleiterName', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500 transition"
                  placeholder="Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Telefon</label>
                <input
                  type="tel"
                  value={form.bauleiterTelefon}
                  onChange={(e) => handleChange('bauleiterTelefon', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500 transition"
                  placeholder="+49..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">E-Mail</label>
                <input
                  type="email"
                  value={form.bauleiterEmail}
                  onChange={(e) => handleChange('bauleiterEmail', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500 transition"
                  placeholder="email@beispiel.de"
                />
              </div>
            </div>
          </div>

          {/* ─── TERMINE ─── */}
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">Termine</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Projektbeginn</label>
                <input
                  type="date"
                  value={form.projektbeginn}
                  onChange={(e) => handleChange('projektbeginn', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Projektende</label>
                <input
                  type="date"
                  value={form.projektende}
                  onChange={(e) => handleChange('projektende', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Arbeitszeiten</label>
                <input
                  type="text"
                  value={form.arbeitszeiten}
                  onChange={(e) => handleChange('arbeitszeiten', e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500 transition"
                  placeholder="Mo–Fr 7:00–17:00"
                />
              </div>
            </div>
            {getStandzeit() !== null && (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
                <span>📅 Standzeit:</span>
                <span className="text-orange-400 font-medium">{getStandzeit()} Tage</span>
                <span>(ca. {getWochen()} Wochen)</span>
              </div>
            )}
          </div>

          {/* ─── GEWERKE ─── */}
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">Gewerke</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {gewerkListe.map((g) => (
                <button
                  key={g.id}
                  onClick={() => toggleGewerk(g.id)}
                  className={`p-4 rounded-xl border-2 text-sm font-medium transition flex flex-col items-center gap-2 ${
                    form.gewerke.includes(g.id)
                      ? g.color + ' ring-2 ring-offset-2 ring-offset-slate-800'
                      : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <span className="text-2xl">{g.icon}</span>
                  <span>{g.id}</span>
                </button>
              ))}
            </div>
            {form.gewerke.length > 0 && (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
                <span>⚖️ Lastklasse:</span>
                <span className="text-orange-400 font-medium">{getLastklasse()}</span>
              </div>
            )}
          </div>

          {/* ─── PROJEKTDAUER ─── */}
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">Projektdauer</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Wochen</span>
                <span className="text-2xl font-bold text-orange-400">{getWochen()}</span>
              </div>
              <input
                type="range"
                min="1"
                max="52"
                value={getWochen()}
                onChange={(e) => handleChange('dauer', e.target.value)}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>1 Woche</span>
                <span>52 Wochen</span>
              </div>
            </div>
          </div>

          {/* ─── NOTIZEN ─── */}
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">Notizen</h3>
            <textarea
              value={form.notizen}
              onChange={(e) => handleChange('notizen', e.target.value)}
              rows={3}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition resize-none"
              placeholder="Besonderheiten, Zugang, Parken..."
            />
          </div>

          {/* ─── DIGITALE ERFASSUNG ─── */}
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">Digitale Erfassung</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {erfassungKacheln.map((k) => (
                <button
                  key={k.id}
                  onClick={() => toggleErfassung(k.id)}
                  className={`p-4 rounded-xl border-2 text-sm font-medium transition flex flex-col items-center gap-2 ${
                    form[k.id as keyof typeof form]
                      ? 'bg-orange-600/20 border-orange-500 text-orange-300 ring-2 ring-offset-2 ring-offset-slate-800'
                      : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <span className="text-2xl">{k.icon}</span>
                  <span>{k.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ─── FOTO-UPLOAD (nur wenn aktiviert) ─── */}
          {form.fotos && sessionId && (
            <div className="bg-slate-700/30 rounded-xl p-6 border border-slate-700">
              <h3 className="text-lg font-bold text-white mb-2">📸 Baustellen-Fotos</h3>
              <p className="text-sm text-slate-400 mb-4">
                Fotos werden mit dem Projekt verknüpft, sobald es gespeichert wird.
              </p>
              <PhotoUpload sessionId={sessionId} />
              <div className="mt-4">
                <FotoAnalyse sessionId={sessionId} />
              </div>
            </div>
          )}

          {/* ─── LiDAR-UPLOAD (nur wenn aktiviert) ─── */}
          {form.lidar && sessionId && (
            <div className="bg-slate-700/30 rounded-xl p-6 border border-slate-700">
              <h3 className="text-lg font-bold text-white mb-2">📐 LiDAR / 3D-Scan</h3>
              <p className="text-sm text-slate-400 mb-4">
                OBJ oder PLY-Datei hochladen für automatische Maßextraktion.
              </p>
              <LiDARUpload
                sessionId={sessionId}
                onMeasurements={(m) => {
                  localStorage.setItem('scaffold_lidar_measurements', JSON.stringify(m));
                }}
              />
              <p className="text-[11px] text-slate-500 mt-2">
                ✅ Erkannte Maße werden in Schritt 2 automatisch eingetragen.
              </p>
            </div>
          )}

          {/* ─── GRUNDRISS-UPLOAD + KI (nur wenn aktiviert) ─── */}
          {form.grundrisse && sessionId && (
            <div className="bg-slate-700/30 rounded-xl p-6 border border-slate-700">
              <h3 className="text-lg font-bold text-white mb-2">📋 Grundrisse / Baupläne</h3>
              <p className="text-sm text-slate-400 mb-4">
                Grundriss als Bild oder PDF hochladen – die KI liest Maße und Gebäudedaten aus
                und füllt das Aufmaß in Schritt 2 automatisch vor.
              </p>
              <GrundrissUpload sessionId={sessionId} />
            </div>
          )}

          {/* ─── WEITER ─── */}
          <div className="pt-4">
            <button
              onClick={handleWeiter}
              className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 rounded-xl transition text-lg"
            >
              Weiter zu Schritt 2 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}