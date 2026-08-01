'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PlanungPage() {
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
    setTimeout(() => setLoading(false), 800);
  }, []);

  function getLastklasse() {
    const g = data.s1?.gewerke || [];
    if (g.includes('WDVS/Fassade') || g.includes('Putz')) return { wert: 'LK 3', grund: 'WDVS/Fassade erfordert höhere Nutzlast', status: 'ok' };
    if (g.includes('Dach')) return { wert: 'LK 4', grund: 'Dacharbeiten mit Schüttgut', status: 'ok' };
    if (g.includes('Maler')) return { wert: 'LK 2', grund: 'Malerarbeiten = Personenlast', status: 'ok' };
    return { wert: 'LK 2', grund: 'Standard-Personenlast', status: 'ok' };
  }

  function getBreitenklasse() {
    const h = parseFloat(data.s2?.hoehe) || 0;
    const b = parseFloat(data.s2?.breite) || 0;
    if (h > 15 || b > 1.5) return { wert: 'Breitenklasse 3 (1,50 m)', grund: 'Große Höhe/Breite', status: 'ok' };
    if (data.s3?.geruesttyp === 'fahr') return { wert: 'Breitenklasse 2 (1,35 m)', grund: 'Fahrgerüst', status: 'ok' };
    return { wert: 'Breitenklasse 2 (1,35 m)', grund: 'Standard', status: 'ok' };
  }

  function getVerankerung() {
    const f = data.s2?.fassade;
    const h = parseFloat(data.s2?.hoehe) || 0;
    if (f === 'WDVS' || f === 'Klinker') return { wert: 'Fassadenanker mit Düsenanker', grund: `${f} erfordert bohrfeste Verankerung`, status: 'ok' };
    if (f === 'Denkmalschutz') return { wert: 'Gewichtsanker', grund: 'Keine Bohrungen erlaubt', status: 'warnung' };
    if (h > 12) return { wert: 'Verstärkte Ankerung alle 2,0 m', grund: 'Ab 12 m Höhe', status: 'pflicht' };
    return { wert: 'Standard-Fassadenanker alle 2,5 m', grund: 'Regelverankerung', status: 'ok' };
  }

  function getBelag() {
    const lk = getLastklasse().wert;
    if (lk === 'LK 4' || lk === 'LK 5') return { wert: 'Stahlroste', grund: 'Hohe Lastklasse', status: 'ok' };
    if (data.s2?.durchfahrt || data.s3?.belag === 'gitter') return { wert: 'Gitterträger', grund: 'Durchfahrt', status: 'ok' };
    if (data.s3?.belag === 'alu') return { wert: 'Alu-Belag', grund: 'Leicht, korrosionsfrei', status: 'ok' };
    return { wert: 'Holzbelag', grund: 'Standard für LK 2–3', status: 'ok' };
  }

  function getDiagonale() {
    const h = parseFloat(data.s2?.hoehe) || 0;
    if (h >= 6) return { wert: 'Zwingend erforderlich', grund: `Höhe ${h} m ≥ 6 m: Pflicht`, status: 'pflicht' };
    return { wert: 'Empfohlen', grund: 'Optional, aber empfohlen', status: 'empfohlen' };
  }

  function getFangnetz() {
    const h = parseFloat(data.s2?.hoehe) || 0;
    const oeff = data.s4?.oeffentlicherVerkehrsraum;
    if (h > 10 && oeff) return { wert: 'Zwingend + Fanggerüst', grund: 'Höhe > 10 m + öffentlicher Raum', status: 'pflicht' };
    if (h > 10) return { wert: 'Empfohlen', grund: 'Höhe > 10 m', status: 'empfohlen' };
    if (oeff) return { wert: 'Empfohlen', grund: 'Öffentlicher Verkehrsraum', status: 'empfohlen' };
    return { wert: 'Nicht erforderlich', grund: 'Geringe Höhe', status: 'ok' };
  }

  function getSchutzdach() {
    if (data.s4?.oeffentlicherVerkehrsraum || data.s4?.nachbargrundstueck) 
      return { wert: 'Zwingend erforderlich', grund: 'Schutz für Fußgänger', status: 'pflicht' };
    if (data.s4?.freileitungen || data.s4?.stromleitungen)
      return { wert: 'Empfohlen', grund: 'Freileitungen', status: 'empfohlen' };
    return { wert: 'Optional', grund: 'Kein öffentlicher Raum', status: 'ok' };
  }

  function getGittertraeger() {
    if (data.s2?.durchfahrt) return { wert: 'Erforderlich', grund: 'Durchfahrt', status: 'pflicht' };
    if (data.s2?.hindernisse?.includes('Wintergarten') || data.s2?.hindernisse?.includes('Erker'))
      return { wert: 'Empfohlen', grund: 'Hindernisse', status: 'empfohlen' };
    return { wert: 'Nicht erforderlich', grund: 'Keine Durchfahrt', status: 'ok' };
  }

  function getTreppenturm() {
    const h = parseFloat(data.s2?.hoehe) || 0;
    if (h > 8) return { wert: 'Empfohlen', grund: `Höhe ${h} m`, status: 'empfohlen' };
    return { wert: 'Leiter ausreichend', grund: 'Bis 8 m', status: 'ok' };
  }

  function getKran() {
    if (data.s4?.kranErforderlich) return { wert: 'Eingeplant', grund: 'Manuell markiert', status: 'pflicht' };
    const h = parseFloat(data.s2?.hoehe) || 0;
    if (h > 20) return { wert: 'Empfohlen', grund: 'Ab 20 m', status: 'empfohlen' };
    return { wert: 'Nicht erforderlich', grund: 'Manageable per Hand', status: 'ok' };
  }

  function getWindlast() {
    const z = data.s4?.windzone || '2';
    if (z === '3' || z === '4') return { wert: 'Verstärkte Aussteifung', grund: `Windzone ${z}`, status: 'warnung' };
    return { wert: 'Standardaussteifung', grund: `Windzone ${z}`, status: 'ok' };
  }

  function getFundament() {
    const u = data.s4?.untergrund;
    const t = data.s4?.tragfaehigkeit;
    if (u === 'erdreich' || u === 'rasen' || t === 'gering') 
      return { wert: 'Lastverteilplatten', grund: 'Weicher Untergrund', status: 'pflicht' };
    if (data.s4?.gefaelle) return { wert: 'Ausgleichsfußspindeln', grund: 'Gefälle', status: 'pflicht' };
    return { wert: 'Standard-Fußplatten', grund: 'Fester Untergrund', status: 'ok' };
  }

  function getSondernutzung() {
    if (data.s4?.sondernutzung || data.s4?.halteverbot)
      return { wert: 'Beantragung erforderlich', grund: 'Sondernutzung', status: 'warnung' };
    return { wert: 'Nicht erforderlich', grund: 'Keine Beantragung', status: 'ok' };
  }

  const entscheidungen = [
    { kategorie: 'Lastklasse', icon: '⚖️', ...getLastklasse() },
    { kategorie: 'Breitenklasse', icon: '📏', ...getBreitenklasse() },
    { kategorie: 'Belagtyp', icon: '🔲', ...getBelag() },
    { kategorie: 'Verankerung', icon: '🔩', ...getVerankerung() },
    { kategorie: 'Fundament / Füße', icon: '🏔️', ...getFundament() },
    { kategorie: 'Diagonale Aussteifung', icon: '📐', ...getDiagonale() },
    { kategorie: 'Fangnetz / Fanggerüst', icon: '🕸️', ...getFangnetz() },
    { kategorie: 'Schutzdach', icon: '☂️', ...getSchutzdach() },
    { kategorie: 'Gitterträger', icon: '⬜', ...getGittertraeger() },
    { kategorie: 'Treppenturm / Zugang', icon: '🪜', ...getTreppenturm() },
    { kategorie: 'Kran / Heben', icon: '🏗️', ...getKran() },
    { kategorie: 'Windlast-Maßnahmen', icon: '💨', ...getWindlast() },
    { kategorie: 'Genehmigungen', icon: '📋', ...getSondernutzung() },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🧠</div>
          <div className="text-xl font-semibold">KI analysiert Baustelle...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => router.push('/aufmass/schritt6')} className="text-slate-400 hover:text-white text-sm">← Zurück zur Zusammenfassung</button>
        </div>
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">🤖 KI Gerüstplanung</h1>
          <p className="text-slate-400">Automatische Planung basierend auf Aufmaß-Daten</p>
        </div>

        {data.s1?.name && (
          <div className="bg-slate-800/50 rounded-lg p-4 mb-6 flex justify-between items-center">
            <div>
              <div className="text-slate-300 font-semibold">{data.s1.name}</div>
              <div className="text-slate-400 text-sm">{data.s1.adresse}</div>
            </div>
            <div className="text-right text-sm text-slate-400">
              <div>{data.s2?.laenge} m × {data.s2?.hoehe} m</div>
              <div>Zone {data.s4?.windzone}</div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {entscheidungen.map((e, i) => (
            <div key={i} className={`bg-slate-800 rounded-xl p-4 border-l-4 ${
              e.status === 'pflicht' ? 'border-red-500' :
              e.status === 'warnung' ? 'border-yellow-500' :
              e.status === 'empfohlen' ? 'border-blue-500' :
              'border-green-500'
            }`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{e.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{e.kategorie}</span>
                    {e.status === 'pflicht' && <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded font-semibold">PFLICHT</span>}
                    {e.status === 'warnung' && <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded font-semibold">ACHTUNG</span>}
                    {e.status === 'empfohlen' && <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded font-semibold">EMPFOHLEN</span>}
                  </div>
                  <div className="text-lg font-semibold text-white mb-1">{e.wert}</div>
                  <div className="text-sm text-slate-400">{e.grund}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 bg-slate-800/50 rounded-lg p-4 text-sm text-slate-400">
          <div className="font-semibold text-slate-300 mb-1">⚠️ Rechtlicher Hinweis</div>
          Diese Planung dient als technische Unterstützung. Die endgültige Prüfung obliegt einem qualifizierten Gerüstbau-Fachplaner.
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={() => router.push('/aufmass/schritt6')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded-lg transition">
            ← Zurück
          </button>
          <button onClick={() => router.push('/stueckliste')} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-lg transition">
            Zur Stückliste →
          </button>
        </div>
      </div>
    </div>
  );
}