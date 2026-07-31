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
    setTimeout(() => setLoading(false), 800); // KI-Denkeffekt 😄
  }, []);

  // ─── KI REGELWERK ───
  function getLastklasse() {
    const g = data.s1?.gewerke || [];
    if (g.includes('WDVS/Fassade') || g.includes('Putz')) return { wert: 'LK 3', grund: 'WDVS/Fassade erfordert höhere Nutzlast für Material & Geräte' };
    if (g.includes('Dach')) return { wert: 'LK 4', grund: 'Dacharbeiten mit Schüttgut und Werkzeug' };
    if (g.includes('Maler')) return { wert: 'LK 2', grund: 'Malerarbeiten = Personenlast + leichte Materialien' };
    return { wert: 'LK 2', grund: 'Standard-Personenlast' };
  }

  function getBreitenklasse() {
    const h = parseFloat(data.s2?.hoehe) || 0;
    const b = parseFloat(data.s2?.breite) || 0;
    if (h > 15 || b > 1.5) return { wert: 'Breitenklasse 3 (1,50 m)', grund: 'Große Höhe/Breite erfordert breitere Plattform für sicheres Arbeiten' };
    if (data.s3?.geruesttyp === 'fahr') return { wert: 'Breitenklasse 2 (1,35 m)', grund: 'Fahrgerüst benötigt ausreichende Plattformbreite' };
    return { wert: 'Breitenklasse 2 (1,35 m)', grund: 'Standard für Maler- und Fassadenarbeiten' };
  }

  function getVerankerung() {
    const f = data.s2?.fassade;
    const h = parseFloat(data.s2?.hoehe) || 0;
    if (f === 'WDVS' || f === 'Klinker') return { wert: 'Fassadenanker mit Düsenanker', grund: `${f} erfordert bohrfeste Verankerung` };
    if (f === 'Denkmalschutz') return { wert: 'Gewichtsanker / Rüstanker', grund: 'Denkmalschutz: Keine Bohrungen in der Fassade erlaubt' };
    if (h > 12) return { wert: 'Verstärkte Ankerung alle 2,0 m', grund: 'Ab 12 m Höhe: Verstärkte Ankerung nach DIN EN 12811' };
    return { wert: 'Standard-Fassadenanker alle 2,5 m', grund: 'Regelverankerung für normale Bedingungen' };
  }

  function getBelag() {
    const lk = getLastklasse().wert;
    if (lk === 'LK 4' || lk === 'LK 5') return { wert: 'Stahlroste', grund: 'Hohe Lastklasse erfordert schweren Belag' };
    if (data.s2?.durchfahrt || data.s3?.belag === 'gitter') return { wert: 'Gitterträger', grund: 'Durchfahrt / Eingang freizuhalten' };
    if (data.s3?.belag === 'alu') return { wert: 'Alu-Belag', grund: 'Leicht, korrosionsfrei – gewählt im Aufmaß' };
    return { wert: 'Holzbelag', grund: 'Standard für LK 2–3, kostengünstig' };
  }

  function getDiagonale() {
    const h = parseFloat(data.s2?.hoehe) || 0;
    if (h >= 6) return { wert: 'Zwingend erforderlich', grund: `Höhe ${h} m ≥ 6 m: Diagonale Aussteifung nach DIN EN 12811-1 Pflicht`, status: 'pflicht' };
    return { wert: 'Empfohlen', grund: 'Unter 6 m: Optional, aber empfohlen für Stabilität', status: 'empfohlen' };
  }

  function getFangnetz() {
    const h = parseFloat(data.s2?.hoehe) || 0;
    const oeff = data.s4?.oeffentlicherVerkehrsraum;
    if (h > 10 && oeff) return { wert: 'Zwingend + Fanggerüst', grund: 'Höhe > 10 m + öffentlicher Raum = Fangnetz + Fanggerüst erforderlich', status: 'pflicht' };
    if (h > 10) return { wert: 'Empfohlen', grund: 'Höhe > 10 m: Fangnetz zum Schutz vor herabfallenden Gegenständen', status: 'empfohlen' };
    if (oeff) return { wert: 'Empfohlen', grund: 'Öffentlicher Verkehrsraum: Schutz für Fußgänger', status: 'empfohlen' };
    return { wert: 'Nicht erforderlich', grund: 'Geringe Höhe, kein öffentlicher Raum', status: 'ok' };
  }

  function getSchutzdach() {
    if (data.s4?.oeffentlicherVerkehrsraum || data.s4?.nachbargrundstueck) 
      return { wert: 'Zwingend erforderlich', grund: 'Schutz für Fußgänger / Nachbarn vor herabfallenden Gegenständen', status: 'pflicht' };
    if (data.s4?.freileitungen || data.s4?.stromleitungen)
      return { wert: 'Empfohlen', grund: 'Freileitungen in der Nähe – zusätzlicher Schutz', status: 'empfohlen' };
    return { wert: 'Optional', grund: 'Kein öffentlicher Raum, keine kritischen Leitungen', status: 'ok' };
  }

  function getGittertraeger() {
    if (data.s2?.durchfahrt) return { wert: 'Erforderlich', grund: 'Durchfahrt / Eingang muss frei bleiben', status: 'pflicht' };
    if (data.s2?.hindernisse?.includes('Wintergarten') || data.s2?.hindernisse?.includes('Erker'))
      return { wert: 'Empfohlen', grund: 'Hindernisse erfordern flexible Überbrückung', status: 'empfohlen' };
    return { wert: 'Nicht erforderlich', grund: 'Keine Durchfahrt, keine kritischen Hindernisse', status: 'ok' };
  }

  function getTreppenturm() {
    const h = parseFloat(data.s2?.hoehe) || 0;
    if (h > 8) return { wert: 'Empfohlen', grund: `Höhe ${h} m: Komfortablerer und sichererer Zugang als Leiter`, status: 'empfohlen' };
    return { wert: 'Leiter ausreichend', grund: 'Bis 8 m: Gerüstleiter nach DIN EN 131 ausreichend', status: 'ok' };
  }

  function getKran() {
    if (data.s4?.kranErforderlich) return { wert: 'Eingeplant', grund: 'Manuell im Aufmaß markiert', status: 'pflicht' };
    const h = parseFloat(data.s2?.hoehe) || 0;
    if (h > 20) return { wert: 'Empfohlen', grund: 'Ab 20 m Höhe: Materialtransport per Kran effizienter', status: 'empfohlen' };
    return { wert: 'Nicht erforderlich', grund: 'Höhe und Material manageable per Hand/Hub', status: 'ok' };
  }

  function getWindlast() {
    const z = data.s4?.windzone || '2';
    if (z === '3' || z === '4') return { wert: 'Verstärkte Aussteifung', grund: `Windzone ${z}: Erhöhte Windlast, zusätzliche Diagonalen und Anker empfohlen`, status: 'warnung' };
    return { wert: 'Standardaussteifung', grund: `Windzone ${z}: Normale Aussteifung ausreichend`, status: 'ok' };
  }

  function getFundament() {
    const u = data.s4?.untergrund;
    const t = data.s4?.tragfaehigkeit;
    if (u === 'erdreich' || u === 'rasen' || t === 'gering') 
      return { wert: 'Lastverteilplatten + Unterlegplatten', grund: 'Weicher Untergrund erfordert Kraftverteilung', status: 'pflicht' };
    if (data.s4?.gefaelle) return { wert: 'Ausgleichsfußspindeln', grund: 'Gefälle erfordert verstellbare Füße', status: 'pflicht' };
    return { wert: 'Standard-Fußplatten', grund: 'Fester Untergrund, keine Besonderheiten', status: 'ok' };
  }

  function getSondernutzung() {
    if (data.s4?.sondernutzung || data.s4?.halteverbot)
      return { wert: 'Beantragung erforderlich', grund: 'Sondernutzungserlaubnis / Halteverbotszone prüfen', status: 'warnung' };
    return { wert: 'Nicht erforderlich', grund: 'Keine Beantragung nötig', status: 'ok' };
  }

  const entscheidungen = [
    { kategorie: 'Gerüsttyp', icon: '🏗️', ...getLastklasse(), detail: data.s3?.geruesttyp ? `Gewählt: ${data.s3.geruesttyp}` : 'Nicht spezifiziert' },
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
          <div className="text-slate-400 text-sm mt-2">DIN EN 12811 • TRBS 2121 • Herstellervorgaben</div>
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

        {/* Projektinfo */}
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

        {/* Entscheidungen */}
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
                  {e.detail && <div className="text-xs text-slate-500 mt-1">{e.detail}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Hinweis */}
        <div className="mt-6 bg-slate-800/50 rounded-lg p-4 text-sm text-slate-400">
          <div className="font-semibold text-slate-300 mb-1">⚠️ Rechtlicher Hinweis</div>
          Diese Planung dient als technische Unterstützung. Die endgültige Prüfung und Freigabe obliegt einem qualifizierten Gerüstbau-Fachplaner. Alle Angaben ohne Gewähr.
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mt-6">
          <button onClick={() => router.push('/aufmass/schritt6')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded-lg transition">
            ← Zurück
          </button>
          <button onClick={() => alert('Stückliste kommt als Nächstes!')} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-lg transition">
            Zur Stückliste →
          </button>
        </div>
      </div>
    </div>
  );
}