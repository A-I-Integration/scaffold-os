'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AufmassPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    adresse: '',
    gewerke: [] as string[],
    dauer: '4',
    fotos: false,
    lidar: false,
  });

  const [gespeichert, setGespeichert] = useState(false);

  const gewerkListe = [
    { id: 'maler', label: 'Maler', lastklasse: 2 },
    { id: 'dachdecker', label: 'Dachdecker', lastklasse: 3 },
    { id: 'maurer', label: 'Maurer', lastklasse: 4 },
    { id: 'wdvs', label: 'WDVS / Fassade', lastklasse: 3 },
    { id: 'naturstein', label: 'Naturstein', lastklasse: 5 },
  ];

  function toggleGewerk(id: string) {
    setForm(prev => ({
      ...prev,
      gewerke: prev.gewerke.includes(id)
        ? prev.gewerke.filter(g => g !== id)
        : [...prev.gewerke, id]
    }));
    setGespeichert(false);
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
    setGespeichert(true);
    router.push('/aufmass/schritt2');
  }

  const maxLastklasse = Math.max(
    ...form.gewerke.map(g => gewerkListe.find(gl => gl.id === g)?.lastklasse || 0)
  );

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-orange-400 text-sm font-semibold">Schritt 1 von 6</span>
        </div>
        <h1 className="text-3xl font-bold mb-2">📏 Digitales Aufmaß</h1>
        <p className="text-slate-400 mb-8">Baustelle: Ansprechpartner & Gewerke erfassen</p>

        <div className="bg-slate-800 rounded-xl p-6 space-y-6">
          
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">Name des Ansprechpartners *</label>
            <input 
              type="text" 
              value={form.name}
              onChange={(e) => { setForm({...form, name: e.target.value}); setGespeichert(false); }}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
              placeholder="z.B. Herr Müller"
            />
          </div>

          {/* Adresse */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">Adresse der Baustelle *</label>
            <input 
              type="text" 
              value={form.adresse}
              onChange={(e) => { setForm({...form, adresse: e.target.value}); setGespeichert(false); }}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
              placeholder="z.B. Lindenstraße 12, 10115 Berlin"
            />
          </div>

          {/* Gewerke */}
          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Gewerke auf dem Gerüst *</label>
            <div className="grid grid-cols-2 gap-3">
              {gewerkListe.map(g => (
                <button
                  key={g.id}
                  onClick={() => toggleGewerk(g.id)}
                  className={`p-3 rounded-lg border text-left transition ${
                    form.gewerke.includes(g.id)
                      ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="font-semibold text-sm">{g.label}</div>
                  <div className="text-xs opacity-70">LK {g.lastklasse}</div>
                </button>
              ))}
            </div>
            {form.gewerke.length > 0 && (
              <div className="mt-2 text-sm text-orange-400">
                Mindest-Lastklasse: <strong>LK {maxLastklasse}</strong> (DIN EN 12811-1)
              </div>
            )}
          </div>

          {/* Dauer */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">Nutzungsdauer (Wochen)</label>
            <select
              value={form.dauer}
              onChange={(e) => { setForm({...form, dauer: e.target.value}); setGespeichert(false); }}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
            >
              <option value="1">1 Woche</option>
              <option value="2">2 Wochen</option>
              <option value="4">4 Wochen</option>
              <option value="8">8 Wochen</option>
              <option value="12">12 Wochen</option>
              <option value="24">24+ Wochen</option>
            </select>
          </div>

          {/* Dokumentation */}
          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">Dokumentation</label>
            <div className="space-y-2">
              <button
                onClick={() => setForm({...form, fotos: !form.fotos})}
                className={`w-full p-3 rounded-lg border text-left transition flex items-center gap-3 ${
                  form.fotos
                    ? 'bg-green-600/20 border-green-500 text-green-300'
                    : 'bg-slate-700 border-slate-600 text-slate-300'
                }`}
              >
                <span className="text-xl">📷</span>
                <div>
                  <div className="font-semibold text-sm">Fotos aufgenommen</div>
                  <div className="text-xs opacity-70">Mindestens 4 Perspektiven</div>
                </div>
              </button>
              <button
                onClick={() => setForm({...form, lidar: !form.lidar})}
                className={`w-full p-3 rounded-lg border text-left transition flex items-center gap-3 ${
                  form.lidar