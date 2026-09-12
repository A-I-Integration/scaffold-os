'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GERUEST_SYSTEME, CUSTOM_SYSTEM_ID, findeSystem } from '@/lib/calculations/geruest-systeme';

const LEERES_FORM_S3 = {
  geruesttyp: '',
  system: '',          // Gerüstsystem-ID aus geruest-systeme.ts ('' = hersteller-neutral, 'custom' = eigenes)
  customSystem: '',    // Freitext bei system === 'custom'
  feldlange: '3.0',
  belag: 'holz',
  gelander: true,
  diagonale: true,
  fahrbar: false,
  boden: 'beton',
};

function Schritt3Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id');
  const [step1Data, setStep1Data] = useState<any>(null);
  // NEU: Abschnitte aus Schritt 2 – erlaubt einen eigenen Gerüsttyp je
  // Abschnitt (z.B. Fassadengerüst am Hauptgebäude, Dachgerüst am Anbau).
  const [abschnitte, setAbschnitte] = useState<{ bezeichnung: string; laenge: string; hoehe: string; geruesttyp?: string }[]>([])
  
  const [form, setForm] = useState({ ...LEERES_FORM_S3 });

  const geruestTypen = [
    { id: 'fassade', name: 'Fassadengerüst', icon: '🏢', desc: 'Standard für Maler & WDVS' },
    { id: 'fahr', name: 'Fahrgerüst', icon: '🚧', desc: 'Rollbar, für große Flächen' },
    { id: 'trag', name: 'Traggerüst', icon: '⚒️', desc: 'Überbrückung, hohe Lasten' },
    { id: 'dach', name: 'Dachgerüst', icon: '🏠', desc: 'Dacharbeiten & Schornstein' },
    { id: 'raum', name: 'Raumgerüst', icon: '📦', desc: 'Innenräume, Hallen' },
    { id: 'haenge', name: 'Hängegerüst', icon: '⛓️', desc: 'Fassade ohne Bodenkontakt' },
  ];

  const belagTypen = [
    { id: 'holz', name: 'Holzbelag', desc: 'Standard, günstig' },
    { id: 'alu', name: 'Alu-Belag', desc: 'Leicht, korrosionsfrei' },
    { id: 'stahl', name: 'Stahlroste', desc: 'Schwere Last, LK 4-5' },
    { id: 'gitter', name: 'Gitterträger', desc: 'Durchfahrt möglich' },
  ];

  const bodenTypen = [
    { id: 'beton', name: 'Beton / Estrich' },
    { id: 'asphalt', name: 'Asphalt' },
    { id: 'pflaster', name: 'Pflaster / Platten' },
    { id: 'rasen', name: 'Rasen / Erdreich' },
    { id: 'kies', name: 'Schotter / Kies' },
  ];

  useEffect(() => {
    if (projectId) {
      const zuletztBearbeitet = localStorage.getItem('scaffold_editing_project_id');
      if (zuletztBearbeitet !== projectId) {
        localStorage.setItem('scaffold_editing_project_id', projectId);
        // FIX (systematische Prüfung): sofort zurücksetzen, bevor der
        // Abruf startet – sonst könnten kurzzeitig oder bei einem
        // fehlschlagenden Abruf dauerhaft die Werte eines ANDEREN
        // Projekts sichtbar bleiben.
        setForm({ ...LEERES_FORM_S3 });
        (async () => {
          try {
            const res = await fetch('/api/projects?id=' + projectId);
            const json = await res.json();
            const d = json.project?.data;
            if (json.success && d?.step1) { localStorage.setItem('scaffold_step1', JSON.stringify(d.step1)); setStep1Data(d.step1); }
            if (json.success && d?.step2?.abschnitte) { setAbschnitte(d.step2.abschnitte); }
            if (json.success && d?.step3) { localStorage.setItem('scaffold_step3', JSON.stringify(d.step3)); setForm(d.step3); }
          } catch { /* ignore, unten bleibt der bisherige Stand */ }
        })();
        return;
      }
    }
    const saved = localStorage.getItem('scaffold_step1');
    if (saved) setStep1Data(JSON.parse(saved));
    const saved2 = localStorage.getItem('scaffold_step2');
    if (saved2) { try { const p = JSON.parse(saved2); if (Array.isArray(p.abschnitte)) setAbschnitte(p.abschnitte); } catch { /* ignore */ } }
    const saved3 = localStorage.getItem('scaffold_step3');
    if (saved3) setForm(JSON.parse(saved3));
  }, [projectId]);

  // Gerüsttyp eines einzelnen Abschnitts ändern – wird zurück in
  // scaffold_step2 gespeichert, damit Schritt 6 es beim Zusammenbauen
  // der Berechnung findet (ScaffoldSection.scaffoldType).
  function abschnittTypAendern(index: number, typ: string) {
    setAbschnitte((prev) => {
      const neu = prev.map((a, i) => i === index ? { ...a, geruesttyp: typ } : a)
      try {
        const bestehend = JSON.parse(localStorage.getItem('scaffold_step2') || '{}')
        localStorage.setItem('scaffold_step2', JSON.stringify({ ...bestehend, abschnitte: neu }))
      } catch { /* ignore */ }
      return neu
    })
  }

  function handleWeiter() {
    if (!form.geruesttyp) {
      alert('Bitte wähle einen Gerüsttyp aus!');
      return;
    }
    localStorage.setItem('scaffold_step3', JSON.stringify(form));
    router.push(projectId ? `/aufmass/schritt4?id=${projectId}` : '/aufmass/schritt4');
  }

  function zurueck() {
    router.push(projectId ? `/aufmass/schritt2?id=${projectId}` : '/aufmass/schritt2');
  }

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f] p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={zurueck} className="text-[#86868b] hover:text-[#1d1d1f] text-sm">← Zurück</button>
        </div>
        <h1 className="text-3xl font-bold mb-2">🏗️ Gerüsttyp & Aufbau</h1>
        <p className="text-[#86868b] mb-2">Baustelle: Schritt 3 von 6</p>
        
        {step1Data && (
          <div className="bg-black/5 rounded-xl p-3 mb-6 text-sm text-[#86868b]">
            <span className="text-[#424245] font-medium">{step1Data.name}</span> · {step1Data.adresse}
          </div>
        )}

        <div className="bg-[#f5f5f7] rounded-xl p-6 space-y-6">

          <div>
            <label className="block text-sm font-medium mb-3 text-[#424245]">Gerüsttyp *</label>
            <div className="grid grid-cols-1 gap-3">
              {geruestTypen.map(g => (
                <button
                  key={g.id}
                  onClick={() => setForm({...form, geruesttyp: g.id})}
                  className={`p-4 rounded-xl border text-left transition flex items-center gap-4 ${
                    form.geruesttyp === g.id
                      ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]'
                      : 'bg-black/10 border-black/10 text-[#424245] hover:border-black/20'
                  }`}
                >
                  <span className="text-2xl">{g.icon}</span>
                  <div>
                    <div className="font-semibold">{g.name}</div>
                    <div className="text-xs opacity-70">{g.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* NEU: Eigener Gerüsttyp je zusätzlichem Abschnitt (z.B.
              Fassadengerüst am Hauptgebäude, Dachgerüst am Anbau) – die
              Auswahl oben gilt für Abschnitt 1 (Hauptgebäude), zusätzliche
              Abschnitte aus Schritt 2 können hier individuell abweichen. */}
          {abschnitte.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-3 text-[#424245]">Gerüsttyp je zusätzlichem Abschnitt</label>
              <div className="space-y-2">
                {abschnitte.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm text-[#424245] w-40 truncate">{a.bezeichnung || `Abschnitt ${i + 2}`}</span>
                    <select
                      value={a.geruesttyp || ''}
                      onChange={(e) => abschnittTypAendern(i, e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-xl text-sm"
                    >
                      <option value="">wie oben ({geruestTypen.find((g) => g.id === form.geruesttyp)?.name || 'Hauptauswahl'})</option>
                      {geruestTypen.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[#86868b] mt-1">Ohne eigene Auswahl gilt für diesen Abschnitt die Hauptauswahl oben.</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1 text-[#424245]">Gerüstsystem / Hersteller (optional)</label>
            <p className="text-xs text-[#86868b] mb-3">Leer lassen = hersteller-neutral rechnen. Bei Auswahl werden Feldlänge & Bauteil-Bezeichnungen ans System angepasst.</p>
            <div className="grid grid-cols-1 gap-2">
              {GERUEST_SYSTEME.map(s => (
                <button
                  key={s.id}
                  onClick={() => setForm({
                    ...form,
                    system: form.system === s.id ? '' : s.id,
                    customSystem: form.system === s.id ? form.customSystem : '',
                    // Standard-Feldlänge des Systems vorschlagen
                    feldlange: form.system === s.id ? form.feldlange : String(s.standardFeldlangeM),
                  })}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-3 ${
                    form.system === s.id
                      ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]'
                      : 'bg-black/10 border-black/10 text-[#424245] hover:border-black/20'
                  }`}
                >
                  <span className="text-xl">{s.bauart === 'modul' ? '🧩' : '🖼️'}</span>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{s.hersteller} {s.systemName}</div>
                    <div className="text-xs opacity-70">
                      {s.bauart === 'modul' ? 'Modulsystem' : 'Rahmensystem'} · Raster {s.rasterHoeheM.toFixed(2).replace('.', ',')} m · Felder {s.feldlangenM.map(f => f.toFixed(2).replace('.', ',')).join(' / ')} m
                    </div>
                    <div className="text-xs opacity-60">{s.hinweis}</div>
                  </div>
                </button>
              ))}
              <button
                onClick={() => setForm({ ...form, system: form.system === CUSTOM_SYSTEM_ID ? '' : CUSTOM_SYSTEM_ID })}
                className={`p-3 rounded-xl border text-left transition flex items-center gap-3 ${
                  form.system === CUSTOM_SYSTEM_ID
                    ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]'
                    : 'bg-black/10 border-black/10 text-[#424245] hover:border-black/20'
                }`}
              >
                <span className="text-xl">✏️</span>
                <div className="flex-1">
                  <div className="font-semibold text-sm">Eigenes System / anderer Hersteller</div>
                  <div className="text-xs opacity-70">Namen frei eintragen – Feldlänge bleibt frei wählbar</div>
                </div>
              </button>
              {form.system === CUSTOM_SYSTEM_ID && (
                <input
                  type="text"
                  value={form.customSystem}
                  onChange={(e) => setForm({ ...form, customSystem: e.target.value })}
                  placeholder="z. B. Altrad, Betco, Gebrauchtes Misch-System …"
                  className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f]"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-[#424245]">Standard-Feldlänge (m)</label>
            <select
              value={form.feldlange}
              onChange={(e) => setForm({...form, feldlange: e.target.value})}
              className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f]"
            >
              {(() => {
                const sys = findeSystem(form.system);
                const basis = sys ? sys.feldlangenM : [2.0, 2.5, 3.0, 3.5];
                const werte = [...new Set([...basis.map(String), form.feldlange])].sort((a, b) => parseFloat(a) - parseFloat(b));
                return werte.map((w) => {
                  const n = parseFloat(w);
                  const std = sys && n === sys.standardFeldlangeM;
                  return (
                    <option key={w} value={w}>
                      {n.toFixed(2).replace('.', ',')} m{std ? ' (System-Standard)' : !sys && n === 3.0 ? ' (Standard)' : ''}
                    </option>
                  );
                });
              })()}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-[#424245]">Belagtyp</label>
            <div className="grid grid-cols-2 gap-3">
              {belagTypen.map(b => (
                <button
                  key={b.id}
                  onClick={() => setForm({...form, belag: b.id})}
                  className={`p-3 rounded-xl border text-left transition ${
                    form.belag === b.id
                      ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]'
                      : 'bg-black/10 border-black/10 text-[#424245]'
                  }`}
                >
                  <div className="font-semibold text-sm">{b.name}</div>
                  <div className="text-xs opacity-70">{b.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <button onClick={() => setForm({...form, gelander: !form.gelander})}
              className={`w-full p-3 rounded-xl border text-left transition flex items-center gap-3 ${form.gelander ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10'}`}>
              <span className="text-xl">🛡️</span>
              <div><div className="font-semibold text-sm">Geländer & Brüstung</div><div className="text-xs opacity-70">DIN EN 12811-1 vorgeschrieben</div></div>
            </button>
            <button onClick={() => setForm({...form, diagonale: !form.diagonale})}
              className={`w-full p-3 rounded-xl border text-left transition flex items-center gap-3 ${form.diagonale ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10'}`}>
              <span className="text-xl">📐</span>
              <div><div className="font-semibold text-sm">Diagonale Aussteifung</div><div className="text-xs opacity-70">Empfohlen ab 6 m Höhe</div></div>
            </button>
            <button onClick={() => setForm({...form, fahrbar: !form.fahrbar})}
              className={`w-full p-3 rounded-xl border text-left transition flex items-center gap-3 ${form.fahrbar ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10'}`}>
              <span className="text-xl">🛞</span>
              <div><div className="font-semibold text-sm">Fahrbar / Rollbar</div><div className="text-xs opacity-70">Rollen unter den Standardfüßen</div></div>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-[#424245]">Bodenverhältnisse</label>
            <div className="grid grid-cols-2 gap-3">
              {bodenTypen.map(b => (
                <button key={b.id} onClick={() => setForm({...form, boden: b.id})}
                  className={`p-3 rounded-xl border text-left transition ${form.boden === b.id ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10'}`}>
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={zurueck} className="flex-1 bg-black/10 hover:bg-black/15 text-[#1d1d1f] font-semibold py-3 px-4 rounded-xl">← Zurück</button>
            <button onClick={handleWeiter} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-xl">Weiter →</button>
          </div>

        </div>
      </div>
    </div>
  );
}
// useSearchParams braucht in Next eine Suspense-Grenze (Prerendering)
export default function Schritt3Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white p-8 text-[#86868b]">Lädt…</div>}>
      <Schritt3Content />
    </Suspense>
  );
}
