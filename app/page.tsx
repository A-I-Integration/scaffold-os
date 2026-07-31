'use client';

import { useState } from 'react';

export default function AufmassPage() {
  const [name, setName] = useState('');
  const [gespeichert, setGespeichert] = useState(false);

  function handleWeiter() {
    if (name.trim() === '') {
      alert('Bitte gib einen Namen ein!');
      return;
    }
    setGespeichert(true);
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-4">📏 Digitales Aufmaß</h1>
      <p className="text-slate-400 mb-8">Baustelle: Schritt 1 von 6</p>
      
      <div className="bg-slate-800 rounded-xl p-6 max-w-md">
        <label className="block text-sm font-medium mb-2">Name des Ansprechpartners</label>
        <input 
          type="text" 
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500"
          placeholder="z.B. Herr Müller"
        />
        
        {gespeichert && (
          <div className="mt-4 p-3 bg-green-900/30 border border-green-600 rounded-lg text-green-400 text-sm">
            ✅ Gespeichert: {name}
          </div>
        )}
        
        <button 
          onClick={handleWeiter}
          className="mt-6 w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          Weiter →
        </button>
      </div>
    </div>
  );
}