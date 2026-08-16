'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PhotoUpload from '@/components/aufmaß/PhotoUpload';
import LiDARUpload from '@/components/aufmaß/LiDARUpload';
import FotoAnalyse from '@/components/aufmaß/FotoAnalyse';
import GrundrissUpload from '@/components/aufmaß/GrundrissUpload';
import SprachNotiz from '@/components/aufmaß/SprachNotiz';

const LEERES_FORM = {
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
  lidar: false,
  grundrisse: false,
  gps: false,
  gpsPosition: '',
};

// Alle Wizard-Schlüssel, die ein Aufmaß im Browser ablegt
const WIZARD_KEYS = [
  'scaffold_step1',
  'scaffold_step2',
  'scaffold_step3',
  'scaffold_step4',
  'scaffold_step5',
  'scaffold_step6',
  'scaffold_lidar_measurements',
  'scaffold_foto_daten',
  'scaffold_foto_analyse',
  'scaffold_grundriss_daten',
  'scaffold_grundriss_analyse',
  'scaffold_grundriss_fresh',
];

export default function Schritt1Page() {
  const router = useRouter();

  const [form, setForm] = useState({ ...LEERES_FORM });

  const [sessionId, setSessionId] = useState<string>('');
  const [hatAlteDaten, setHatAlteDaten] = useState(false);

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
    // Hinweis anzeigen, wenn irgendwo noch Wizard-Daten liegen
    const irgendwoDaten = WIZARD_KEYS.some((k) => localStorage.getItem(k) !== null);
    setHatAlteDaten(irgendwoDaten);
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
    { id: 'WDVS/Fassade', icon: '🏢', color: 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' },
    { id: 'Fenster', icon: '🪟', color: 'bg-cyan-600/20 border-cyan-500 text-cyan-300' },
    { id: 'Dach', icon: '🏠', color: 'bg-red-600/20 border-red-500 text-red-300' },
    { id: 'Putz', icon: '🧱', color: 'bg-yellow-600/20 border-yellow-500 text-yellow-300' },
    { id: 'Sonstiges', icon: '🔧', color: 'bg-gray-600/20 border-gray-500 text-gray-300' },
  ];

  const erfassungKacheln = [
    { id: 'fotos', label: 'Fotos', icon: '📸' },
    { id: 'lidar', label: 'LiDAR / 3D', icon: '📐' },
    { id: 'grundrisse', label: 'Grundrisse', icon: '📋' },
    { id: 'gps', label: 'GPS-Standort', icon: '📍' },
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

  // GPS-Standort der Baustelle per Browser-Geolocation erfassen
  const [gpsStatus, setGpsStatus] = useState<'bereit' | 'laedt' | 'fehler'>('bereit');
  function captureGps() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('fehler');
      return;
    }
    setGpsStatus('laedt');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setForm((prev) => ({ ...prev, gpsPosition: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` }));
        setGpsStatus('bereit');
      },
      () => setGpsStatus('fehler'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
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

  function handleNeuBeginnen() {
    if (!window.confirm('Wirklich neu beginnen? Alle bisherigen Aufmaß-Eingaben (Schritte 1–6, Fotos, LiDAR, Grundriss) werden gelöscht.')) {
      return;
    }
    WIZARD_KEYS.forEach((k) => localStorage.removeItem(k));
    const neueSid = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('scaffold_session_id', neueSid);
    setSessionId(neueSid);
    setForm({ ...LEERES_FORM });
    setHatAlteDaten(false);
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
    <div className="min-h-screen bg-white text-[#1d1d1f] p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">📋 Projekt anlegen</h1>
        <p className="text-[#86868b] mb-8">Baustelle: Schritt 1 von 6</p>

        {hatAlteDaten && (
          <div className="mb-6 bg-orange-50 border border-[#e8590c]/40 rounded-xl p-4">
            <p className="text-amber-800 text-sm font-medium mb-1">
              ⚠️ Es sind noch Daten eines früheren Aufmaßes gespeichert.
            </p>
            <p className="text-[#e8590c]/80 text-xs mb-3">
              Diese bleiben im Browser erhalten – auch nach Schließen der Seite. Für eine neue Baustelle solltest du neu beginnen, sonst tauchen alte Werte wieder auf.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setHatAlteDaten(false)}
                className="flex-1 bg-black/10 hover:bg-black/15 text-[#1d1d1f] text-sm font-medium py-2 px-4 rounded-xl transition"
              >
                Fortsetzen (Daten behalten)
              </button>
              <button
                onClick={handleNeuBeginnen}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white text-sm font-bold py-2 px-4 rounded-xl transition"
              >
                🗑️ Neu beginnen (alles löschen)
              </button>
            </div>
          </div>
        )}

        <div className="bg-[#f5f5f7] rounded-xl p-6 space-y-8">

          {/* ─── PROJEKT ─── */}
          <div className="border-b border-black/10 pb-6">
            <h3 className="text-[#e8590c] text-xs font-bold uppercase tracking-wider mb-4">Projekt</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-[#424245]">Kunde / Projektname *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-3 text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-orange-500 transition"
                  placeholder="z.B. Musterbau GmbH"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-[#424245]">Baustellen-Adresse *</label>
                <input
                  type="text"
                  value={form.adresse}
                  onChange={(e) => handleChange('adresse', e.target.value)}
                  className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-3 text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-orange-500 transition"
                  placeholder="z.B. Musterstraße 1, 12345 Berlin"
                />
              </div>
            </div>
          </div>

          {/* ─── ANSPRECHPARTNER ─── */}
          <div className="border-b border-black/10 pb-6">
            <h3 className="text-[#e8590c] text-xs font-bold uppercase tracking-wider mb-4">Ansprechpartner vor Ort</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-[#424245]">Name</label>
                <input
                  type="text"
                  value={form.ansprechpartnerName}
                  onChange={(e) => handleChange('ansprechpartnerName', e.target.value)}
                  className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f] focus:outline-none focus:border-orange-500 transition"
                  placeholder="Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-[#424245]">Telefon</label>
                <input
                  type="tel"
                  value={form.ansprechpartnerTelefon}
                  onChange={(e) => handleChange('ansprechpartnerTelefon', e.target.value)}
                  className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f] focus:outline-none focus:border-orange-500 transition"
                  placeholder="+49..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-[#424245]">E-Mail</label>
                <input
                  type="email"
                  value={form.ansprechpartnerEmail}
                  onChange={(e) => handleChange('ansprechpartnerEmail', e.target.value)}
                  className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f] focus:outline-none focus:border-orange-500 transition"
                  placeholder="email@beispiel.de"
                />
              </div>
            </div>
          </div>

          {/* ─── BAULEITER ─── */}
          <div className="border-b border-black/10 pb-6">
            <h3 className="text-[#e8590c] text-xs font-bold uppercase tracking-wider mb-4">Bauleiter</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-[#424245]">Name</label>
                <input
                  type="text"
                  value={form.bauleiterName}
                  onChange={(e) => handleChange('bauleiterName', e.target.value)}
                  className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f] focus:outline-none focus:border-orange-500 transition"
                  placeholder="Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-[#424245]">Telefon</label>
                <input
                  type="tel"
                  value={form.bauleiterTelefon}
                  onChange={(e) => handleChange('bauleiterTelefon', e.target.value)}
                  className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f] focus:outline-none focus:border-orange-500 transition"
                  placeholder="+49..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-[#424245]">E-Mail</label>
                <input
                  type="email"
                  value={form.bauleiterEmail}
                  onChange={(e) => handleChange('bauleiterEmail', e.target.value)}
                  className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f] focus:outline-none focus:border-orange-500 transition"
                  placeholder="email@beispiel.de"
                />
              </div>
            </div>
          </div>

          {/* ─── TERMINE ─── */}
          <div className="border-b border-black/10 pb-6">
            <h3 className="text-[#e8590c] text-xs font-bold uppercase tracking-wider mb-4">Termine</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-[#424245]">Projektbeginn</label>
                <input
                  type="date"
                  value={form.projektbeginn}
                  onChange={(e) => handleChange('projektbeginn', e.target.value)}
                  className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f] focus:outline-none focus:border-orange-500 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-[#424245]">Projektende</label>
                <input
                  type="date"
                  value={form.projektende}
                  onChange={(e) => handleChange('projektende', e.target.value)}
                  className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f] focus:outline-none focus:border-orange-500 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-[#424245]">Arbeitszeiten</label>
                <input
                  type="text"
                  value={form.arbeitszeiten}
                  onChange={(e) => handleChange('arbeitszeiten', e.target.value)}
                  className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f] focus:outline-none focus:border-orange-500 transition"
                  placeholder="Mo–Fr 7:00–17:00"
                />
              </div>
            </div>
            {getStandzeit() !== null && (
              <div className="mt-3 flex items-center gap-2 text-sm text-[#86868b]">
                <span>📅 Standzeit:</span>
                <span className="text-[#e8590c] font-medium">{getStandzeit()} Tage</span>
                <span>(ca. {getWochen()} Wochen)</span>
              </div>
            )}
          </div>

          {/* ─── GEWERKE ─── */}
          <div className="border-b border-black/10 pb-6">
            <h3 className="text-[#e8590c] text-xs font-bold uppercase tracking-wider mb-4">Gewerke</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {gewerkListe.map((g) => (
                <button
                  key={g.id}
                  onClick={() => toggleGewerk(g.id)}
                  className={`p-4 rounded-xl border-2 text-sm font-medium transition flex flex-col items-center gap-2 ${
                    form.gewerke.includes(g.id)
                      ? g.color + ' ring-2 ring-offset-2 ring-offset-white'
                      : 'bg-black/10 border-black/10 text-[#86868b] hover:border-black/20'
                  }`}
                >
                  <span className="text-2xl">{g.icon}</span>
                  <span>{g.id}</span>
                </button>
              ))}
            </div>
            {form.gewerke.length > 0 && (
              <div className="mt-4 flex items-center gap-2 text-sm text-[#86868b]">
                <span>⚖️ Lastklasse:</span>
                <span className="text-[#e8590c] font-medium">{getLastklasse()}</span>
              </div>
            )}
          </div>

          {/* ─── PROJEKTDAUER ─── */}
          <div className="border-b border-black/10 pb-6">
            <h3 className="text-[#e8590c] text-xs font-bold uppercase tracking-wider mb-4">Projektdauer</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#424245]">Wochen</span>
                <span className="text-2xl font-bold text-[#e8590c]">{getWochen()}</span>
              </div>
              <input
                type="range"
                min="1"
                max="52"
                value={getWochen()}
                onChange={(e) => handleChange('dauer', e.target.value)}
                className="w-full h-2 bg-black/10 rounded-xl appearance-none cursor-pointer accent-orange-500"
              />
              <div className="flex justify-between text-xs text-[#86868b]">
                <span>1 Woche</span>
                <span>52 Wochen</span>
              </div>
            </div>
          </div>

          {/* ─── NOTIZEN ─── */}
          <div className="border-b border-black/10 pb-6">
            <h3 className="text-[#e8590c] text-xs font-bold uppercase tracking-wider mb-4">Notizen</h3>
            <textarea
              value={form.notizen}
              onChange={(e) => handleChange('notizen', e.target.value)}
              rows={3}
              className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-3 text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-orange-500 transition resize-none"
              placeholder="Besonderheiten, Zugang, Parken..."
            />
            {/* NEU (Phase 18): Sprachnotiz – sprechen statt tippen */}
            <SprachNotiz onText={(t) => handleChange('notizen', (form.notizen ? form.notizen + '\n' : '') + t)} />
          </div>

          {/* ─── DIGITALE ERFASSUNG ─── */}
          <div className="border-b border-black/10 pb-6">
            <h3 className="text-[#e8590c] text-xs font-bold uppercase tracking-wider mb-4">Digitale Erfassung</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {erfassungKacheln.map((k) => (
                <button
                  key={k.id}
                  onClick={() => toggleErfassung(k.id)}
                  className={`p-4 rounded-xl border-2 text-sm font-medium transition flex flex-col items-center gap-2 ${
                    form[k.id as keyof typeof form]
                      ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c] ring-2 ring-offset-2 ring-offset-white'
                      : 'bg-black/10 border-black/10 text-[#86868b] hover:border-black/20'
                  }`}
                >
                  <span className="text-2xl">{k.icon}</span>
                  <span>{k.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ─── GPS-STANDORT (nur wenn aktiviert) ─── */}
          {form.gps && (
            <div className="bg-black/10/30 rounded-xl p-6 border border-black/10">
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">📍 Baustellen-Standort</h3>
              <p className="text-sm text-[#86868b] mb-4">
                Erfasst die GPS-Koordinaten der Baustelle – Grundlage für Anfahrtsplanung und Leerfahrt-Reduktion.
              </p>
              {form.gpsPosition ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-mono text-[#1d1d1f] bg-emerald-500/10 border border-emerald-500/40 rounded-lg px-3 py-2">
                    {form.gpsPosition}
                  </span>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${form.gpsPosition.split(',')[0].trim()}&mlon=${form.gpsPosition.split(',')[1].trim()}#map=17`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-[#e8590c] hover:underline"
                  >
                    Auf Karte ansehen ↗
                  </a>
                  <button
                    onClick={() => setForm((prev) => ({ ...prev, gpsPosition: '' }))}
                    className="text-sm text-[#86868b] hover:text-[#1d1d1f]"
                  >
                    Entfernen
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={captureGps}
                    disabled={gpsStatus === 'laedt'}
                    className="px-4 py-2.5 rounded-xl bg-[#e8590c] hover:bg-[#d9480f] text-white text-sm font-semibold transition disabled:opacity-50"
                  >
                    {gpsStatus === 'laedt' ? 'Erfasse Standort…' : 'Standort erfassen'}
                  </button>
                  {gpsStatus === 'fehler' && (
                    <span className="text-sm text-red-600">Standortzugriff nicht möglich – bitte im Browser erlauben.</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── FOTO-UPLOAD (nur wenn aktiviert) ─── */}
          {form.fotos && sessionId && (
            <div className="bg-black/10/30 rounded-xl p-6 border border-black/10">
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">📸 Baustellen-Fotos</h3>
              <p className="text-sm text-[#86868b] mb-4">
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
            <div className="bg-black/10/30 rounded-xl p-6 border border-black/10">
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">📐 LiDAR / 3D-Scan</h3>
              <p className="text-sm text-[#86868b] mb-4">
                OBJ oder PLY-Datei hochladen für automatische Maßextraktion.
              </p>
              <LiDARUpload
                sessionId={sessionId}
                onMeasurements={(m) => {
                  localStorage.setItem('scaffold_lidar_measurements', JSON.stringify(m));
                }}
              />
              <p className="text-[11px] text-[#86868b] mt-2">
                ✅ Erkannte Maße werden in Schritt 2 automatisch eingetragen.
              </p>
            </div>
          )}

          {/* ─── GRUNDRISS-UPLOAD + KI (nur wenn aktiviert) ─── */}
          {form.grundrisse && sessionId && (
            <div className="bg-black/10/30 rounded-xl p-6 border border-black/10">
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">📋 Grundrisse / Baupläne</h3>
              <p className="text-sm text-[#86868b] mb-4">
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