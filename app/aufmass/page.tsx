'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AufmassPage() {
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
    
    // Dokumentation
    fotos: false,
    lidar: false,
  });

  const gewerkListe = ['Maler', 'WDVS/Fassade', 'Fenster', 'Dach', 'Putz', 'Sonstiges'];

  function toggleGewerk(g: string) {
    setForm(prev => ({
      ...prev,
      gewerke: prev.gewerke.includes(g)
        ? prev.gewerke.filter(x => x !== g)
        : [...prev.gewerke, g]
    }));
  }

  function getLastklasse() {
    const gewerke = form.gewerke;
    if (gewerke.includes('WDVS/Fassade') || gewerke.includes('Putz')) return 'LK 3';
    if (gewerke.includes('Maler')) return 'LK 2';
    if (gewerke.includes('Dach')) return 'LK 4';
    return 'LK 2';
  }

  function getStandzeit() {
    if (!form.projektbeginn || !form.projektende) return null;
    const start = new Date(form.projektbeginn);
    const ende = new Date(form.projektende);
    const diff = Math.ceil((ende.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : null;
  }

  function handleWeiter() {
    if (!form.name.trim() || !form.adresse.trim()) {
      alert('Bitte fülle Name und Adresse aus!');
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
        <h1 className="text-3xl font-bold mb-2">📋 Aufmaß – Schritt 1</h1>
        <p className="text-slate-400 mb-8">Projektdaten & Gewerke</p>

        <div className="bg-slate-800 rounded-xl p-6 space-y-6">
          
          {/* Projekt */}
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">Projekt</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Projektname / Kunde *</label>
                <input 
                  type="text" 
                  value={form.name}
                  onChange={(e) => setForm({...form, name: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  placeholder="z.B. Merola"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Baustellenadresse *</label>
                <input 
                  type="text" 
                  value={form.adresse}
                  onChange={(e) => setForm({...form, adresse: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  placeholder="z.B. Bänkstegge 14"
                />
              </div>
            </div>
          </div>

          {/* Ansprechpartner */}
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">Ansprechpartner vor Ort</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Name</label>
                <input 
                  type="text" 
                  value={form.ansprechpartnerName}
                  onChange={(e) => setForm({...form, ansprechpartnerName: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  placeholder="z.B. Herr Müller"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">Telefon</label>
                  <input 
                    type="tel" 
                    value={form.ansprechpartnerTelefon}
                    onChange={(e) => setForm({...form, ansprechpartnerTelefon: e.target.value})}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    placeholder="z.B. 0171 12345678"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">E-Mail</label>
                  <input 
                    type="email" 
                    value={form.ansprechpartnerEmail}
                    onChange={(e) => setForm({...form, ansprechpartnerEmail: e.target.value})}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    placeholder="z.B. mueller@firma.de"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bauleiter */}
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">Bauleiter</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Name</label>
                <input 
                  type="text" 
                  value={form.bauleiterName}
                  onChange={(e) => setForm({...form, bauleiterName: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                  placeholder="z.B. Herr Schmidt"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">Telefon</label>
                  <input 
                    type="tel" 
                    value={form.bauleiterTelefon}
                    onChange={(e) => setForm({...form, bauleiterTelefon: e.target.value})}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    placeholder="z.B. 0152 98765432"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">E-Mail</label>
                  <input 
                    type="email" 
                    value={form.bauleiterEmail}
                    onChange={(e) => setForm({...form, bauleiterEmail: e.target.value})}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                    placeholder="z.B. schmidt@geruestbau.de"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Termine */}
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">Termine</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Projektbeginn</label>
                <input 
                  type="date" 
                  value={form.projektbeginn}
                  onChange={(e) => setForm({...form, projektbeginn: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Projektende</label>
                <input 
                  type="date" 
                  value={form.projektende}
                  onChange={(e) => setForm({...form, projektende: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
            
            {getStandzeit() && (
              <div className="mt-3 bg-blue-900/30 border border-blue-500/50 rounded-lg p-3">
                <div className="text-blue-400 text-sm">
                  📅 Geplante Standzeit: <strong>{getStandzeit()} Tage</strong>
                </div>
              </div>
            )}

            <div className="mt-4">
              <label className="block text-sm font-medium mb-2 text-slate-300">Arbeitszeiten auf der Baustelle</label>
              <input 
                type="text" 
                value={form.arbeitszeiten}
                onChange={(e) => setForm({...form, arbeitszeiten: e.target.value})}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
                placeholder="z.B. Mo–Fr 7:00–17:00"
              />
            </div>
          </div>

          {/* Gewerke */}
          <div className="border-b border-slate-700 pb-6">
            <h3 className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">Gewerke *</h3>
            <div className="grid grid-cols-2 gap-3">
              {gewerkListe.map(g => (
                <button
                  key={g}
                  onClick={() => toggleGewerk(g)}
                  className={`p-3 rounded-lg border text-left transition ${
                    form.gewerke.includes(g)
                      ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Dauer */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">Projektdauer (Wochen)</label>
            <select 
              value={form.dauer}
              onChange={(e) => setForm({...form, dauer: e.target.value})}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
            >
              <option value="1">1 Woche</option>
              <option value="2">2 Wochen</option>
              <option value="3">3 Wochen</option>
              <option value="4">4 Wochen</option>
              <option value="6">6 Wochen</option>
              <option value="8">8 Wochen</option>
              <option value="12">12 Wochen</option>
            </select>
          </div>

          {/* Dokumentation */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setForm({...form, fotos: !form.fotos})}
              className={`p-3 rounded-lg border text-left transition flex items-center gap-3 ${
                form.fotos
                  ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                  : 'bg-slate-700 border-slate-600 text-slate-300'
              }`}
            >
              <span className="text-xl">📷</span>
              <div>
                <div className="font-semibold text-sm">Fotos</div>
                <div className="text-xs opacity-70">Vorher/Nachher</div>
              </div>
            </button>
            <button
              onClick={() => setForm({...form, lidar: !form.lidar})}
              className={`p-3 rounded-lg border text-left transition flex items-center gap-3 ${
                form.lidar
                  ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                  : 'bg-slate-700 border-slate-600 text-slate-300'
              }`}
            >
              <span className="text-xl">📐</span>
              <div>
                <div className="font-semibold text-sm">LiDAR</div>
                <div className="text-xs opacity-70">3D-Scan</div>
              </div>
            </button>
          </div>

          {/* Lastklasse */}
          {form.gewerke.length > 0 && (
            <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-400 font-semibold">
                <span>✅</span>
                <span>Lastklasse {getLastklasse()} (DIN EN 12811-1)</span>
              </div>
              <p className="text-green-300/70 text-sm mt-1">
                Automatisch basierend auf Gewerken berechnet
              </p>
            </div>
          )}

          <button 
            onClick={handleWeiter}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-lg transition"
          >
            Weiter →
          </button>

        </div>
      </div>
    </div>
  );
}