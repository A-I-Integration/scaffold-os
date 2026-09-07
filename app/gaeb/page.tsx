'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, Download, ArrowRight } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – GAEB-Ausschreibungen bepreisen (Phase 40, MVP)
//
// Weg: X83 hochladen → Positionen lesen (mit Preis-Vorschlag bei
// erkennbaren Gerüstbau-Standardformulierungen, sonst manuell) →
// Kunde zuordnen → als Projekt/Angebot anlegen (landet in der
// gewohnten Kunden-Detail-Seite, "Angebot öffnen" führt zu Aufmaß
// Schritt 6 – von dort aus funktioniert alles Weitere, was es schon
// gibt: Rechnung erstellen, Freigabe-Pflicht, E-Rechnung usw.) UND/
// ODER als X84-Datei zurückexportieren.
//
// Automatische Preisvorschläge sind bewusst konservativ (nur bei
// eindeutig erkennbaren Mustern wie "Lastklasse"/"Höhe bis X m" bei
// m²-Positionen) – alles andere bleibt manuell einzutragen, statt
// falsch zu raten.
// ============================================================

interface Position {
  oz: string;
  menge: number;
  einheit: string;
  text: string;
  einzelpreis: number | null;
  vorschlagQuelle: 'muster' | null;
}

export default function GaebPage() {
  const router = useRouter();
  const [xml, setXml] = useState<string | null>(null);
  const [dateiname, setDateiname] = useState('');
  const [positionen, setPositionen] = useState<Position[]>([]);
  const [ladeFehler, setLadeFehler] = useState('');
  const [laedt, setLaedt] = useState(false);

  const [kundenListe, setKundenListe] = useState<{ id: string; name: string; street?: string; zip?: string; city?: string }[]>([]);
  const [kundenSuche, setKundenSuche] = useState('');
  const [ausgewaehlterKunde, setAusgewaehlterKunde] = useState<{ id: string; name: string } | null>(null);
  const [zeigeDropdown, setZeigeDropdown] = useState(false);
  const [neuerKundeLaeuft, setNeuerKundeLaeuft] = useState(false);
  const [projektName, setProjektName] = useState('');
  const [anlegenLaeuft, setAnlegenLaeuft] = useState(false);

  useEffect(() => {
    fetch('/api/kunden').then((r) => r.json()).then((j) => { if (j.success) setKundenListe(j.kunden || []); }).catch(() => {});
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLadeFehler('');
    setLaedt(true);
    try {
      const text = await file.text();
      const res = await fetch('/api/gaeb/parse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml: text }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setXml(text);
      setDateiname(file.name);
      setPositionen(json.positionen);
      setProjektName(file.name.replace(/\.(x83|d83|xml)$/i, ''));
    } catch (err: any) {
      setLadeFehler(err.message);
    }
    setLaedt(false);
    e.target.value = '';
  }

  function updatePreis(idx: number, wert: string) {
    const neu = [...positionen];
    neu[idx] = { ...neu[idx], einzelpreis: wert === '' ? null : Number(wert.replace(',', '.')) };
    setPositionen(neu);
  }

  const gesamtsumme = positionen.reduce((s, p) => s + (p.einzelpreis || 0) * p.menge, 0);
  const unbepreisteAnzahl = positionen.filter((p) => p.einzelpreis == null).length;

  async function handleExportX84() {
    if (!xml) return;
    // FIX: nach Reihenfolge zuordnen (siehe buildGaebX84), nicht mehr nach OZ.
    const preise = positionen.map((p) => p.einzelpreis);
    const res = await fetch('/api/gaeb/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml, preise }),
    });
    const json = await res.json();
    if (!json.success) { alert('❌ ' + json.error); return; }
    const blob = new Blob([json.x84], { type: 'application/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = dateiname.replace(/\.(x83|d83)$/i, '') + '.x84';
    a.click();
  }

  async function legeAnAlsKunde(name: string) {
    setNeuerKundeLaeuft(true);
    try {
      const res = await fetch('/api/kunden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setKundenListe((prev) => [...prev, json.kunde]);
      setAusgewaehlterKunde({ id: json.kunde.id, name: json.kunde.name });
      setKundenSuche(json.kunde.name);
    } catch (e: any) { alert('❌ ' + e.message); }
    setNeuerKundeLaeuft(false);
  }

  async function handleProjektAnlegen() {
    if (!ausgewaehlterKunde) { alert('Bitte zuerst einen Kunden zuordnen.'); return; }
    if (unbepreisteAnzahl > 0 && !confirm(`${unbepreisteAnzahl} Position(en) haben noch keinen Preis. Trotzdem als Angebot anlegen?`)) return;

    setAnlegenLaeuft(true);
    try {
      const materialList = positionen.map((p) => ({
        articleNumber: p.oz, name: p.text, category: 'GAEB-Position',
        quantity: p.menge, unit: p.einheit, unitPrice: p.einzelpreis || 0,
        totalPrice: Math.round((p.einzelpreis || 0) * p.menge * 100) / 100,
        weightKg: 0, riskLevel: 'low' as const, aiRecommendation: p.vorschlagQuelle === 'muster' ? 'Preisvorschlag automatisch aus Musteranalyse – bitte geprüft.' : '',
      }));
      const gesamtflaeche = positionen.filter((p) => /m2|m²|qm/i.test(p.einheit)).reduce((s, p) => s + p.menge, 0);

      const kiResult = {
        materialList, totalMaterialCost: Math.round(gesamtsumme * 100) / 100, totalWeightKg: 0,
        estimatedLaborHours: 0, laborCost: 0, transportCost: 0,
        totalCost: Math.round(gesamtsumme * 100) / 100, suggestedPrice: Math.round(gesamtsumme * 100) / 100,
        margin: 0, marginPercent: 0, riskLevel: 'green' as const,
        warnings: [`Aus GAEB-Ausschreibung „${dateiname}" importiert. Preise wurden automatisch vorgeschlagen (Musteranalyse) oder manuell eingetragen – bitte vor Versand nochmal vollständig prüfen.`],
        tips: [], scaffoldClass: 'GAEB-Ausschreibung', requiredAnchorCount: 0, requiredLoadDistributionPlates: 0,
        totalAreaM2: gesamtflaeche || undefined,
      };

      const res = await fetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projektName || dateiname, adresse: '', customer_id: ausgewaehlterKunde.id,
          data: {
            step1: { name: ausgewaehlterKunde.name, adresse: '', gewerke: ['allgemein'], dauer: '30' },
            kiResult, angebotsStatus: 'erstellt',
            gaeb: { dateiname, quelle_xml: xml },
          },
          status: 'active',
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      router.push(`/kunden/${ausgewaehlterKunde.id}`);
    } catch (err: any) { alert('❌ ' + err.message); }
    setAnlegenLaeuft(false);
  }

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f] p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">📄 GAEB-Ausschreibung bepreisen</h1>
        <p className="text-[#86868b] mb-6">Leistungsverzeichnis (X83) hochladen, Positionen bepreisen, als Angebot anlegen und/oder als X84 zurückexportieren.</p>

        <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 mb-6 text-xs text-blue-800">
          ℹ️ Automatische Preisvorschläge erscheinen nur bei eindeutig erkennbaren Gerüstbau-Formulierungen
          (z.B. „Gerüst … Lastklasse … bis X m Höhe" bei m²-Positionen), berechnet mit eurer bestehenden
          Kalkulations-Engine. Alles andere bleibt bewusst leer – bitte manuell prüfen/eintragen, bevor ihr das
          Angebot abschickt.
        </div>

        {!xml ? (
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-black/10 rounded-2xl p-12 cursor-pointer hover:bg-black/5 transition">
            <Upload className="h-8 w-8 text-[#86868b]" />
            <span className="font-medium">GAEB-Datei auswählen (.x83, .d83, .xml)</span>
            <span className="text-xs text-[#86868b]">{laedt ? 'Wird gelesen…' : 'Klicken oder Datei hierher ziehen'}</span>
            <input type="file" accept=".x83,.d83,.xml" className="hidden" onChange={handleUpload} disabled={laedt} />
          </label>
        ) : (
          <>
            <div className="flex items-center justify-between bg-[#f5f5f7] rounded-xl p-3 mb-4">
              <span className="flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4" /> {dateiname} · {positionen.length} Positionen</span>
              <button onClick={() => { setXml(null); setPositionen([]); }} className="text-xs text-[#86868b] hover:underline">Andere Datei wählen</button>
            </div>

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[#86868b] border-b border-black/10">
                    <th className="py-2 pr-2">OZ</th>
                    <th className="py-2 pr-2">Beschreibung</th>
                    <th className="py-2 pr-2 text-right">Menge</th>
                    <th className="py-2 pr-2">Einh.</th>
                    <th className="py-2 pr-2 text-right">Einzelpreis (€)</th>
                    <th className="py-2 pr-2 text-right">Gesamt (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {positionen.map((p, idx) => (
                    <tr key={p.oz + idx} className="border-b border-black/5">
                      <td className="py-2 pr-2 text-xs text-[#86868b]">{p.oz}</td>
                      <td className="py-2 pr-2 max-w-md">{p.text}</td>
                      <td className="py-2 pr-2 text-right">{p.menge.toLocaleString('de-DE')}</td>
                      <td className="py-2 pr-2 text-xs">{p.einheit}</td>
                      <td className="py-2 pr-2">
                        <input
                          value={p.einzelpreis ?? ''}
                          onChange={(e) => updatePreis(idx, e.target.value)}
                          placeholder="—"
                          className={`w-24 text-right px-2 py-1 rounded-lg border text-sm ${p.vorschlagQuelle === 'muster' && p.einzelpreis != null ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-black/10'}`}
                        />
                        {p.vorschlagQuelle === 'muster' && <div className="text-[9px] text-emerald-700 text-right">Vorschlag</div>}
                      </td>
                      <td className="py-2 pr-2 text-right font-medium">{p.einzelpreis != null ? ((p.einzelpreis * p.menge).toLocaleString('de-DE', { minimumFractionDigits: 2 })) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between bg-[#f5f5f7] rounded-xl p-4 mb-6">
              <span className="text-sm text-[#86868b]">{unbepreisteAnzahl > 0 ? `⚠️ ${unbepreisteAnzahl} Position(en) noch ohne Preis` : '✅ Alle Positionen bepreist'}</span>
              <span className="text-lg font-bold">Gesamtsumme: {gesamtsumme.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span>
            </div>

            <div className="rounded-xl border border-black/10 p-4 mb-4 space-y-2">
              <h3 className="text-sm font-semibold">Kunde zuordnen</h3>
              <div className="relative">
                <input
                  value={kundenSuche}
                  onChange={(e) => { setKundenSuche(e.target.value); setAusgewaehlterKunde(null); setZeigeDropdown(true); }}
                  onFocus={() => setZeigeDropdown(true)}
                  onBlur={() => setTimeout(() => setZeigeDropdown(false), 150)}
                  placeholder="Kundenname eingeben oder auswählen"
                  className="w-full px-3 py-2 border border-black/10 rounded-xl text-sm"
                />
                {ausgewaehlterKunde && <span className="absolute right-3 top-2.5 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/40">✓ ausgewählt</span>}
                {zeigeDropdown && kundenSuche.trim().length >= 2 && !ausgewaehlterKunde && (() => {
                  const treffer = kundenListe.filter((k) => k.name.toLowerCase().includes(kundenSuche.trim().toLowerCase())).slice(0, 6);
                  return (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-black/10 rounded-xl shadow-lg overflow-hidden">
                      {treffer.map((k) => (
                        <button key={k.id} type="button" onMouseDown={() => { setAusgewaehlterKunde({ id: k.id, name: k.name }); setKundenSuche(k.name); }} className="w-full text-left px-3 py-2 text-sm hover:bg-[#f5f5f7] border-t border-black/5 first:border-t-0">
                          {k.name}{k.city && <span className="text-[#86868b]"> · {k.city}</span>}
                        </button>
                      ))}
                      {treffer.length === 0 && (
                        <button type="button" onMouseDown={() => legeAnAlsKunde(kundenSuche.trim())} disabled={neuerKundeLaeuft} className="w-full text-left px-3 py-2 text-sm text-[#e8590c] font-semibold hover:bg-[#f5f5f7]">
                          {neuerKundeLaeuft ? 'Wird angelegt…' : `+ „${kundenSuche.trim()}" als neuen Kunden anlegen`}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={handleProjektAnlegen} disabled={anlegenLaeuft || !ausgewaehlterKunde} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 text-white text-sm font-semibold">
                {anlegenLaeuft ? 'Wird angelegt…' : <>Als Angebot anlegen <ArrowRight className="h-4 w-4" /></>}
              </button>
              <button onClick={handleExportX84} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-black/5 hover:bg-black/10 text-sm font-medium">
                <Download className="h-4 w-4" /> Als X84 exportieren
              </button>
            </div>
          </>
        )}

        {ladeFehler && <p className="text-sm text-red-600 mt-3">❌ {ladeFehler}</p>}
      </div>
    </div>
  );
}
