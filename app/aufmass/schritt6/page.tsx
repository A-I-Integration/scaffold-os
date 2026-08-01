'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Schritt6Page() {
  const router = useRouter();
  const [data, setData] = useState<any>({});

  useEffect(() => {
    setData({
      step1: JSON.parse(localStorage.getItem('scaffold_step1') || '{}'),
      step2: JSON.parse(localStorage.getItem('scaffold_step2') || '{}'),
      step3: JSON.parse(localStorage.getItem('scaffold_step3') || '{}'),
      step4: JSON.parse(localStorage.getItem('scaffold_step4') || '{}'),
      step5: JSON.parse(localStorage.getItem('scaffold_step5') || '{}'),
    });
  }, []);

  async function speichern() {
    const s1 = data.step1 || {};
    const s2 = data.step2 || {};
    const s3 = data.step3 || {};
    const s4 = data.step4 || {};
    const s5 = data.step5 || {};

    const { error } = await supabase.from('projects').insert({
      name: s1.name || 'Unbenannt',
      data: { s1, s2, s3, s4, s5 },
    });

    if (error) {
      alert('❌ Fehler: ' + error.message);
    } else {
      alert('✅ Projekt gespeichert!');
      router.push('/');
    }
  }

  function neuesProjekt() {
    localStorage.clear();
    router.push('/aufmass');
  }

  const s1 = data.step1 || {};
  const s2 = data.step2 || {};
  const s3 = data.step3 || {};
  const s4 = data.step4 || {};
  const s5 = data.step5 || {};

  const geruestTypen: any = { fassade: 'Fassadengerüst', fahr: 'Fahrgerüst', trag: 'Traggerüst', dach: 'Dachgerüst', raum: 'Raumgerüst', haenge: 'Hängegerüst' };
  const belagTypen: any = { holz: 'Holzbelag', alu: 'Alu-Belag', stahl: 'Stahlroste', gitter: 'Gitterträger' };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">✅ Zusammenfassung</h1>
        <p className="text-slate-400 mb-8">Alle Daten im Überblick</p>

        <div className="space-y-4">

          <div className="bg-slate-800 rounded-xl p-5">
            <div className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-2">Schritt 1 – Projektdaten</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-slate-400">Name:</span> {s1.name || '–'}</div>
              <div><span className="text-slate-400">Adresse:</span> {s1.adresse || '–'}</div>
              <div><span className="text-slate-400">Gewerke:</span> {s1.gewerke?.join(', ') || '–'}</div>
              <div><span className="text-slate-400">Dauer:</span> {s1.dauer} Wochen</div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-5">
            <div className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-2">Schritt 2 – Gebäude & Abmessungen</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-slate-400">Länge:</span> {s2.laenge} m</div>
              <div><span className="text-slate-400">Höhe:</span> {s2.hoehe} m</div>
              <div><span className="text-slate-400">Breite:</span> {s2.breite || '–'} m</div>
              <div><span className="text-slate-400">Traufhöhe:</span> {s2.traufhoehe || '–'} m</div>
              <div><span className="text-slate-400">Dachform:</span> {s2.dachform || '–'}</div>
              <div><span className="text-slate-400">Dachüberstand:</span> {s2.dachueberstand || '–'} m</div>
              <div className="col-span-2"><span className="text-slate-400">Fassade:</span> {s2.fassade || '–'}</div>
              <div className="col-span-2"><span className="text-slate-400">Hindernisse:</span> {s2.hindernisse?.join(', ') || 'Keine'}</div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-5">
            <div className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-2">Schritt 3 – Gerüsttyp & Aufbau</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-slate-400">Typ:</span> {geruestTypen[s3.geruesttyp] || '–'}</div>
              <div><span className="text-slate-400">Feldlänge:</span> {s3.feldlange} m</div>
              <div><span className="text-slate-400">Belag:</span> {belagTypen[s3.belag] || '–'}</div>
              <div><span className="text-slate-400">Boden:</span> {s3.boden}</div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-5">
            <div className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-2">Schritt 4 – Sicherheit & Umgebung</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-slate-400">Ankerung:</span> {s4.ankerung}</div>
              <div><span className="text-slate-400">Windzone:</span> {s4.windzone}</div>
              <div className="col-span-2"><span className="text-slate-400">Gefahren:</span> {s4.gefahren?.join(', ') || 'Keine'}</div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-5">
            <div className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-2">Schritt 5 – Material & Termine</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-slate-400">Bühnen:</span> {s5.arbeitsbuehnen || '–'} Stk</div>
              <div><span className="text-slate-400">Rahmen:</span> {s5.rahmen || '–'} Stk</div>
              <div><span className="text-slate-400">Lieferung:</span> {s5.liefertermin || '–'}</div>
            </div>
          </div>

          <button 
            onClick={speichern}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition"
          >
            💾 In Datenbank speichern
          </button>

          <div className="flex gap-3 pt-2">
            <button onClick={() => router.push('/aufmass/schritt5')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded-lg">← Zurück</button>
            <button onClick={() => router.push('/planung')} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg">🤖 KI-Planung</button>
          </div>

          <button onClick={() => router.push('/stueckliste')} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-lg">
            📄 Zur Stückliste & PDF
          </button>
          
          <button onClick={neuesProjekt} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded-lg">
            🆕 Neues Projekt starten
          </button>
        </div>
      </div>
    </div>
  );
}