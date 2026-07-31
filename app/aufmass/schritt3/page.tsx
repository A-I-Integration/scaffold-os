'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Schritt3Page() {
  const router = useRouter();
  
  const [step1Data, setStep1Data] = useState<any>(null);
  
  const [form, setForm] = useState({
    geruesttyp: '',
    feldlange: '3.0',
    belag: 'holz',
    gelander: true,
    diagonale: true,
    fahrbar: false,
    boden: 'beton',
  });

  const geruestTypen = [
    { id: 'fassade', name: 'Fassadengerüst', icon: '🏢', desc: 'Standard für Maler & WDVS' },
    { id: 'fahr', name: 'Fahrgerüst', icon: '🚧', desc: 'Rollbar, für große Flächen' },
    { id: 'trag', name: 'Traggerüst', icon: '⚒️', desc: 'Überbrückung, hohe Lasten' },
    { id: 'dach', name: 'Dachgerüst', icon: '🏠', desc: 'Dacharbeiten & Schornstein' },
    { id: 'raum', name: 'Raumgerüst', icon: '📦', desc: 'Innenräume, Hallen' },
    { id: 'haenge', name: 'Hängegerüst', icon: '⛓️', desc: 'Fassade ohne Bodenkontakt' },
  ];

  const belagTypen = [
    { id: 'holz', name: 'Holzbelag', desc: 'Standard, günstig' },
    { id: 'alu', name: 'Alu-Belag', desc: 'Leicht, korrosionsfrei' },
    { id: 'stahl', name: 'Stahlroste', desc: 'Schwere Last, LK 4-5' },
    { id: 'gitter', name: 'Gitterträger', desc: 'Durchfahrt möglich' },
  ];

  const bodenTypen = [
    { id: 'beton', name: 'Beton / Estrich' },
    { id: 'asphalt', name: 'Asphalt' },
    { id: 'pflaster', name: 'Pflaster / Platten' },
    { id: 'rasen', name: 'Rasen / Erdreich' },
    { id: 'kies', name: 'Schotter / Kies' },
  ];

  useEffect(() => {
    const saved = localStorage.getItem('scaffold_step1');
    if (saved) setStep1Data(JSON.parse(saved));
    
    const saved3 = localStorage.getItem('scaffold_step3');
    if (saved3) setForm(JSON.parse(saved3));
  }, []);

  function handleWeiter() {
    if (!form.geruesttyp) {
      alert('Bitte wähle einen Gerüsttyp aus!');
      return;
    }
    
    localStorage.setItem('scaffold_step3', JSON.stringify(form));
    router.push('/aufmass/schritt4');
  }

  function zurueck() {
    router.push('/aufmass/schritt2');
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={zurueck} className="text-slate-400 hover:text-white text-sm">← Zurück</button>
        </div>
        <h1 className="text-3xl font-bold mb-2">🏗️ Gerüsttyp & Aufbau</h1>
        <p className="text-slate-400 mb-2">Baustelle: Schritt 3 von 6</p>
        
        {step1Data && (
          <div className="bg-slate-800/50 rounded-lg p-3 mb-6 text-sm text-slate-400">
            <span className="text-slate-300 font-medium">{step1Data.name}</span> · {step1Data.adresse}
          </div>
        )}

        <div className="bg-slate-800 rounded-xl p-6 space-y-6">

          {/* Gerüsttyp */}
          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Gerüsttyp *</label>
            <div className="grid grid-cols-1 gap-3">
              {geruestTypen.map(g => (
                <button
                  key={g.id}
                  onClick={() => setForm({...form, geruesttyp: g.id})}
                  className={`p-4 rounded-lg border text-left transition flex items-center gap-4 ${
                    form.geruesttyp === g.id
                      ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <span className="text-2xl">{g.icon}</span>
                  <div>
                    <div className="font-semibold">{g.name}</div>
                    <div className="text-xs opacity-70">{g.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Feldlänge */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">Standard-Feldlänge (m)</label>
            <select 
              value={form.feldlange}
              onChange={(e) => setForm({...form, feldlange: e.target.value})}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
            >
              <option value="2.5">2,50 m</option>
              <option value="3.0">3,00 m (Standard)</option>
              <option value="3.5">3,50 m</option>
              <option value="2.0">2,00 m</option>
            </select>
          </div>

          {/* Belag */}
          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Belagtyp</label>
            <div className="grid grid-cols-2 gap-3">
              {belagTypen.map(b => (
                <button
                  key={b.id}
                  onClick={() => setForm({...form, belag: b.id})}
                  className={`p-3 rounded-lg border text-left transition ${
                    form.belag === b.id
                      ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="font-semibold text-sm">{b.name}</div>
                  <div className="text-xs opacity-70">{b.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Optionen */}
          <div className="space-y-3">
            <button
              onClick={() => setForm({...form, gelander: !form.gelander})}
              className={`w-full p-3 rounded-lg border text-left transition flex items-center gap-3 ${
                form.gelander
                  ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                  : 'bg-slate-700 border-slate-600 text-slate-300'
              }`}
            >
              <span className="text-xl">🛡️</span>
              <div>
                <div className="font-semibold text-sm">Geländer & Brüstung</div>
                <div className="text-xs opacity-70">DIN EN 12811-1 vorgeschrieben</div>
              </div>
            </button>

            <button
              onClick={() => setForm({...form, diagonale: !form.diagonale})}
              className={`w-full p-3 rounded-lg border text-left transition flex items-center gap-3 ${
                form.diagonale
                  ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                  : 'bg-slate-700 border-slate-600 text-slate-300'
              }`}
            >
              <span className="text-xl">📐</span>
              <div>
                <div className="font-semibold text-sm">Diagonale Aussteifung</div>
                <div className="text-xs opacity-70">Empfohlen ab 6 m Höhe</div>
              </div>
            </button>

            <button
              onClick={() => setForm({...form, fahrbar: !form.fahrbar})}
              className={`w-full p-3 rounded-lg border text-left transition flex items-center gap-3 ${
                form.fahrbar
                  ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                  : 'bg-slate-700 border-slate-600 text-slate-300'
              }`}
            >
              <span className="text-xl">🛞</span>
              <div>
                <div className="font-semibold text-sm">Fahrbar / Rollbar</div>
                <div className="text-xs opacity-70">Rollen unter den Standardfüßen</div>
              </div>
            </button>
          </div>

          {/* Bodenverhältnisse */}
          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Bodenverhältnisse</label>
            <div className="grid grid-cols-2 gap-3">
              {bodenTypen.map(b => (
                <button
                  key={b.id}
                  onClick={() => setForm({...form, boden: b.id})}
                  className={`p-3 rounded-lg border text-left transition ${
                    form.boden === b.id
                      ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button 
              onClick={zurueck}
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