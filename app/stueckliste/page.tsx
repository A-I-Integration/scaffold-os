'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function StuecklistePage() {
  const router = useRouter();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

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

  const heute = new Date().toLocaleDateString('de-DE');

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-[#1d1d1f] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📦</div>
          <div className="text-xl font-semibold">Berechne Material...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f] p-6">
      {/* NORMALE ANSICHT */}
      <div className="max-w-3xl mx-auto print:hidden">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => router.push('/planung')} className="text-[#86868b] hover:text-[#1d1d1f] text-sm">← Zurück zur KI-Planung</button>
        </div>

        <h1 className="text-3xl font-bold mb-2">📦 Automatische Stückliste</h1>
        <p className="text-[#86868b] mb-6">Berechnet aus Aufmaß-Daten</p>

        {data.s1?.name && (
          <div className="bg-black/5 rounded-xl p-4 mb-6 flex justify-between items-center">
            <div>
              <div className="text-[#424245] font-semibold">{data.s1.name}</div>
              <div className="text-[#86868b] text-sm">{data.s1.adresse}</div>
            </div>
            <div className="text-right text-sm text-[#86868b]">
              <div>{laenge} m × {hoehe} m</div>
              <div>{felder} Felder × {etagen} Etagen</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-[#f5f5f7] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-[#e8590c]">{gesamtGewicht.toLocaleString('de-DE')}</div>
            <div className="text-xs text-[#86868b] uppercase tracking-wider mt-1">kg Gesamt</div>
          </div>
          <div className="bg-[#f5f5f7] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{gesamtVolumen.toFixed(1)}</div>
            <div className="text-xs text-[#86868b] uppercase tracking-wider mt-1">m³ Ladevolumen</div>
          </div>
          <div className="bg-[#f5f5f7] rounded-xl p-4 text-center">
            <div className="text-lg font-bold text-emerald-600 leading-tight">{flaeche}</div>
            <div className="text-xs text-[#86868b] uppercase tracking-wider mt-1">m² Fläche</div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-500/50 rounded-xl p-4 mb-6">
          <div className="text-blue-600 font-semibold text-sm mb-1">🚛 Fahrzeugempfehlung</div>
          <div className="text-blue-700 text-sm">{fahrzeug}</div>
        </div>

        <div className="space-y-4 mb-6">
          {categories.map((cat, i) => (
            <div key={i} className="bg-[#f5f5f7] rounded-xl overflow-hidden">
              <div className="bg-black/10/50 px-4 py-3 flex items-center gap-2">
                <span className="text-xl">{cat.icon}</span>
                <span className="font-semibold text-sm uppercase tracking-wider text-[#424245]">{cat.title}</span>
              </div>
              <div className="divide-y divide-black/5">
                {cat.items.map((item: any, j: number) => (
                  <div key={j} className="px-4 py-3 flex justify-between items-center">
                    <span className="text-[#424245]">{item.name}</span>
                    <div className="text-right">
                      <div className="text-[#1d1d1f] font-semibold">{item.stk} Stk</div>
                      <div className="text-xs text-[#86868b]">{item.kg} kg</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-black/5 rounded-xl p-4 text-sm text-[#86868b] mb-6">
          <div className="font-semibold text-[#424245] mb-1">ℹ️ Berechnungsgrundlage</div>
          <ul className="space-y-1 text-xs">
            <li>• Feldlänge: {feldlange} m | Geschosshöhe: {geschossHoehe} m</li>
            <li>• Ankerabstand: {ankerAbstand} m | Windzone: {data.s4?.windzone || '2'}</li>
            <li>• Diese Stückliste ist eine Planungshilfe. Die endgültige Mengenermittlung obliegt dem Fachplaner.</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <button onClick={() => router.push('/planung')} className="flex-1 bg-black/10 hover:bg-black/15 text-[#1d1d1f] font-semibold py-3 px-4 rounded-xl transition">
            ← Zurück
          </button>
          <button onClick={handlePrint} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-xl transition">
            📄 PDF Export
          </button>
        </div>
      </div>

      {/* PRINT ANSICHT – nur beim Drucken sichtbar */}
      <div ref={printRef} className="hidden print:block bg-white text-black p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">SCAFFOLD OS</h1>
              <p className="text-gray-600 text-sm mt-1">Automatische Stückliste & Materialplanung</p>
            </div>
            <div className="text-right text-sm text-gray-600">
              <div className="font-semibold">Datum: {heute}</div>
              <div>Seite 1 von 1</div>
            </div>
          </div>
        </div>

        {/* Projektinfo */}
        <div className="bg-gray-100 rounded-xl p-4 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Projektdaten</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Projekt:</div>
              <div className="font-semibold text-gray-900">{data.s1?.name || '–'}</div>
            </div>
            <div>
              <div className="text-gray-600">Adresse:</div>
              <div className="font-semibold text-gray-900">{data.s1?.adresse || '–'}</div>
            </div>
            <div>
              <div className="text-gray-600">Abmessungen:</div>
              <div className="font-semibold text-gray-900">{laenge} m × {hoehe} m | {flaeche} m²</div>
            </div>
            <div>
              <div className="text-gray-600">Felder × Etagen:</div>
              <div className="font-semibold text-gray-900">{felder} × {etagen}</div>
            </div>
          </div>
        </div>

        {/* Zusammenfassung */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="border border-gray-300 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-gray-900">{gesamtGewicht.toLocaleString('de-DE')} kg</div>
            <div className="text-xs text-gray-600 uppercase">Gesamtgewicht</div>
          </div>
          <div className="border border-gray-300 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-gray-900">{gesamtVolumen.toFixed(1)} m³</div>
            <div className="text-xs text-gray-600 uppercase">Ladevolumen</div>
          </div>
          <div className="border border-gray-300 rounded-xl p-3 text-center">
            <div className="text-sm font-bold text-gray-900 leading-tight">{fahrzeug}</div>
            <div className="text-xs text-gray-600 uppercase">Fahrzeug</div>
          </div>
        </div>

        {/* Tabelle */}
        <table className="w-full border-collapse mb-6">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-800">
              <th className="text-left py-2 px-3 text-sm font-bold text-gray-900">Pos.</th>
              <th className="text-left py-2 px-3 text-sm font-bold text-gray-900">Bezeichnung</th>
              <th className="text-right py-2 px-3 text-sm font-bold text-gray-900">Menge</th>
              <th className="text-right py-2 px-3 text-sm font-bold text-gray-900">Einheit</th>
              <th className="text-right py-2 px-3 text-sm font-bold text-gray-900">Gewicht (kg)</th>
            </tr>
          </thead>
          <tbody>
            {categories.flatMap((cat, ci) => [
              <tr key={`head-${ci}`} className="bg-gray-50">
                <td colSpan={5} className="py-2 px-3 text-sm font-bold text-gray-700 border-b border-gray-200">
                  {cat.title}
                </td>
              </tr>,
              ...cat.items.map((item: any, ii: number) => (
                <tr key={`${ci}-${ii}`} className="border-b border-gray-200">
                  <td className="py-2 px-3 text-sm text-gray-900">{ci + 1}.{ii + 1}</td>
                  <td className="py-2 px-3 text-sm text-gray-900">{item.name}</td>
                  <td className="py-2 px-3 text-sm text-gray-900 text-right font-mono">{item.stk}</td>
                  <td className="py-2 px-3 text-sm text-gray-600 text-right">Stk</td>
                  <td className="py-2 px-3 text-sm text-gray-900 text-right font-mono">{item.kg.toLocaleString('de-DE')}</td>
                </tr>
              ))
            ])}
            <tr className="bg-gray-100 border-t-2 border-gray-800 font-bold">
              <td colSpan={4} className="py-3 px-3 text-sm text-gray-900 text-right">GESAMT:</td>
              <td className="py-3 px-3 text-sm text-gray-900 text-right font-mono">{gesamtGewicht.toLocaleString('de-DE')} kg</td>
            </tr>
          </tbody>
        </table>

        {/* Hinweise */}
        <div className="text-xs text-gray-600 space-y-1 border-t border-gray-300 pt-4">
          <p><strong>Berechnungsgrundlage:</strong> Feldlänge {feldlange} m, Geschosshöhe {geschossHoehe} m, Ankerabstand {ankerAbstand} m, Windzone {data.s4?.windzone || '2'}</p>
          <p><strong>Haftungsausschluss:</strong> Diese Stückliste wurde automatisch auf Basis der eingegebenen Aufmaß-Daten erstellt. Die endgültige Mengenermittlung und technische Prüfung obliegt einem qualifizierten Gerüstbau-Fachplaner. Alle Angaben ohne Gewähr.</p>
          <p className="mt-2 text-gray-400">Erstellt mit SCAFFOLD OS | scaffold-os.vercel.app</p>
        </div>
      </div>
    </div>
  );
}