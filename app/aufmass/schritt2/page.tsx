'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import KIWarnings from '@/components/aufmaß/KIWarnings';
import { useKIValidation } from '@/hooks/useKIValidation';
import { PartialScaffoldInput } from '@/types/scaffold';

export default function Schritt2Page() {
  const router = useRouter();
  const [step1Data, setStep1Data] = useState<any>(null);
  const [lidarUebernommen, setLidarUebernommen] = useState(false);
  const [kiUebernommen, setKiUebernommen] = useState(false);
  const [grundrissUebernommen, setGrundrissUebernommen] = useState(false);
  const [hoeheGeschaetzt, setHoeheGeschaetzt] = useState(false);

  const [form, setForm] = useState({
    laenge: '',
    hoehe: '',
    breite: '',
    traufhoehe: '',
    // NEU: weitere Abschnitte für Gebäude mit unterschiedlichen Höhen
    // oder die um eine Ecke gehen. Länge/Höhe oben bleiben "Abschnitt 1".
    abschnitte: [] as { bezeichnung: string; laenge: string; hoehe: string }[],
    // NEU: Brücken-Aufmaß (nur relevant, wenn step1Data.projektart === 'bruecke')
    bruecke: {
      spannweiten: [{ bezeichnung: 'Feld 1', spannweiteM: '', breiteM: '' }] as { bezeichnung: string; spannweiteM: string; breiteM: string }[],
      hoeheUeberGrundM: '',
      aufhaengung: 'bodenstehend' as 'haengend' | 'bodenstehend',
      untergrundArt: 'strasse' as 'strasse' | 'schiene' | 'gewaesser' | 'gelaende',
      verkehrEinschraenkungNoetig: false,
    },
    dachform: '',
    dachueberstand: '',
    fassade: '',
    garagen: false,
    fluchtwege: false,
    werbeanlagen: false,
    hauseingaenge: '',
    hindernisse: [] as string[],
    durchfahrt: false,
  });

  const hindernisListe = ['Erker', 'Balkon', 'Wintergarten', 'Kamin', 'Gaube', 'Markise'];
  const dachformen = ['Satteldach', 'Flachdach', 'Pultdach', 'Walmdach', 'Mansarddach', 'Zeltdach'];
  const fassaden = ['Klinker', 'WDVS', 'Beton', 'Naturstein', 'Glas', 'Holz', 'Putz', 'Denkmalschutz'];

  // ==========================================================
  // KI-MAPPING: Dein Form-State → KI-Engine Format
  // ==========================================================
  function mapFormToKIInput(): PartialScaffoldInput {
    // Fassade mappen
    const fassadeMap: Record<string, any> = {
      'Klinker': 'mauerwerk',
      'WDVS': 'wdvs',
      'Beton': 'beton',
      'Naturstein': 'mauerwerk',
      'Glas': 'glas',
      'Holz': 'holz',
      'Putz': 'mauerwerk',
      'Denkmalschutz': 'denkmal',
    };

    // Dachform mappen
    const dachMap: Record<string, any> = {
      'Satteldach': 'satteldach',
      'Flachdach': 'flachdach',
      'Pultdach': 'pultdach',
      'Walmdach': 'walmdach',
      'Mansarddach': 'mansardendach',
      'Zeltdach': 'satteldach',
    };

    // Hindernisse mappen (deine Strings → KI-Obstacle-Format)
    const hindernisMap: Record<string, any> = {
      'Erker': 'erker',
      'Balkon': 'balkon',
      'Wintergarten': 'sonstiges',
      'Kamin': 'schornstein',
      'Gaube': 'gaube',
      'Markise': 'sonstiges',
    };

    const obstacles = form.hindernisse.map(h => ({
      type: hindernisMap[h] || 'sonstiges',
      count: 1,
      notes: h,
    }));

    // Zusätzliche Hindernisse aus Toggle-Buttons
    if (form.werbeanlagen) {
      obstacles.push({ type: 'werbeanlage', count: 1, notes: 'Werbeanlage' });
    }
    if (form.garagen) {
      obstacles.push({ type: 'sonstiges', count: 1, notes: 'Garage/Nebengebäude' });
    }

    return {
      lengthM: parseFloat(form.laenge) || 0,
      heightM: parseFloat(form.hoehe) || 0,
      widthM: parseFloat(form.breite) || 0,
      eavesHeightM: parseFloat(form.traufhoehe) || 0,
      roofForm: dachMap[form.dachform] || 'flachdach',
      roofOverhangM: parseFloat(form.dachueberstand) || 0,
      facadeType: fassadeMap[form.fassade] || 'mauerwerk',
      obstacles,
      // Defaults für Felder, die erst in späteren Schritten kommen
      projectDurationDays: 30,
      scaffoldType: 'rahmen',
      deckingType: 'stahl',
      fieldLengthM: 2.07,
      groundType: 'beton',
      anchorType: 'fassadenanker',
      groundCondition: 'beton',
      hasSlope: false,
      hasLightShafts: false,
      hasBasement: false,
      needsLoadDistribution: false,
      environment: {
        hasPowerLines: false,
        hasVegetation: false,
        hasNeighborProperty: false,
        hasPublicTraffic: form.durchfahrt,
        needsNoParkingZone: false,
        needsSpecialUse: false,
        hasStorageArea: false,
        hasTruckAccess: false,
        needsCrane: false,
        needsProtectionRoof: false,
        needsSafetyNet: false,
      },
      windZone: 1,
      hazards: form.fassade === 'Denkmalschutz' ? ['denkmalschutz'] : [],
      additionalNotes: form.fluchtwege ? 'Fluchtwege beachten' : '',
    };
  }

  // ⭐ KI-VALIDIERUNG: Läuft bei JEDER Form-Änderung automatisch
  const kiResult = useKIValidation(mapFormToKIInput());

  useEffect(() => {
    const saved = localStorage.getItem('scaffold_step1');
    if (saved) setStep1Data(JSON.parse(saved));
    const saved2 = localStorage.getItem('scaffold_step2');
    if (saved2) {
      const geladen = JSON.parse(saved2);
      // Fix: ältere gespeicherte Aufmaße (vor "mehrere Abschnitte"/"Brücke") haben
      // kein abschnitte- bzw. bruecke-Feld – ohne diesen Fallback stürzt die Seite
      // beim Rendern ab.
      setForm((prev) => ({
        ...prev,
        ...geladen,
        abschnitte: Array.isArray(geladen.abschnitte) ? geladen.abschnitte : [],
        bruecke: geladen.bruecke && Array.isArray(geladen.bruecke.spannweiten) ? geladen.bruecke : prev.bruecke,
      }));
    }

    // LiDAR-Maße aus Schritt 1 übernehmen (nur leere Felder, nichts überschreiben).
    // Fix: War bisher nur EIN einmaliger Check beim Laden – falls die Analyse beim
    // Wechsel zu Schritt 2 noch beim Worker lief, kam das Ergebnis nie an. Jetzt
    // wird bis zu 2 Minuten lang alle paar Sekunden nachgeschaut, ob es fertig ist.
    const versucheLidarUebernahme = () => {
      const lidarRaw = localStorage.getItem('scaffold_lidar_measurements');
      if (!lidarRaw) return false;
      try {
        const m = JSON.parse(lidarRaw);
        const fresh = localStorage.getItem('scaffold_lidar_fresh') === '1';
        setForm((prev) => ({
          ...prev,
          laenge: fresh ? (m.lengthM ? m.lengthM.toFixed(2) : prev.laenge) : (prev.laenge || (m.lengthM ? m.lengthM.toFixed(2) : '')),
          breite: fresh ? (m.widthM ? m.widthM.toFixed(2) : prev.breite) : (prev.breite || (m.widthM ? m.widthM.toFixed(2) : '')),
          hoehe: fresh ? (m.heightM ? m.heightM.toFixed(2) : prev.hoehe) : (prev.hoehe || (m.heightM ? m.heightM.toFixed(2) : '')),
        }));
        if (fresh) localStorage.removeItem('scaffold_lidar_fresh');
        setLidarUebernommen(true);
        return true;
      } catch {
        return false;
      }
    };
    // Fix: Der Polling-Aufbau darf NICHT vorzeitig aus dem Effekt zurückkehren –
    // sonst werden die Grundriss- und Foto-Übernahme weiter unten (siehe unten)
    // komplett übersprungen, und zwar IMMER, wenn beim allerersten Check noch
    // keine LiDAR-Daten vorlagen (also im Normalfall, wenn gar kein LiDAR-Scan
    // gemacht wurde). Das war der Bug: „Daten wurden nicht in Schritt 2
    // übernommen" betraf dadurch nicht nur LiDAR, sondern auch Grundriss/Foto.
    let lidarIntervall: ReturnType<typeof setInterval> | undefined;
    if (!versucheLidarUebernahme()) {
      let versuche = 0;
      lidarIntervall = setInterval(() => {
        versuche++;
        if (versucheLidarUebernahme() || versuche >= 24) clearInterval(lidarIntervall); // 24 × 5s = 2 Min.
      }, 5000);
    }

    // KI-Grundriss-Analyse aus Schritt 1 übernehmen.
    // Frisch analysiert (Flag aus Schritt 1)? Dann gewinnen die Grundriss-Werte
    // und ersetzen Alt-Eingaben komplett. Beim späteren Wiederaufruf (Zurück-
    // Navigation) bleibt es beim alten Verhalten: nur leere Felder füllen.
    const grundrissRaw = localStorage.getItem('scaffold_grundriss_daten');
    if (grundrissRaw) {
      try {
        const g = JSON.parse(grundrissRaw);
        const fresh = localStorage.getItem('scaffold_grundriss_fresh') === '1';
        const gHoehe = g.hoehe ? String(g.hoehe) : (g.hoehe_geschaetzt ? String(g.hoehe_geschaetzt) : '');
        if (fresh) {
          setForm((prev) => ({
            ...prev,
            laenge: g.laenge ? String(g.laenge) : prev.laenge,
            breite: g.breite ? String(g.breite) : prev.breite,
            hoehe: gHoehe || prev.hoehe,
            traufhoehe: g.traufhoehe ? String(g.traufhoehe) : prev.traufhoehe,
            dachform: dachformen.includes(g.dachform) ? g.dachform : prev.dachform,
            hauseingaenge: g.hauseingaenge ? String(g.hauseingaenge) : prev.hauseingaenge,
            hindernisse: Array.isArray(g.hindernisse)
              ? g.hindernisse.filter((h: string) => hindernisListe.includes(h))
              : prev.hindernisse,
            garagen: g.garagen === true,
            durchfahrt: g.durchfahrt === true,
          }));
          if (!g.hoehe && g.hoehe_geschaetzt) setHoeheGeschaetzt(true);
          localStorage.removeItem('scaffold_grundriss_fresh');
        } else {
          setForm((prev) => ({
            ...prev,
            laenge: prev.laenge || (g.laenge ? String(g.laenge) : ''),
            breite: prev.breite || (g.breite ? String(g.breite) : ''),
            hoehe: prev.hoehe || gHoehe,
            traufhoehe: prev.traufhoehe || (g.traufhoehe ? String(g.traufhoehe) : ''),
            dachform: prev.dachform || (dachformen.includes(g.dachform) ? g.dachform : ''),
            hauseingaenge: prev.hauseingaenge || (g.hauseingaenge ? String(g.hauseingaenge) : ''),
            hindernisse: Array.from(new Set([
              ...prev.hindernisse,
              ...(Array.isArray(g.hindernisse) ? g.hindernisse.filter((h: string) => hindernisListe.includes(h)) : []),
            ])),
            garagen: prev.garagen || g.garagen === true,
            durchfahrt: prev.durchfahrt || g.durchfahrt === true,
          }));
          // Schätz-Hinweis nur, wenn die Schätzung auch wirklich landet:
          // weder gespeicherter Stand noch LiDAR haben bereits eine Höhe.
          let vorhandeneHoehe = '';
          try { vorhandeneHoehe = JSON.parse(localStorage.getItem('scaffold_step2') || '{}')?.hoehe || ''; } catch { /* ignore */ }
          try { const lm = JSON.parse(localStorage.getItem('scaffold_lidar_measurements') || '{}'); if (!vorhandeneHoehe && lm.heightM) vorhandeneHoehe = String(lm.heightM); } catch { /* ignore */ }
          if (!vorhandeneHoehe && !g.hoehe && g.hoehe_geschaetzt) setHoeheGeschaetzt(true);
        }
        setGrundrissUebernommen(true);
      } catch {
        // ignore
      }
    }

    // KI-Foto-Analyse aus Schritt 1 übernehmen (nur leere Felder / neue Werte)
    const fotoRaw = localStorage.getItem('scaffold_foto_daten');
    if (fotoRaw) {
      try {
        const k = JSON.parse(fotoRaw);
        setForm((prev) => ({
          ...prev,
          fassade: prev.fassade || (fassaden.includes(k.fassade) ? k.fassade : ''),
          dachform: prev.dachform || (dachformen.includes(k.dachform) ? k.dachform : ''),
          hauseingaenge: prev.hauseingaenge || (k.hauseingaenge ? String(k.hauseingaenge) : ''),
          hindernisse: Array.from(new Set([
            ...prev.hindernisse,
            ...(Array.isArray(k.hindernisse) ? k.hindernisse.filter((h: string) => hindernisListe.includes(h)) : []),
          ])),
          garagen: prev.garagen || k.garagen === true,
          werbeanlagen: prev.werbeanlagen || k.werbeanlagen === true,
          durchfahrt: prev.durchfahrt || k.durchfahrt === true,
        }));
        setKiUebernommen(true);
      } catch {
        // ignore
      }
    }

    return () => { if (lidarIntervall) clearInterval(lidarIntervall); };
  }, []);

  function toggleHindernis(h: string) {
    setForm(prev => ({
      ...prev,
      hindernisse: prev.hindernisse.includes(h)
        ? prev.hindernisse.filter(x => x !== h)
        : [...prev.hindernisse, h]
    }));
  }

  const istBruecke = step1Data?.projektart === 'bruecke';

  function bruecke() { return form.bruecke; }
  function setBruecke(patch: Partial<typeof form.bruecke>) {
    setForm(prev => ({ ...prev, bruecke: { ...prev.bruecke, ...patch } }));
  }
  function updateSpannweite(idx: number, patch: Partial<{ bezeichnung: string; spannweiteM: string; breiteM: string }>) {
    setForm(prev => {
      const neu = [...prev.bruecke.spannweiten];
      neu[idx] = { ...neu[idx], ...patch };
      return { ...prev, bruecke: { ...prev.bruecke, spannweiten: neu } };
    });
  }

  function brueckeGueltig() {
    return form.bruecke.spannweiten.some(s => parseFloat(s.spannweiteM) > 0) && parseFloat(form.bruecke.hoeheUeberGrundM) >= 0;
  }

  function handleWeiter() {
    if (istBruecke) {
      if (!brueckeGueltig()) { alert('Bitte mindestens eine Spannweite und die Höhe über Grund/Gewässer eingeben!'); return; }
      localStorage.setItem('scaffold_step2', JSON.stringify(form));
      router.push('/aufmass/schritt3');
      return;
    }
    if (!form.laenge || !form.hoehe) {
      alert('Bitte gib mindestens Länge und Höhe ein!');
      return;
    }
    localStorage.setItem('scaffold_step2', JSON.stringify(form));
    router.push('/aufmass/schritt3');
  }

  // Schnellweg nach KI-Grundriss-Analyse: direkt zur Zusammenfassung/Angebot.
  // Schritte 3–5 nutzen dann ihre Standardwerte (in Schritt 6 jederzeit änderbar
  // über Zurück-Navigation).
  function handleDirektAngebot() {
    if (istBruecke) {
      if (!brueckeGueltig()) { alert('Bitte mindestens eine Spannweite und die Höhe über Grund/Gewässer eingeben!'); return; }
      localStorage.setItem('scaffold_step2', JSON.stringify(form));
      router.push('/aufmass/schritt6');
      return;
    }
    if (!form.laenge || !form.hoehe) {
      alert('Bitte gib mindestens Länge und Höhe ein!');
      return;
    }
    localStorage.setItem('scaffold_step2', JSON.stringify(form));
    router.push('/aufmass/schritt6');
  }

  function zurueck() {
    router.push('/aufmass/schritt1');
  }

  // ═══════════ BRÜCKEN-AUFMASS (eigener, kürzerer Zweig) ═══════════
  if (istBruecke) {
    return (
      <div className="min-h-screen bg-white text-[#1d1d1f] p-6">
        <div className="max-w-2xl mx-auto">
          <button onClick={zurueck} className="text-[#86868b] hover:text-[#1d1d1f] text-sm mb-2">← Zurück</button>
          <h1 className="text-3xl font-bold mb-2">🌉 Brücke & Spannweiten</h1>
          <p className="text-[#86868b] mb-2">Baustelle: Schritt 2 von 6</p>
          {step1Data && (
            <div className="bg-black/5 rounded-xl p-3 mb-6 text-sm text-[#86868b]">
              <span className="text-[#424245] font-medium">{step1Data.name}</span> · {step1Data.adresse}
            </div>
          )}

          <div className="bg-[#f5f5f7] rounded-xl p-6 space-y-6">
            <div>
              <h3 className="text-[#e8590c] text-xs font-bold uppercase tracking-wider mb-3">Spannweite(n)</h3>
              <p className="text-xs text-[#86868b] mb-3">Bei mehreren Feldern (z. B. mehrfeldrige Brücke) je Feld eine Zeile hinzufügen.</p>
              <div className="space-y-2">
                {form.bruecke.spannweiten.map((s, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                    <input value={s.bezeichnung} onChange={e => updateSpannweite(idx, { bezeichnung: e.target.value })}
                      placeholder={`Feld ${idx + 1}`} className="bg-black/10 border border-black/10 rounded-xl px-3 py-2 text-sm" />
                    <input type="number" value={s.spannweiteM} onChange={e => updateSpannweite(idx, { spannweiteM: e.target.value })}
                      placeholder="Spannweite m" className="w-28 bg-black/10 border border-black/10 rounded-xl px-3 py-2 text-sm" />
                    <input type="number" value={s.breiteM} onChange={e => updateSpannweite(idx, { breiteM: e.target.value })}
                      placeholder="Breite m" className="w-24 bg-black/10 border border-black/10 rounded-xl px-3 py-2 text-sm" />
                    {form.bruecke.spannweiten.length > 1 && (
                      <button type="button" onClick={() => setBruecke({ spannweiten: form.bruecke.spannweiten.filter((_, i) => i !== idx) })} className="text-red-600 text-sm px-2">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setBruecke({ spannweiten: [...form.bruecke.spannweiten, { bezeichnung: `Feld ${form.bruecke.spannweiten.length + 1}`, spannweiteM: '', breiteM: '' }] })}
                className="mt-2 text-sm text-[#e8590c] font-semibold hover:underline">+ Weiteres Feld hinzufügen</button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-[#424245]">Höhe über Grund / Gewässer (m) *</label>
              <input type="number" value={form.bruecke.hoeheUeberGrundM} onChange={e => setBruecke({ hoeheUeberGrundM: e.target.value })}
                className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-3" placeholder="z.B. 6.5" />
              <p className="text-xs text-[#86868b] mt-1">Lichte Höhe von der Arbeitsebene bis zum Boden bzw. Wasserspiegel darunter.</p>
            </div>

            <div>
              <h3 className="text-[#e8590c] text-xs font-bold uppercase tracking-wider mb-3">Aufhängungsart</h3>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setBruecke({ aufhaengung: 'bodenstehend' })}
                  className={`rounded-xl border-2 p-4 text-left transition ${form.bruecke.aufhaengung === 'bodenstehend' ? 'border-[#e8590c] bg-[#e8590c]/10' : 'border-black/10 bg-black/5'}`}>
                  <div className="font-semibold">⚒️ Traggerüst (bodenstehend)</div>
                  <div className="text-xs text-[#86868b] mt-0.5">Stützt sich am Boden/Gewässergrund ab</div>
                </button>
                <button type="button" onClick={() => setBruecke({ aufhaengung: 'haengend' })}
                  className={`rounded-xl border-2 p-4 text-left transition ${form.bruecke.aufhaengung === 'haengend' ? 'border-[#e8590c] bg-[#e8590c]/10' : 'border-black/10 bg-black/5'}`}>
                  <div className="font-semibold">⛓️ Hängegerüst</div>
                  <div className="text-xs text-[#86868b] mt-0.5">Hängt am Brückenbauwerk, kein Bodenkontakt</div>
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-[#e8590c] text-xs font-bold uppercase tracking-wider mb-3">Was befindet sich darunter?</h3>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'strasse', label: '🚗 Straße' },
                  { id: 'schiene', label: '🚆 Schiene' },
                  { id: 'gewaesser', label: '🌊 Gewässer' },
                  { id: 'gelaende', label: '🌳 Gelände' },
                ] as const).map(opt => (
                  <button key={opt.id} type="button" onClick={() => setBruecke({ untergrundArt: opt.id })}
                    className={`rounded-xl border-2 p-3 text-sm text-left transition ${form.bruecke.untergrundArt === opt.id ? 'border-[#e8590c] bg-[#e8590c]/10' : 'border-black/10 bg-black/5'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded-xl p-3">
              <input type="checkbox" checked={form.bruecke.verkehrEinschraenkungNoetig} onChange={e => setBruecke({ verkehrEinschraenkungNoetig: e.target.checked })} />
              Verkehrseinschränkung/-sperrung für Auf-/Abbau nötig (löst Hinweis auf Genehmigung/Verkehrssicherung aus)
            </label>

            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
              ℹ️ Dieses Aufmaß liefert die Geometrie für die Material-/Kostenkalkulation. Die Tragwerksplanung für Hängegerüste
              (Aufhängepunkte, zulässige Lasten am Bauwerk) ist eine eigenständige statische Nachweisführung durch einen
              Fachplaner/Prüfingenieur und wird hier nicht ersetzt.
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={handleWeiter} className="flex-1 bg-[#e8590c] hover:bg-[#d9480f] text-white font-semibold py-3 rounded-xl transition">
              Weiter zu Schritt 3 →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f] p-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={zurueck} className="text-[#86868b] hover:text-[#1d1d1f] text-sm mb-2">← Zurück</button>
        <h1 className="text-3xl font-bold mb-2">🏢 Gebäude & Abmessungen</h1>
        <p className="text-[#86868b] mb-2">Baustelle: Schritt 2 von 6</p>

        {step1Data && (
          <div className="bg-black/5 rounded-xl p-3 mb-6 text-sm text-[#86868b]">
            <span className="text-[#424245] font-medium">{step1Data.name}</span> · {step1Data.adresse}
          </div>
        )}

        <div className="bg-[#f5f5f7] rounded-xl p-6 space-y-6">

          {lidarUebernommen && (
            <div className="rounded-xl bg-purple-900/20 border border-purple-500/30 p-3 text-sm text-purple-300">
              📐 Maße wurden aus dem LiDAR-Scan übernommen – bitte prüfen und bei Bedarf anpassen.
            </div>
          )}

          {grundrissUebernommen && (
            <div className="rounded-xl bg-teal-900/20 border border-teal-500/30 p-3 text-sm text-teal-300">
              📋 Werte wurden aus der KI-Grundriss-Analyse übernommen – bitte prüfen und bei Bedarf anpassen.
            </div>
          )}

          {grundrissUebernommen && hoeheGeschaetzt && (
            <div className="rounded-xl bg-orange-50 border border-[#e8590c]/30 p-3 text-sm text-[#e8590c]">
              ⚠️ Die Höhe wurde aus der Geschosszahl geschätzt (3,00 m pro Geschoss) – Grundrisse enthalten meist keine Höhenangabe. Bitte prüfen und korrigieren.
            </div>
          )}

          {grundrissUebernommen && !form.hoehe && (
            <div className="rounded-xl bg-orange-50 border border-[#e8590c]/30 p-3 text-sm text-[#e8590c]">
              ⚠️ Die Gebäudehöhe fehlt (im Grundriss nicht vermaßt) – bitte manuell eintragen, sie ist Pflicht für die Berechnung.
            </div>
          )}

          {kiUebernommen && (
            <div className="rounded-xl bg-blue-900/20 border border-blue-500/30 p-3 text-sm text-blue-700">
              🔮 Fassade, Dachform und Hindernisse wurden aus der KI-Foto-Analyse vorbefüllt – bitte prüfen, die KI kann sich irren.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-[#424245]">Länge (m) *</label>
              <input type="number" value={form.laenge}
                onChange={(e) => setForm({...form, laenge: e.target.value})}
                className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f]"
                placeholder="z.B. 18" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[#424245]">Höhe (m) *</label>
              <input type="number" value={form.hoehe}
                onChange={(e) => setForm({...form, hoehe: e.target.value})}
                className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f]"
                placeholder="z.B. 10" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[#424245]">Breite (m)</label>
              <input type="number" value={form.breite}
                onChange={(e) => setForm({...form, breite: e.target.value})}
                className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f]"
                placeholder="z.B. 8" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[#424245]">Traufhöhe (m)</label>
              <input type="number" value={form.traufhoehe}
                onChange={(e) => setForm({...form, traufhoehe: e.target.value})}
                className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f]"
                placeholder="z.B. 8.5" />
            </div>
          </div>

          {/* NEU: weitere Abschnitte (unterschiedliche Höhen / ums Eck) */}
          <div className="rounded-xl bg-black/5 border border-black/10 p-4 space-y-3">
            <p className="text-sm font-medium text-[#424245]">
              Gebäude mit mehreren Höhen oder das um eine Ecke geht? Weitere Abschnitte hinzufügen – Länge/Höhe oben ist „Abschnitt 1".
            </p>
            {(form.abschnitte || []).map((a, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                <input value={a.bezeichnung}
                  onChange={(e) => { const neu = [...form.abschnitte]; neu[idx] = { ...neu[idx], bezeichnung: e.target.value }; setForm({ ...form, abschnitte: neu }); }}
                  placeholder={`Bezeichnung Abschnitt ${idx + 2}, z.B. "Anbau links"`}
                  className="bg-black/10 border border-black/10 rounded-xl px-3 py-2 text-sm text-[#1d1d1f]" />
                <input type="number" value={a.laenge}
                  onChange={(e) => { const neu = [...form.abschnitte]; neu[idx] = { ...neu[idx], laenge: e.target.value }; setForm({ ...form, abschnitte: neu }); }}
                  placeholder="Länge m" className="w-24 bg-black/10 border border-black/10 rounded-xl px-3 py-2 text-sm text-[#1d1d1f]" />
                <input type="number" value={a.hoehe}
                  onChange={(e) => { const neu = [...form.abschnitte]; neu[idx] = { ...neu[idx], hoehe: e.target.value }; setForm({ ...form, abschnitte: neu }); }}
                  placeholder="Höhe m" className="w-24 bg-black/10 border border-black/10 rounded-xl px-3 py-2 text-sm text-[#1d1d1f]" />
                <button type="button" onClick={() => setForm({ ...form, abschnitte: form.abschnitte.filter((_, i) => i !== idx) })}
                  className="text-red-600 text-sm px-2">✕</button>
              </div>
            ))}
            <button type="button"
              onClick={() => setForm({ ...form, abschnitte: [...form.abschnitte, { bezeichnung: '', laenge: '', hoehe: '' }] })}
              className="text-sm text-[#e8590c] font-semibold hover:underline">
              + Weiteren Abschnitt hinzufügen
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-[#424245]">Dachform</label>
            <div className="grid grid-cols-3 gap-3">
              {dachformen.map(d => (
                <button key={d} onClick={() => setForm({...form, dachform: d})}
                  className={`p-3 rounded-xl border text-sm transition ${form.dachform === d ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10 text-[#424245]'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-[#424245]">Dachüberstand (m)</label>
            <input type="number" value={form.dachueberstand}
              onChange={(e) => setForm({...form, dachueberstand: e.target.value})}
              className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f]"
              placeholder="z.B. 0.5" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-[#424245]">Fassadenmaterial</label>
            <div className="grid grid-cols-2 gap-3">
              {fassaden.map(f => (
                <button key={f} onClick={() => setForm({...form, fassade: f})}
                  className={`p-3 rounded-xl border text-sm transition ${form.fassade === f ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10 text-[#424245]'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-[#424245]">Hindernisse an der Fassade</label>
            <div className="grid grid-cols-2 gap-3">
              {hindernisListe.map(h => (
                <button key={h} onClick={() => toggleHindernis(h)}
                  className={`p-3 rounded-xl border text-left transition ${form.hindernisse.includes(h) ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10 text-[#424245]'}`}>
                  {h}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <button onClick={() => setForm({...form, garagen: !form.garagen})}
              className={`w-full p-3 rounded-xl border text-left transition flex items-center gap-3 ${form.garagen ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10'}`}>
              <span className="text-xl">🚗</span>
              <div><div className="font-semibold text-sm">Garagen / Nebengebäude vorhanden</div></div>
            </button>

            <button onClick={() => setForm({...form, fluchtwege: !form.fluchtwege})}
              className={`w-full p-3 rounded-xl border text-left transition flex items-center gap-3 ${form.fluchtwege ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10'}`}>
              <span className="text-xl">🚪</span>
              <div><div className="font-semibold text-sm">Fluchtwege beachten</div></div>
            </button>

            <button onClick={() => setForm({...form, werbeanlagen: !form.werbeanlagen})}
              className={`w-full p-3 rounded-xl border text-left transition flex items-center gap-3 ${form.werbeanlagen ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10'}`}>
              <span className="text-xl">📢</span>
              <div><div className="font-semibold text-sm">Werbeanlagen vorhanden</div><div className="text-xs opacity-70">Müssen berücksichtigt werden</div></div>
            </button>

            <button onClick={() => setForm({...form, durchfahrt: !form.durchfahrt})}
              className={`w-full p-3 rounded-xl border text-left transition flex items-center gap-3 ${form.durchfahrt ? 'bg-[#e8590c]/10 border-[#e8590c] text-[#e8590c]' : 'bg-black/10 border-black/10'}`}>
              <span className="text-xl">🛣️</span>
              <div><div className="font-semibold text-sm">Durchfahrt / Eingang freizuhalten</div><div className="text-xs opacity-70">Gitterträger erforderlich</div></div>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-[#424245]">Anzahl Hauseingänge</label>
            <input type="number" value={form.hauseingaenge}
              onChange={(e) => setForm({...form, hauseingaenge: e.target.value})}
              className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f]"
              placeholder="z.B. 2" />
          </div>

          {/* ⭐ KI-WARNUNGEN: Erscheinen automatisch bei relevanten Eingaben */}
          <KIWarnings ruleset={kiResult} />

          <div className="flex gap-3 pt-4">
            <button onClick={zurueck} className="flex-1 bg-black/10 hover:bg-black/15 text-[#1d1d1f] font-semibold py-3 px-4 rounded-xl">← Zurück</button>
            <button onClick={handleWeiter} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-xl">Weiter →</button>
          </div>

          <button onClick={handleDirektAngebot}
            className="w-full bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/50 text-teal-300 font-semibold py-3 px-4 rounded-xl transition">
            ⚡ Direkt zum Angebot (Schritte 3–5 mit Standardwerten)
          </button>

        </div>
      </div>
    </div>
  );
}