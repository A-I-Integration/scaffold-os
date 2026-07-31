'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StuecklistePage() {
  const router = useRouter();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const d = {
      s1: JSON.parse(localStorage.getItem('scaffold_step1') || '{}'),
      s2: JSON.parse(localStorage.getItem('scaffold_step2') || '{}'),
      s3: JSON.parse(localStorage.getItem('scaffold_step3') || '{}'),
      s4: JSON.parse(localStorage.getItem('scaffold_step4') || '{}'),
    };
    setData(d);
    setTimeout(() => setLoading(false), 600);
  }, []);

  const laenge = parseFloat(data.s2?.laenge) || 0;
  const hoehe = parseFloat(data.s2?.hoehe) || 0;
  const breite = parseFloat(data.s2?.breite) || 0;
  const feldlange = parseFloat(data.s3?.feldlange) || 3.0;
  const ankerAbstand = parseFloat(data.s4?.ankerAbstand) || 2.5;
  const geschossHoehe = 2.0;

  const felder = Math.max(1, Math.ceil(laenge / feldlange));
  const etagen = Math.max(1, Math.ceil(hoehe / geschossHoehe));
  const flaeche = laenge * hoehe;

  const material = {
    rahmen: felder * etagen * 2,
    vertikalstiele: felder * (etagen + 1) * 2,
    horizontalriegel: felder * etagen * 3,
    belaege: felder * etagen,
    gelander: felder * etagen * 2,
    stirngelander: felder,
    diagonalen: Math.ceil(felder * etagen * 0.7),
    konsolen: (data.s2?.hindernisse?.length || 0) * 2,
    fussspindeln: felder * 2,
    leitern: Math.ceil(hoehe / 4),
    treppen: Math.ceil(hoehe / 6),
    anker: Math.max(1, Math.ceil(hoehe / ankerAbstand)) * felder,
    kupplungen: felder * etagen * 4,
    netze: data.s4?.fangnetz ? Math.ceil(laenge * hoehe / 25) : 0,
    planen: data.s4?.schutzdach ? Math.ceil(laenge * 1.5) : 0,
    gittertraeger: data.s2?.durchfahrt ? Math.ceil(felder / 2) : 0,
    schutzdach: data.s4?.schutzdach ? 1 : 0,
  };

  const gewichte: any = {
    rahmen: 12, vertikalstiele: 8, horizontalriegel: 5,
    belaege: data.s3?.belag === 'stahl' ? 22 : data.s3?.belag === 'alu' ? 12 : 15,
    gelander: 5, stirngelander: 4, diagonalen: 8,
    konsolen: 8, fussspindeln: 3, leitern: 10,
    treppen: 35, anker: 2, kupplungen: 1,
    netze: 2, planen: 8, gittertraeger: 25, schutzdach: 45,
  };

  const gesamtGewicht = Object.entries(material).reduce((sum, [key, val]) => {
    return sum + (val as number) * (gewichte[key] || 0);
  }, 0);

  const volumenProStueck: any = {
    rahmen: 0.08, belaege: 0.06, diagonalen: 0.04,
    gelander: 0.02, treppen: 0.15, schutzdach: 0.4, gittertraeger: 0.12,
  };
  const gesamtVolumen = Object.entries(material).reduce((sum, [key, val]) => {
    return sum + (val as number) * (volumenProStueck[key] || 0.01);
  }, 0);

  let fahrzeug = '';
  if (gesamtGewicht < 500) fahrzeug = 'Transporter (z.B. VW Crafter) – ausreichend';
  else if (gesamtGewicht < 1500) fahrzeug = '3,5-Tonner mit Anhänger empfohlen';
  else if (gesamtGewicht < 3500) fahrzeug = '7,5-Tonner LKW erforderlich';
  else fahrzeug = 'Mehrere Fahrten oder 12-Tonner + Anhänger';

  const categories = [
    {
      title: 'Tragwerk',
      icon: '🏗️',
      items: [
        { name: 'Rahmen', stk: material.rahmen, kg: material.rahmen * gewichte.rahmen },
        { name: 'Vertikalstiele', stk: material.vertikalstiele, kg: material.vertikalstiele * gewichte.vertikalstiele },
        { name: 'Horizontalriegel', stk: material.horizontalriegel, kg: material.horizontalriegel * gewichte.horizontalriegel },
        { name: 'Kupplungen', stk: material.kupplungen, kg: material.kupplungen * gewichte.kupplungen },
      ]
    },
    {
      title: 'Belag & Plattform',
      icon: '🔲',
      items: [
        { name: 'Beläge', stk: material.belaege, kg: material.belaege * gewichte.belaege },
        { name: 'Fußspindeln', stk: material.fussspindeln, kg: material.fussspindeln * gewichte.fussspindeln },
      ]
    },
    {
      title: 'Sicherheit',
      icon: '🛡️',
      items: [
        { name: 'Geländer (Längs)', stk: material.gelander, kg: material.gelander * gewichte.gelander },
        { name: 'Stirngeländer', stk: material.stirngelander, kg: material.stirngelander * gewichte.stirngelander },
        { name: 'Diagonalen', stk: material.diagonalen, kg: material.diagonalen * gewichte.diagonalen },
        ...(material.netze > 0 ? [{ name: 'Fangnetze', stk: material.netze, kg: material.netze * gewichte.netze }] : []),
      ]
    },
    {
      title: 'Zugang',
      icon: '🪜',
      items: [
        { name: 'Leitern', stk: material.leitern, kg: material.leitern * gewichte.leitern },
        { name: 'Treppenelemente', stk: material.treppen, kg: material.treppen * gewichte.treppen },
      ]
    },
    {
      title: 'Verankerung & Zusatz',
      icon: '🔩',
      items: [
        { name: 'Anker / Verbindungen', stk: material.anker, kg: material.anker * gewichte.anker },
        { name: 'Konsolen', stk: material.konsolen, kg: material.konsolen * gewichte.konsolen },
        ...(material.gittertraeger > 0 ? [{ name: 'Gitterträger', stk: material.gittertraeger, kg: material.gittertraeger * gewichte.gittertraeger }] : []),
        ...(material.schutzdach > 0 ? [{ name: 'Schutzdach', stk: material.schutzdach, kg: material.schutzdach * gewichte.schutzdach }] : []),
        ...(material.planen > 0 ? [{ name: 'Planen', stk: material.planen, kg: material.planen * gewichte.planen }] : []),
      ].filter((i: any) => i.stk > 0)
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📦</div>
          <div className="text-xl font-semibold">Berechne Material...</div>
          <div className="text-slate-400 text-sm mt-2">{laenge} m × {hoehe} m = {felder} Felder × {etagen} Etagen</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => router.push('/planung')} className="text-slate-400 hover:text-white text-sm">← Zurück zur KI-Planung</button>
        </div>

        <h1 className="text-3xl font-bold mb-2">📦 Automatische Stückliste</h1>
        <p className="text-slate-400 mb-6">Berechnet aus Aufmaß-Daten</p>

        {data.s1?.name && (
          <div className="bg-slate-800/50 rounded-lg p-4 mb-6 flex justify-between items-center">
            <div>
              <div className="text-slate-300 font-semibold">{data.s1.name}</div>
              <div className="text-slate-400 text-sm">{data.s1.adresse}</div>
            </div>
            <div className="text-right text-sm text-slate-400">
              <div>{laenge} m × {hoehe} m</div>
              <div>{felder} Felder × {etagen} Etagen</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-orange-400">{gesamtGewicht.toLocaleString('de-DE')}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider mt-1">kg Gesamt</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">{gesamtVolumen.toFixed(1)}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider mt-1">m³ Ladevolumen</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 text-center">
            <div className="text-lg font-bold text-green-400 leading-tight">{flaeche}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider mt-1">m² Fläche</div>
          </div>
        </div>

        <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4 mb-6">
          <div className="text-blue-400 font-semibold text-sm mb-1">🚛 Fahrzeugempfehlung</div>
          <div className="text-blue-300/80 text-sm">{fahrzeug}</div>
        </div>

        <div className="space-y-4 mb-6">
          {categories.map((cat, i) => (
            <div key={i} className="bg-slate-800 rounded-xl overflow-hidden">
              <div className="bg-slate-700/50 px-4 py-3 flex items-center gap-2">
                <span className="text-xl">{cat.icon}</span>
                <span className="font-semibold text-sm uppercase tracking-wider text-slate-300">{cat.title}</span>
              </div>
              <div className="divide-y divide-slate-700">
                {cat.items.map((item: any, j: number) => (
                  <div key={j} className="px-4 py-3 flex justify-between items-center">
                    <span className="text-slate-300">{item.name}</span>
                    <div className="text-right">
                      <div className="text-white font-semibold">{item.stk} Stk</div>
                      <div className="text-xs text-slate-500">{item.kg} kg</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4 text-sm text-slate-400 mb-6">
          <div className="font-semibold text-slate-300 mb-1">ℹ️ Berechnungsgrundlage</div>
          <ul className="space-y-1 text-xs">
            <li>• Feldlänge: {feldlange} m | Geschosshöhe: {geschossHoehe} m</li>
            <li>• Ankerabstand: {ankerAbstand} m | Windzone: {data.s4?.windzone || '2'}</li>
            <li>• Gerüsttyp: {data.s3?.geruesttyp || 'nicht gewählt'}</li>
            <li>• Diese Stückliste ist eine Planungshilfe. Die endgültige Mengenermittlung obliegt dem Fachplaner.</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <button onClick={() => router.push('/planung')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded-lg transition">
            ← Zurück
          </button>
          <button onClick={() => alert('PDF-Export der Stückliste kommt als Nächstes!')} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-lg transition">
            📄 PDF Export
          </button>
        </div>
      </div>
    </div>
  );
}