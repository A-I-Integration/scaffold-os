'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Schritt5Page() {
  const router = useRouter();
  const [step1Data, setStep1Data] = useState<any>(null);
  const [step2Data, setStep2Data] = useState<any>(null);

  const [form, setForm] = useState({
    arbeitsbuehnen: '',
    rahmen: '',
    diagonale: '',
    spindeltreppe: '',
    gelander: '',
    anker: '',
    liefertermin: '',
    abholtermin: '',
  });

  useEffect(() => {
    const s1 = localStorage.getItem('scaffold_step1');
    const s2 = localStorage.getItem('scaffold_step2');
    if (s1) setStep1Data(JSON.parse(s1));
    if (s2) setStep2Data(JSON.parse(s2));
    const s5 = localStorage.getItem('scaffold_step5');
    if (s5) setForm(JSON.parse(s5));
  }, []);

  function handleWeiter() {
    localStorage.setItem('scaffold_step5', JSON.stringify(form));
    router.push('/aufmass/schritt6');
  }

  function zurueck() {
    router.push('/aufmass/schritt4');
  }

  // Automatische Schätzung basierend auf Schritt 2
  const geschLaenge = step2Data?.laenge ? parseFloat(step2Data.laenge) : 0;
  const geschHoehe = step2Data?.hoehe ? parseFloat(step2Data.hoehe) : 0;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={zurueck} className="text-slate-400 hover:text-white text-sm mb-2">← Zurück</button>
        <h1 className="text-3xl font-bold mb-2">📦 Material & Termine</h1>
        <p className="text-slate-400 mb-2">Baustelle: Schritt 5 von 6</p>
        {step1Data && (
          <div className="bg-slate-800/50 rounded-lg p-3 mb-6 text-sm text-slate-400">
            <span className="text-slate-300 font-medium">{step1Data.name}</span> · {step1Data.adresse}
          </div>
        )}

        {/* Automatische Schätzung */}
        {geschLaenge > 0 && geschHoehe > 0 && (
          <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4 mb-6">
            <div className="text-blue-400 font-semibold text-sm mb-1">💡 Automatische Schätzung</div>
            <div className="text-blue-300/80 text-sm">
              Bei {geschLaenge} m Länge × {geschHoehe} m Höhe ca. <strong>{Math.ceil(geschLaenge * geschHoehe / 3)} Felder</strong> erforderlich
            </div>
          </div>
        )}

        <div className="bg-slate-800 rounded-xl p-6 space-y-4">

          {[
            { key: 'arbeitsbuehnen', label: 'Arbeitsbühnen (Stk)', placeholder: 'z.B. 12' },
            { key: 'rahmen', label: 'Rahmen (Stk)', placeholder: 'z.B. 24' },
            { key: 'diagonale', label: 'Diagonalen (Stk)', placeholder: 'z.B. 16' },
            { key: 'spindeltreppe', label: 'Spindeltreppen (Stk)', placeholder: 'z.B. 2' },
            { key: 'gelander', label: 'Geländer (Stk)', placeholder: 'z.B. 8' },
            { key: 'anker', label: 'Anker / Verbindungen (Stk)', placeholder: 'z.B. 20' },
          ].map((field: any) => (
            <div key={field.key}>
              <label className="block text-sm font-medium mb-2 text-slate-300">{field.label}</label>
              <input type="number" value={(form as any)[field.key]}
                onChange={e => setForm({...form, [field.key]: e.target.value})}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                placeholder={field.placeholder} />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">Liefertermin</label>
              <input type="date" value={form.liefertermin}
                onChange={e => setForm({...form, liefertermin: e.target.value})}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">Abholtermin</label>
              <input type="date" value={form.abholtermin}
                onChange={e => setForm({...form, abholtermin: e.target.value})}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white" />
            </div>
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