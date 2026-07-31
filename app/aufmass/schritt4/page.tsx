'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Schritt4Page() {
  const router = useRouter();
  const [step1Data, setStep1Data] = useState<any>(null);

  const [form, setForm] = useState({
    // Bestehend
    ankerung: 'fassade',
    ankerAbstand: '2.0',
    schutzdach: false,
    fangnetz: false,
    windzone: '2',
    gefahren: [] as string[],
    notiz: '',
    // Neu: Untergrund
    untergrund: 'beton',
    gefaelle: false,
    tragfaehigkeit: 'normal',
    unterkellert: false,
    lichtschaechte: false,
    lastverteilplatten: false,
    // Neu: Umgebung
    freileitungen: false,
    stromleitungen: false,
    baeume: false,
    nachbargrundstueck: false,
    oeffentlicherVerkehrsraum: false,
    halteverbot: false,
    sondernutzung: false,
    lagerflaeche: false,
    lkwZufahrt: true,
    kranErforderlich: false,
  });

  const gefahrenListe = ['Hochspannung', 'Bahnstrecke', 'Öffentlicher Weg', 'Nachbargrundstück', 'Glasfassade', 'Denkmalschutz'];

  useEffect(() => {
    const saved = localStorage.getItem('scaffold_step1');
    if (saved) setStep1Data(JSON.parse(saved));
    const saved4 = localStorage.getItem('scaffold_step4');
    if (saved4) setForm(JSON.parse(saved4));
  }, []);

  function toggleGefahr(g: string) {
    setForm(prev => ({
      ...prev,
      gefahren: prev.gefahren.includes(g)
        ? prev.gefahren.filter(x => x !== g)
        : [...prev.gefahren, g]
    }));
  }

  function handleWeiter() {
    localStorage.setItem('scaffold_step4', JSON.stringify(form));
    router.push('/aufmass/schritt5');
  }

  function zurueck() {
    router.push('/aufmass/schritt3');
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={zurueck} className="text-slate-400 hover:text-white text-sm mb-2">← Zurück</button>
        <h1 className="text-3xl font-bold mb-2">🛡️ Sicherheit & Umgebung</h1>
        <p className="text-slate-400 mb-2">Baustelle: Schritt 4 von 6</p>
        {step1Data && (
          <div className="bg-slate-800/50 rounded-lg p-3 mb-6 text-sm text-slate-400">
            <span className="text-slate-300 font-medium">{step1Data.name}</span> · {step1Data.adresse}
          </div>
        )}

        <div className="bg-slate-800 rounded-xl p-6 space-y-6">

          {/* Ankerung */}
          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Ankerung</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'fassade', name: 'Fassadenanker', desc: 'Standard' },
                { id: 'duesen', name: 'Düsenanker', desc: 'Betonwand' },
                { id: 'dach', name: 'Dachanker', desc: 'Schrägdach' },
                { id: 'gewicht', name: 'Gewichtsanker', desc: 'Ohne Bohren' },
              ].map(a => (
                <button key={a.id} onClick={() => setForm({...form, ankerung: a.id})}
                  className={`p-3 rounded-lg border text-left transition ${form.ankerung === a.id ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                  <div className="font-semibold text-sm">{a.name}</div>
                  <div className="text-xs opacity-70">{a.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Ankerabstand */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">Ankerabstand (m)</label>
            <select value={form.ankerAbstand} onChange={e => setForm({...form, ankerAbstand: e.target.value})}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white">
              <option value="2.0">2,00 m</option>
              <option value="2.5">2,50 m</option>
              <option value="3.0">3,00 m</option>
              <option value="3.5">3,50 m</option>
            </select>
          </div>

          {/* Untergrund */}
          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Untergrund</label>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {[
                { id: 'beton', name: 'Beton / Estrich' },
                { id: 'asphalt', name: 'Asphalt' },
                { id: 'pflaster', name: 'Pflaster' },
                { id: 'erdreich', name: 'Erdreich / Rasen' },
                { id: 'schotter', name: 'Schotter' },
                { id: 'kies', name: 'Kies' },
              ].map(u => (
                <button key={u.id} onClick={() => setForm({...form, untergrund: u.id})}
                  className={`p-3 rounded-lg border text-sm transition ${form.untergrund === u.id ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                  {u.name}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {[
                { key: 'gefaelle', label: 'Gefälle vorhanden', icon: '📐' },
                { key: 'unterkellert', label: 'Unterkellerte Bereiche', icon: '🏠' },
                { key: 'lichtschaechte', label: 'Lichtschächte', icon: '💡' },
                { key: 'lastverteilplatten', label: 'Lastverteilplatten erforderlich', icon: '⬜' },
              ].map((item: any) => (
                <button key={item.key} onClick={() => setForm({...form, [item.key]: !(form as any)[item.key]})}
                  className={`w-full p-3 rounded-lg border text-left transition flex items-center gap-3 ${(form as any)[item.key] ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600'}`}>
                  <span>{item.icon}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tragfähigkeit */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">Tragfähigkeit Untergrund</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'hoch', name: 'Hoch', desc: 'Beton, Asphalt' },
                { id: 'normal', name: 'Normal', desc: 'Pflaster, Kies' },
                { id: 'gering', name: 'Gering', desc: 'Erdreich, Rasen' },
              ].map(t => (
                <button key={t.id} onClick={() => setForm({...form, tragfaehigkeit: t.id})}
                  className={`p-3 rounded-lg border text-center transition ${form.tragfaehigkeit === t.id ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                  <div className="font-semibold text-sm">{t.name}</div>
                  <div className="text-xs opacity-70">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Umgebung */}
          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Umgebung</label>
            <div className="grid grid-cols-1 gap-2">
              {[
                { key: 'freileitungen', label: 'Freileitungen in der Nähe', icon: '⚡' },
                { key: 'stromleitungen', label: 'Stromleitungen / Kabel', icon: '🔌' },
                { key: 'baeume', label: 'Bäume / Vegetation', icon: '🌳' },
                { key: 'nachbargrundstueck', label: 'Nachbargrundstück berühren', icon: '🏘️' },
                { key: 'oeffentlicherVerkehrsraum', label: 'Öffentlicher Verkehrsraum', icon: '🚶' },
                { key: 'halteverbot', label: 'Halteverbotszone nötig', icon: '🚫' },
                { key: 'sondernutzung', label: 'Sondernutzungserlaubnis erforderlich', icon: '📋' },
                { key: 'lagerflaeche', label: 'Lagerfläche vor Ort', icon: '📦' },
                { key: 'lkwZufahrt', label: 'LKW-Zufahrt möglich', icon: '🚛' },
                { key: 'kranErforderlich', label: 'Kran erforderlich', icon: '🏗️' },
              ].map((item: any) => (
                <button key={item.key} onClick={() => setForm({...form, [item.key]: !(form as any)[item.key]})}
                  className={`w-full p-3 rounded-lg border text-left transition flex items-center gap-3 ${(form as any)[item.key] ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600'}`}>
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Schutzeinrichtungen */}
          <div className="space-y-3">
            <button onClick={() => setForm({...form, schutzdach: !form.schutzdach})}
              className={`w-full p-3 rounded-lg border text-left transition flex items-center gap-3 ${form.schutzdach ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600'}`}>
              <span className="text-xl">☂️</span>
              <div><div className="font-semibold text-sm">Schutzdach</div><div className="text-xs opacity-70">Für Fußgänger & Nachbarn</div></div>
            </button>
            <button onClick={() => setForm({...form, fangnetz: !form.fangnetz})}
              className={`w-full p-3 rounded-lg border text-left transition flex items-center gap-3 ${form.fangnetz ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600'}`}>
              <span className="text-xl">🕸️</span>
              <div><div className="font-semibold text-sm">Fangnetz</div><div className="text-xs opacity-70">Sturzschutz für Material</div></div>
            </button>
          </div>

          {/* Windzone */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">Windlast-Zone (DIN 1055-4)</label>
            <div className="grid grid-cols-4 gap-3">
              {['1','2','3','4'].map(z => (
                <button key={z} onClick={() => setForm({...form, windzone: z})}
                  className={`p-3 rounded-lg border text-center transition ${form.windzone === z ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-slate-700 border-slate-600'}`}>
                  Zone {z}
                </button>
              ))}
            </div>
          </div>

          {/* Gefahren */}
          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Besondere Gefahren / Hinweise</label>
            <div className="grid grid-cols-2 gap-3">
              {gefahrenListe.map(g => (
                <button key={g} onClick={() => toggleGefahr(g)}
                  className={`p-3 rounded-lg border text-left transition ${form.gefahren.includes(g) ? 'bg-red-600/20 border-red-500 text-red-300' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                  ⚠️ {g}
                </button>
              ))}
            </div>
          </div>

          {/* Notiz */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">Zusätzliche Hinweise</label>
            <textarea value={form.notiz} onChange={e => setForm({...form, notiz: e.target.value})}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white h-24 resize-none"
              placeholder="z.B. Anlieferung nur Mo–Fr ab 7 Uhr..." />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button onClick={zurueck} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded-lg">← Zurück</button>
            <button onClick={handleWeiter} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-lg">Weiter →</button>
          </div>
        </div>
      </div>
    </div>
  );
}