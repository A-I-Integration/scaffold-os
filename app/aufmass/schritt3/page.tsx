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
    <div className="min-h-screen bg-white text-[#1d1d1f] p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={zurueck} className="text-[#86868b] hover:text-[#1d1d1f] text-sm">← Zurück</button>
        </div>
        <h1 className="text-3xl font-bold mb-2">🏗️ Gerüsttyp & Aufbau</h1>
        <p className="text-[#86868b] mb-2">Baustelle: Schritt 3 von 6</p>
        
        {step1Data && (
          <div className="bg-black/5 rounded-xl p-3 mb-6 text-sm text-[#86868b]">
            <span className="text-[#424245] font-medium">{step1Data.name}</span> · {step1Data.adresse}
          </div>
        )}

        <div className="bg-[#f5f5f7] rounded-xl p-6 space-y-6">

          <div>
            <label className="block text-sm font-medium mb-3 text-[#424245]">Gerüsttyp *</label>
            <div className="grid grid-cols-1 gap-3">
              {geruestTypen.map(g => (
                <button
                  key={g.id}
                  onClick={() => setForm({...form, geruesttyp: g.id})}
                  className={`p-4 rounded-xl border text-left transition flex items-center gap-4 ${
                    form.geruesttyp === g.id
                      ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]'
                      : 'bg-black/10 border-black/10 text-[#424245] hover:border-black/20'
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

          <div>
            <label className="block text-sm font-medium mb-2 text-[#424245]">Standard-Feldlänge (m)</label>
            <select 
              value={form.feldlange}
              onChange={(e) => setForm({...form, feldlange: e.target.value})}
              className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f]"
            >
              <option value="2.5">2,50 m</option>
              <option value="3.0">3,00 m (Standard)</option>
              <option value="3.5">3,50 m</option>
              <option value="2.0">2,00 m</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-[#424245]">Belagtyp</label>
            <div className="grid grid-cols-2 gap-3">
              {belagTypen.map(b => (
                <button
                  key={b.id}
                  onClick={() => setForm({...form, belag: b.id})}
                  className={`p-3 rounded-xl border text-left transition ${
                    form.belag === b.id
                      ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]'
                      : 'bg-black/10 border-black/10 text-[#424245]'
                  }`}
                >
                  <div className="font-semibold text-sm">{b.name}</div>
                  <div className="text-xs opacity-70">{b.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <button onClick={() => setForm({...form, gelander: !form.gelander})}
              className={`w-full p-3 rounded-xl border text-left transition flex items-center gap-3 ${form.gelander ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10'}`}>
              <span className="text-xl">🛡️</span>
              <div><div className="font-semibold text-sm">Geländer & Brüstung</div><div className="text-xs opacity-70">DIN EN 12811-1 vorgeschrieben</div></div>
            </button>
            <button onClick={() => setForm({...form, diagonale: !form.diagonale})}
              className={`w-full p-3 rounded-xl border text-left transition flex items-center gap-3 ${form.diagonale ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10'}`}>
              <span className="text-xl">📐</span>
              <div><div className="font-semibold text-sm">Diagonale Aussteifung</div><div className="text-xs opacity-70">Empfohlen ab 6 m Höhe</div></div>
            </button>
            <button onClick={() => setForm({...form, fahrbar: !form.fahrbar})}
              className={`w-full p-3 rounded-xl border text-left transition flex items-center gap-3 ${form.fahrbar ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10'}`}>
              <span className="text-xl">🛞</span>
              <div><div className="font-semibold text-sm">Fahrbar / Rollbar</div><div className="text-xs opacity-70">Rollen unter den Standardfüßen</div></div>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-[#424245]">Bodenverhältnisse</label>
            <div className="grid grid-cols-2 gap-3">
              {bodenTypen.map(b => (
                <button key={b.id} onClick={() => setForm({...form, boden: b.id})}
                  className={`p-3 rounded-xl border text-left transition ${form.boden === b.id ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10'}`}>
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={zurueck} className="flex-1 bg-black/10 hover:bg-black/15 text-[#1d1d1f] font-semibold py-3 px-4 rounded-xl">← Zurück</button>
            <button onClick={handleWeiter} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-xl">Weiter →</button>
          </div>

        </div>
      </div>
    </div>
  );
}