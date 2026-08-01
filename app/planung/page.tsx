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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🧠</div>
          <div className="text-xl font-semibold">KI analysiert Baustelle...</div>
          <div className="text-slate-400 text-sm mt-2">DIN EN 12811 • TRBS 2121</div>
        </div>
      </div>
    );
  }

  const s1 = data.s1 || {};
  const s2 = data.s2 || {};
  const s3 = data.s3 || {};
  const s4 = data.s4 || {};

  const gewerke = s1.gewerke || [];
  const hoehe = parseFloat(s2.hoehe) || 0;
  const fassade = s2.fassade || '';
  const windzone = s4.windzone || '2';

  // ─── KI REGELWERK ───
  // Lastklasse
  let lastklasseWert = 'LK 2';
  let lastklasseGrund = 'Standard-Personenlast';
  if (gewerke.includes('WDVS/Fassade') || gewerke.includes('Putz')) {
    lastklasseWert = 'LK 3';
    lastklasseGrund = 'WDVS/Fassade erfordert höhere Nutzlast';
  } else if (gewerke.includes('Dach')) {
    lastklasseWert = 'LK 4';
    lastklasseGrund = 'Dacharbeiten mit Schüttgut und Werkzeug';
  } else if (gewerke.includes('Maler')) {
    lastklasseWert = 'LK 2';
    lastklasseGrund = 'Malerarbeiten = Personenlast + leichte Materialien';
  }

  // Breitenklasse
  let breiteWert = 'Breitenklasse 2 (1,35 m)';
  let breiteGrund = 'Standard für Maler- und Fassadenarbeiten';
  if (hoehe > 15) {
    breiteWert = 'Breitenklasse 3 (1,50 m)';
    breiteGrund = 'Große Höhe erfordert breitere Plattform';
  } else if (s3.geruesttyp === 'fahr') {
    breiteGrund = 'Fahrgerüst benötigt ausreichende Plattformbreite';
  }

  // Belag
  let belagWert = 'Holzbelag';
  let belagGrund = 'Standard für LK 2–3, kostengünstig';
  if (lastklasseWert === 'LK 4' || lastklasseWert === 'LK 5') {
    belagWert = 'Stahlroste';
    belagGrund = 'Hohe Lastklasse erfordert schweren Belag';
  } else if (s2.durchfahrt || s3.belag === 'gitter') {
    belagWert = 'Gitterträger';
    belagGrund = 'Durchfahrt / Eingang freizuhalten';
  } else if (s3.belag === 'alu') {
    belagWert = 'Alu-Belag';
    belagGrund = 'Leicht, korrosionsfrei';
  }

  // Verankerung
  let ankerWert = 'Standard-Fassadenanker alle 2,5 m';
  let ankerGrund = 'Regelverankerung für normale Bedingungen';
  let ankerStatus = 'ok';
  if (fassade === 'WDVS' || fassade === 'Klinker') {
    ankerWert = 'Fassadenanker mit Düsenanker';
    ankerGrund = fassade + ' erfordert bohrfeste Verankerung';
  } else if (fassade === 'Denkmalschutz') {
    ankerWert = 'Gewichtsanker / Rüstanker';
    ankerGrund = 'Denkmalschutz: Keine Bohrungen erlaubt';
    ankerStatus = 'warnung';
  } else if (hoehe > 12) {
    ankerWert = 'Verstärkte Ankerung alle 2,0 m';
    ankerGrund = 'Ab 12 m Höhe: Verstärkte Ankerung nach DIN EN 12811';
    ankerStatus = 'pflicht';
  }

  // Diagonale
  let diagWert = 'Empfohlen';
  let diagGrund = 'Unter 6 m: Optional, aber empfohlen';
  let diagStatus = 'empfohlen';
  if (hoehe >= 6) {
    diagWert = 'Zwingend erforderlich';
    diagGrund = 'Höhe ' + hoehe + ' m ≥ 6 m: Diagonale Aussteifung nach DIN EN 12811-1 Pflicht';
    diagStatus = 'pflicht';
  }

  // Fangnetz
  let fangWert = 'Nicht erforderlich';
  let fangGrund = 'Geringe Höhe, kein öffentlicher Raum';
  let fangStatus = 'ok';
  if (hoehe > 10 && s4.oeffentlicherVerkehrsraum) {
    fangWert = 'Zwingend + Fanggerüst';
    fangGrund = 'Höhe > 10 m + öffentlicher Raum = Fangnetz + Fanggerüst erforderlich';
    fangStatus = 'pflicht';
  } else if (hoehe > 10) {
    fangWert = 'Empfohlen';
    fangGrund = 'Höhe > 10 m: Fangnetz zum Schutz vor herabfallenden Gegenständen';
    fangStatus = 'empfohlen';
  } else if (s4.oeffentlicherVerkehrsraum) {
    fangWert = 'Empfohlen';
    fangGrund = 'Öffentlicher Verkehrsraum: Schutz für Fußgänger';
    fangStatus = 'empfohlen';
  }

  // Schutzdach
  let schutzWert = 'Optional';
  let schutzGrund = 'Kein öffentlicher Raum, keine kritischen Leitungen';
  let schutzStatus = 'ok';
  if (s4.oeffentlicherVerkehrsraum || s4.nachbargrundstueck) {
    schutzWert = 'Zwingend erforderlich';
    schutzGrund = 'Schutz für Fußgänger / Nachbarn vor herabfallenden Gegenständen';
    schutzStatus = 'pflicht';
  } else if (s4.freileitungen || s4.stromleitungen) {
    schutzWert = 'Empfohlen';
    schutzGrund = 'Freileitungen in der Nähe – zusätzlicher Schutz';
    schutzStatus = 'empfohlen';
  }

  // Gitterträger
  let gitterWert = 'Nicht erforderlich';
  let gitterGrund = 'Keine Durchfahrt, keine kritischen Hindernisse';
  let gitterStatus = 'ok';
  if (s2.durchfahrt) {
    gitterWert = 'Erforderlich';
    gitterGrund = 'Durchfahrt / Eingang muss frei bleiben';
    gitterStatus = 'pflicht';
  } else if (s2.hindernisse?.includes('Wintergarten') || s2.hindernisse?.includes('Erker')) {
    gitterWert = 'Empfohlen';
    gitterGrund = 'Hindernisse erfordern flexible Überbrückung';
    gitterStatus = 'empfohlen';
  }

  // Treppenturm
  let treppeWert = 'Leiter ausreichend';
  let treppeGrund = 'Bis 8 m: Gerüstleiter nach DIN EN 131 ausreichend';
  let treppeStatus = 'ok';
  if (hoehe > 8) {
    treppeWert = 'Empfohlen';
    treppeGrund = 'Höhe ' + hoehe + ' m: Komfortablerer und sichererer Zugang';
    treppeStatus = 'empfohlen';
  }

  // Kran
  let kranWert = 'Nicht erforderlich';
  let kranGrund = 'Höhe und Material manageable per Hand/Hub';
  let kranStatus = 'ok';
  if (s4.kranErforderlich) {
    kranWert = 'Eingeplant';
    kranGrund = 'Manuell im Aufmaß markiert';
    kranStatus = 'pflicht';
  } else if (hoehe > 20) {
    kranWert = 'Empfohlen';
    kranGrund = 'Ab 20 m Höhe: Materialtransport per Kran effizienter';
    kranStatus = 'empfohlen';
  }

  // Windlast
  let windWert = 'Standardaussteifung';
  let windGrund = 'Windzone ' + windzone + ': Normale Aussteifung ausreichend';
  let windStatus = 'ok';
  if (windzone === '3' || windzone === '4') {
    windWert = 'Verstärkte Aussteifung';
    windGrund = 'Windzone ' + windzone + ': Erhöhte Windlast, zusätzliche Diagonalen';
    windStatus = 'warnung';
  }

  // Fundament
  let fundWert = 'Standard-Fußplatten';
  let fundGrund = 'Fester Untergrund, keine Besonderheiten';
  let fundStatus = 'ok';
  const untergrund = s4.untergrund;
  const tragfaehigkeit = s4.tragfaehigkeit;
  if (untergrund === 'erdreich' || untergrund === 'rasen' || tragfaehigkeit === 'gering') {
    fundWert = 'Lastverteilplatten + Unterlegplatten';
    fundGrund = 'Weicher Untergrund erfordert Kraftverteilung';
    fundStatus = 'pflicht';
  } else if (s4.gefaelle) {
    fundWert = 'Ausgleichsfußspindeln';
    fundGrund = 'Gefälle erfordert verstellbare Füße';
    fundStatus = 'pflicht';
  }

  // Genehmigungen
  let genehmWert = 'Nicht erforderlich';
  let genehmGrund = 'Keine Beantragung nötig';
  let genehmStatus = 'ok';
  if (s4.sondernutzung || s4.halteverbot) {
    genehmWert = 'Beantragung erforderlich';
    genehmGrund = 'Sondernutzungserlaubnis / Halteverbotszone prüfen';
    genehmStatus = 'warnung';
  }

  // Statisches Array – KEINE Funktionsaufrufe im JSX
  const entscheidungen = [
    { kategorie: 'Lastklasse', icon: '⚖️', wert: lastklasseWert, grund: lastklasseGrund, status: 'ok' },
    { kategorie: 'Breitenklasse', icon: '📏', wert: breiteWert, grund: breiteGrund, status: 'ok' },
    { kategorie: 'Belagtyp', icon: '🔲', wert: belagWert, grund: belagGrund, status: 'ok' },
    { kategorie: 'Verankerung', icon: '🔩', wert: ankerWert, grund: ankerGrund, status: ankerStatus },
    { kategorie: 'Fundament / Füße', icon: '🏔️', wert: fundWert, grund: fundGrund, status: fundStatus },
    { kategorie: 'Diagonale Aussteifung', icon: '📐', wert: diagWert, grund: diagGrund, status: diagStatus },
    { kategorie: 'Fangnetz / Fanggerüst', icon: '🕸️', wert: fangWert, grund: fangGrund, status: fangStatus },
    { kategorie: 'Schutzdach', icon: '☂️', wert: schutzWert, grund: schutzGrund, status: schutzStatus },
    { kategorie: 'Gitterträger', icon: '⬜', wert: gitterWert, grund: gitterGrund, status: gitterStatus },
    { kategorie: 'Treppenturm / Zugang', icon: '🪜', wert: treppeWert, grund: treppeGrund, status: treppeStatus },
    { kategorie: 'Kran / Heben', icon: '🏗️', wert: kranWert, grund: kranGrund, status: kranStatus },
    { kategorie: 'Windlast-Maßnahmen', icon: '💨', wert: windWert, grund: windGrund, status: windStatus },
    { kategorie: 'Genehmigungen', icon: '📋', wert: genehmWert, grund: genehmGrund, status: genehmStatus },
  ];

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

        {s1.name && (
          <div className="bg-slate-800/50 rounded-lg p-4 mb-6 flex justify-between items-center">
            <div>
              <div className="text-slate-300 font-semibold">{s1.name}</div>
              <div className="text-slate-400 text-sm">{s1.adresse}</div>
            </div>
            <div className="text-right text-sm text-slate-400">
              <div>{s2.laenge} m × {s2.hoehe} m</div>
              <div>Zone {windzone}</div>
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
          <button onClick={() => router.push('/aufmass/schritt6')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded-lg transition">← Zurück</button>
          <button onClick={() => router.push('/stueckliste')} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-lg transition">Zur Stückliste →</button>
        </div>
      </div>
    </div>
  );
}