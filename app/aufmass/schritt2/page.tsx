'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Schritt2Page() {
  const router = useRouter();
  const [step1Data, setStep1Data] = useState<any>(null);
  
  const [form, setForm] = useState({
    laenge: '',
    hoehe: '',
    breite: '',
    traufhoehe: '',
    dachform: '',
    dachueberstand: '',
    fassade: '',
    garagen: false,
    fluchtwege: false,
    werbeanlagen: false,
    hauseingaenge: '',
    hindernisse: [] as string[],
    durchfahrt: false,
  });

  const hindernisListe = ['Erker', 'Balkon', 'Wintergarten', 'Kamin', 'Gaube', 'Markise'];
  const dachformen = ['Satteldach', 'Flachdach', 'Pultdach', 'Walmdach', 'Mansarddach', 'Zeltdach'];
  const fassaden = ['Klinker', 'WDVS', 'Beton', 'Naturstein', 'Glas', 'Holz', 'Putz', 'Denkmalschutz'];

  useEffect(() => {
    const saved = localStorage.getItem('scaffold_step1');
    if (saved) setStep1Data(JSON.parse(saved));
    const saved2 = localStorage.getItem('scaffold_step2');
    if (saved2) setForm(JSON.parse(saved2));
  }, []);

  function toggleHindernis(h: string) {
    setForm(prev => ({
      ...prev,
      hindernisse: prev.hindernisse.includes(h)
        ? prev.hindernisse.filter(x => x !== h)
        : [...prev.hindernisse, h]
    }));
  }

  function handleWeiter() {
    if (!form.laenge || !form.hoehe) {
      alert('Bitte gib mindestens Länge und Höhe ein!');
      return;
    }
    localStorage.setItem('scaffold_step2', JSON.stringify(form));
    router.push('/aufmass/schritt3');
  }

  function zurueck() {
    router.push('/aufmass');
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={zurueck} className="text-slate-400 hover:text-white text-sm mb-2">← Zurück</button>
        <h1 className="text-3xl font-bold mb-2">🏢 Gebäude & Abmessungen</h1>
        <p className="text-slate-400 mb-2">Baustelle: Schritt 2 von 6</p>
        
        {step1Data && (
          <div className="bg-slate-800/50 rounded-lg p-3 mb-6 text-sm text-slate-400">
            <span className="text-slate-300 font-medium">{step1Data.name}</span> · {step1Data.adresse}
          </div>
        )}

        <div className="bg-slate-800 rounded-xl p-6 space-y-6">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">Länge (m) *</label>
              <input type="number" value={form.laenge}
                onChange={(e) => setForm({...form, laenge: e.target.value})}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                placeholder="z.B. 18" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">Höhe (m) *</label>
              <input type="number" value={form.hoehe}
                onChange={(e) => setForm({...form, hoehe: e.target.value})}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                placeholder="z.B. 10" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">Breite (m)</label>
              <input type="number" value={form.breite}
                onChange={(e) => setForm({...form, breite: e.target.value})}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                placeholder="z.B. 8" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">Traufhöhe (m)</label>
              <input type="number" value={form.traufhoehe}
                onChange={(e) => setForm({...form, traufhoehe: e.target.value})}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                placeholder="z.B. 8.5" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Dachform</label>
            <div className="grid grid-cols-3 gap-3">
              {dachformen.map(d => (
                <button key={d} onClick={() => setForm({...form, dachform: d})}
                  className={`p-3 rounded-lg border text-sm transition ${form.dachform === d ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">Dachüberstand (m)</label>
            <input type="number" value={form.dachueberstand}
              onChange={(e) => setForm({...form, dachueberstand: e.target.value})}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
              placeholder="z.B. 0.5" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Fassadenmaterial</label>
            <div className="grid grid-cols-2 gap-3">
              {fassaden.map(f => (
                <button key={f} onClick={() => setForm({...form, fassade: f})}
                  className={`p-3 rounded-lg border text-sm transition ${form.fassade === f ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Hindernisse an der Fassade</label>
            <div className="grid grid-cols-2 gap-3">
              {hindernisListe.map(h => (
                <button key={h} onClick={() => toggleHindernis(h)}
                  className={`p-3 rounded-lg border text-left transition ${form.hindernisse.includes(h) ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                  {h}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <button onClick={() => setForm({...form, garagen: !form.garagen})}
              className={`w-full p-3 rounded-lg border text-left transition flex items-center gap-3 ${form.garagen ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600'}`}>
              <span className="text-xl">🚗</span>
              <div><div className="font-semibold text-sm">Garagen / Nebengebäude vorhanden</div></div>
            </button>
            
            <button onClick={() => setForm({...form, fluchtwege: !form.fluchtwege})}
              className={`w-full p-3 rounded-lg border text-left transition flex items-center gap-3 ${form.fluchtwege ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600'}`}>
              <span className="text-xl">🚪</span>
              <div><div className="font-semibold text-sm">Fluchtwege beachten</div></div>
            </button>

            <button onClick={() => setForm({...form, werbeanlagen: !form.werbeanlagen})}
              className={`w-full p-3 rounded-lg border text-left transition flex items-center gap-3 ${form.werbeanlagen ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600'}`}>
              <span className="text-xl">📢</span>
              <div><div className="font-semibold text-sm">Werbeanlagen vorhanden</div><div className="text-xs opacity-70">Müssen berücksichtigt werden</div></div>
            </button>

            <button onClick={() => setForm({...form, durchfahrt: !form.durchfahrt})}
              className={`w-full p-3 rounded-lg border text-left transition flex items-center gap-3 ${form.durchfahrt ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600'}`}>
              <span className="text-xl">🛣️</span>
              <div><div className="font-semibold text-sm">Durchfahrt / Eingang freizuhalten</div><div className="text-xs opacity-70">Gitterträger erforderlich</div></div>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">Anzahl Hauseingänge</label>
            <input type="number" value={form.hauseingaenge}
              onChange={(e) => setForm({...form, hauseingaenge: e.target.value})}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
              placeholder="z.B. 2" />
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={zurueck} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded-lg">← Zurück</button>
            <button onClick={handleWeiter} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-lg">Weiter →</button>
          </div>

        </div>
      </div>
    </div>
  );
}