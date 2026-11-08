'use client';

import { useMemo, useState } from 'react';
import { Scale, ArrowRight, AlertTriangle, CheckCircle2, RotateCcw, Info } from 'lucide-react';
import { bewerteEreignis, type Messwert } from '@/lib/gestell-ereignis';
import {
  stueckAusGewicht, wendeBewegungenAn, buchungenFuerAbbau, sollIstVergleich,
  type Bestand, type GestellLadung,
} from '@/lib/gestell-waage';

// ============================================================
// SCAFFOLD OS – Gestell-Waage: Simulator (ohne Hardware, nichts wird gespeichert)
// Zeigt, wie aus dem Gewicht eines Transportgestells Stückzahlen und Buchungen werden:
// Baustelle A → LKW → (Baustelle B | Lager). Die Werte sind Beispielwerte und frei änderbar.
// ============================================================

const ARTIKEL: { id: string; name: string; kg: number }[] = [
  { id: 'belag', name: 'Stahlbelag 3,07 m', kg: 15 },
  { id: 'rahmen', name: 'Vertikalrahmen 2,00 m', kg: 11 },
  { id: 'diagonale', name: 'Diagonale 2,00 m', kg: 4.5 },
];
const ORTE = ['Lager', 'Baustelle A', 'Baustelle B', 'Baustelle C', 'LKW'];
const START: Bestand = {
  Lager: { belag: 400, rahmen: 250, diagonale: 300 },
  'Baustelle A': { belag: 200, rahmen: 60, diagonale: 90 },
  'Baustelle B': { belag: 0, rahmen: 0, diagonale: 0 },
  'Baustelle C': { belag: 0, rahmen: 0, diagonale: 0 },
  LKW: { belag: 0, rahmen: 0, diagonale: 0 },
};

interface GestellEingabe { id: string; name: string; artikelId: string; ziel: string; leerKg: string; bruttoKg: string }

const startGestelle = (): GestellEingabe[] => [
  { id: 'g1', name: 'Gestell 1', artikelId: 'belag', ziel: 'Baustelle B', leerKg: '200', bruttoKg: '500' },
  { id: 'g2', name: 'Gestell 2', artikelId: 'belag', ziel: 'Lager', leerKg: '200', bruttoKg: '2000' },
];

const zahl = (t: string) => { const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const de = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });

export default function GestellSimulatorPage() {
  const [bestand, setBestand] = useState<Bestand>(START);
  const [gestelle, setGestelle] = useState<GestellEingabe[]>(startGestelle());
  const [toleranz, setToleranz] = useState('3');
  const [baustelle, setBaustelle] = useState('Baustelle A');
  const [soll, setSoll] = useState('belag:180');
  const [gebucht, setGebucht] = useState('');
  // Ereignisprüfung (für Gestell 1): Gewicht vorher und die Rahmenbedingungen
  const [vorherKg, setVorherKg] = useState('500');
  const [ruhig, setRuhig] = useState(true);
  const [fahrzeug, setFahrzeug] = useState(true);
  const [standortOk, setStandortOk] = useState(true);
  const [auftragAktiv, setAuftragAktiv] = useState(true);
  const [sollStueck, setSollStueck] = useState('20');

  const tol = zahl(toleranz) >= 0 ? zahl(toleranz) : 0;
  const rechnung = useMemo(() => gestelle.map((g) => {
    const art = ARTIKEL.find((a) => a.id === g.artikelId)!;
    return { g, art, e: stueckAusGewicht(zahl(g.bruttoKg), zahl(g.leerKg), art.kg, tol) };
  }), [gestelle, tol]);

  const ladungen: GestellLadung[] = rechnung.map(({ g, e }) => ({ gestellId: g.id, ziel: g.ziel, artikelId: g.artikelId, stueck: e.stueck }));
  const bewegungen = buchungenFuerAbbau(baustelle, 'LKW', ladungen);
  const probe = wendeBewegungenAn(bestand, bewegungen);
  const sollMap: Record<string, number> = {};
  for (const t of soll.split(/[,;]/)) { const [id, n] = t.split(':').map((x) => x.trim()); if (id && Number(n) > 0) sollMap[id] = Number(n); }
  const vergleich = sollIstVergleich(sollMap, ladungen);
  const unsicher = rechnung.some((r) => r.e.sicherheit !== 'sicher');
  const name = (id: string) => ARTIKEL.find((a) => a.id === id)?.name ?? id;

  const reihe = (kg: number, start: number, ruhigGemessen: boolean): Messwert[] =>
    Array.from({ length: 8 }, (_, i) => ({ t: start + i * 500, kg: kg + (i % 2 ? 0.2 : -0.2) * (ruhigGemessen ? 1 : 40) }));
  const g1 = gestelle[0];
  const g1art = g1 ? ARTIKEL.find((a) => a.id === g1.artikelId) : undefined;
  const ereignis = g1 && g1art ? bewerteEreignis({
    vorher: reihe(zahl(vorherKg) || 0, 0, true),
    nachher: reihe(zahl(g1.bruttoKg) || 0, 60000, ruhig),
    maxSpanneKg: 1,
    toleranzKg: tol,
    gestell: { leerKg: zahl(g1.leerKg) || 0, artikelId: g1.artikelId, stueckKg: g1art.kg },
    fahrzeug: { erkanntId: fahrzeug ? 'lkw1' : null, erwartetId: 'lkw1' },
    standort: { ortId: standortOk ? 'baustelle' : 'woanders', erlaubteOrtIds: ['baustelle'] },
    auftrag: { aktiv: auftragAktiv, richtung: 'entnahme', erlaubteArtikelIds: [g1.artikelId], sollStueck: Number(sollStueck) > 0 ? Number(sollStueck) : null },
  }) : null;
  const EINSTUFUNG = {
    sicher: { text: 'Sicher – Buchungsvorschlag', farbe: 'text-emerald-700' },
    bestaetigung: { text: 'Bestätigung nötig', farbe: 'text-amber-800' },
    abwarten: { text: 'Abwarten – Messung nicht stabil', farbe: 'text-[#5d6873]' },
    kein_ereignis: { text: 'Keine Bewegung (Rauschen der Waage)', farbe: 'text-[#5d6873]' },
  } as const;

  function setze(id: string, teil: Partial<GestellEingabe>) { setGestelle((l) => l.map((g) => (g.id === id ? { ...g, ...teil } : g))); setGebucht(''); }

  function buchen() {
    if (probe.fehler.length) return;
    setBestand(probe.bestand);
    setGebucht(`${bewegungen.length} Buchungen ausgeführt. Der Bestand unten ist aktualisiert.`);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Scale className="h-6 w-6 text-[var(--os-akzent)]" /> Gestell-Waage – Test ohne Hardware</h1>
      <p className="mt-2 max-w-3xl text-[#5d6873] leading-relaxed">
        Tippen Sie das gemessene Gewicht eines Transportgestells ein. SCAFFOLD OS rechnet mit dem Stückgewicht und dem Leergewicht die Stückzahl aus und bucht
        sie von der Baustelle über den LKW an das Ziel des Gestells. Alle Werte sind Beispiele; es wird nichts gespeichert.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3 text-sm">
        <label className="block"><span className="font-medium">Abbau auf</span>
          <select value={baustelle} onChange={(e) => { setBaustelle(e.target.value); setGebucht(''); }} className="mt-1 w-full rounded border border-[var(--os-linie)] bg-white px-3 py-2">
            {ORTE.filter((o) => o.startsWith('Baustelle')).map((o) => <option key={o}>{o}</option>)}
          </select></label>
        <label className="block"><span className="font-medium">Messgenauigkeit der Waage (± kg)</span>
          <input value={toleranz} onChange={(e) => setToleranz(e.target.value)} className="mt-1 w-full rounded border border-[var(--os-linie)] bg-white px-3 py-2" inputMode="decimal" /></label>
        <label className="block"><span className="font-medium">Abbauplan (Soll), z. B. belag:180</span>
          <input value={soll} onChange={(e) => setSoll(e.target.value)} className="mt-1 w-full rounded border border-[var(--os-linie)] bg-white px-3 py-2 font-mono" /></label>
      </div>

      <div className="mt-6 space-y-4">
        {rechnung.map(({ g, art, e }) => (
          <div key={g.id} className="rounded-md border border-[var(--os-linie)] bg-white p-5">
            <div className="flex flex-wrap items-center gap-3">
              <b>{g.name}</b>
              <select value={g.artikelId} onChange={(ev) => setze(g.id, { artikelId: ev.target.value })} className="rounded border border-[var(--os-linie)] px-3 py-1.5 text-sm">
                {ARTIKEL.map((a) => <option key={a.id} value={a.id}>{a.name} ({de(a.kg)} kg)</option>)}
              </select>
              <ArrowRight className="h-4 w-4 text-[#5d6873]" />
              <select value={g.ziel} onChange={(ev) => setze(g.id, { ziel: ev.target.value })} className="rounded border border-[var(--os-linie)] px-3 py-1.5 text-sm">
                {ORTE.filter((o) => o !== 'LKW' && o !== baustelle).map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
              <label className="block">Leergewicht Gestell (kg)<input value={g.leerKg} onChange={(ev) => setze(g.id, { leerKg: ev.target.value })} inputMode="decimal" className="mt-1 w-full rounded border border-[var(--os-linie)] px-3 py-2" /></label>
              <label className="block">Gemessen mit Ladung (kg)<input value={g.bruttoKg} onChange={(ev) => setze(g.id, { bruttoKg: ev.target.value })} inputMode="decimal" className="mt-1 w-full rounded border border-[var(--os-linie)] px-3 py-2" /></label>
              <div className="rounded bg-[#f6f7f9] px-4 py-2">
                <p className="text-xs uppercase tracking-wide text-[#5d6873]">Ergebnis</p>
                <p className="text-2xl font-semibold">{e.sicherheit === 'unmoeglich' ? '–' : `${e.stueck} Stück`}</p>
              </div>
            </div>
            <p className={`mt-3 flex items-start gap-2 text-sm ${e.sicherheit === 'sicher' ? 'text-emerald-700' : 'text-amber-800'}`}>
              {e.sicherheit === 'sicher' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
              {e.sicherheit === 'sicher' ? `Eindeutig: netto ${de(e.nettoKg)} kg, Abweichung ${de(e.abweichungKg)} kg.` : e.hinweis}
            </p>
            <p className="mt-1 text-xs text-[#5d6873]">{art.name}: {de(art.kg)} kg je Stück (Annahme – im Echtbetrieb aus dem Lager)</p>
          </div>
        ))}
        <button onClick={() => setGestelle((l) => [...l, { id: `g${Date.now()}`, name: `Gestell ${l.length + 1}`, artikelId: 'belag', ziel: 'Lager', leerKg: '200', bruttoKg: '200' }])}
          className="rounded border border-[var(--os-linie)] bg-white px-4 py-2 text-sm font-semibold hover:bg-[#eef0f3]">+ Gestell hinzufügen</button>
      </div>

      {ereignis && (
        <div className="mt-8 rounded-md border border-[var(--os-linie)] bg-white p-5">
          <h2 className="font-semibold">Ereignisprüfung für Gestell 1</h2>
          <p className="mt-1 text-sm text-[#5d6873]">Eine Gewichtsänderung wird nie blind gebucht. Gewicht „vorher“ gegen das gemessene Gewicht oben, dazu die Rahmenbedingungen:</p>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <label className="block">Gewicht vorher (kg)<input value={vorherKg} onChange={(e) => setVorherKg(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded border border-[var(--os-linie)] px-3 py-2" /></label>
            <label className="block">Geplante Menge laut Auftrag<input value={sollStueck} onChange={(e) => setSollStueck(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded border border-[var(--os-linie)] px-3 py-2" /></label>
            <div className="space-y-1.5 pt-1">
              <label className="flex items-center gap-2"><input type="checkbox" checked={ruhig} onChange={(e) => setRuhig(e.target.checked)} /> Waage ruhig nach der Änderung</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={fahrzeug} onChange={(e) => setFahrzeug(e.target.checked)} /> Richtiger LKW erkannt</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={standortOk} onChange={(e) => setStandortOk(e.target.checked)} /> Standort passt zum Auftrag</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={auftragAktiv} onChange={(e) => setAuftragAktiv(e.target.checked)} /> Transportauftrag aktiv</label>
            </div>
          </div>
          <p className={`mt-4 font-semibold ${EINSTUFUNG[ereignis.einstufung].farbe}`}>{EINSTUFUNG[ereignis.einstufung].text}{ereignis.stueck > 0 && ` – ${ereignis.stueck} Stück ${ereignis.richtung === 'entnahme' ? 'entnommen' : 'dazugekommen'}`}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {ereignis.pruefungen.map((x) => (
              <li key={x.name} className="flex gap-2">{x.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />}<span><b>{x.name}:</b> {x.text}</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-[var(--os-linie)] bg-white p-5">
          <h2 className="font-semibold">Abgleich mit dem Abbauplan</h2>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left"><th className="py-1">Artikel</th><th>Soll</th><th>Gewogen</th><th>Differenz</th></tr></thead>
            <tbody>{vergleich.map((v) => (
              <tr key={v.artikelId} className="border-t border-[var(--os-linie)]"><td className="py-1.5">{name(v.artikelId)}</td><td>{v.soll}</td><td>{v.ist}</td>
                <td className={v.differenz === 0 ? 'text-emerald-700' : 'text-amber-800 font-semibold'}>{v.differenz > 0 ? '+' : ''}{v.differenz}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="rounded-md border border-[var(--os-linie)] bg-white p-5">
          <h2 className="font-semibold">Buchungsvorschlag</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {bewegungen.length === 0 && <li className="text-[#5d6873]">Noch keine Menge.</li>}
            {bewegungen.map((b, i) => <li key={i}>{b.stueck} × {name(b.artikelId)}: {b.von} → {b.nach}</li>)}
          </ul>
          {probe.fehler.map((f, i) => <p key={i} className="mt-2 text-sm text-red-700">{f.text}</p>)}
          {unsicher && <p className="mt-2 flex gap-2 text-sm text-amber-800"><Info className="mt-0.5 h-4 w-4 shrink-0" /> Mindestens ein Gestell ist unsicher. Bitte vor dem Buchen kontrollieren.</p>}
          <div className="mt-4 flex gap-3">
            <button onClick={buchen} disabled={bewegungen.length === 0 || probe.fehler.length > 0}
              className="rounded bg-[var(--os-akzent)] px-5 py-2.5 text-sm font-semibold text-[#171b20] hover:bg-[#d9661f] disabled:opacity-40">Bestätigen und buchen</button>
            <button onClick={() => { setBestand(START); setGestelle(startGestelle()); setGebucht(''); }} className="inline-flex items-center gap-2 rounded border border-[var(--os-linie)] px-4 py-2.5 text-sm font-semibold hover:bg-[#eef0f3]"><RotateCcw className="h-4 w-4" /> Zurücksetzen</button>
          </div>
          {gebucht && <p className="mt-3 text-sm text-emerald-700">{gebucht}</p>}
        </div>
      </div>

      <div className="mt-8 overflow-x-auto rounded-md border border-[var(--os-linie)] bg-white">
        <table className="w-full text-sm">
          <thead><tr className="text-left"><th className="px-4 py-3">Bestand (Stück)</th>{ORTE.map((o) => <th key={o} className="px-4 py-3">{o}</th>)}</tr></thead>
          <tbody>{ARTIKEL.map((a) => (
            <tr key={a.id} className="border-t border-[var(--os-linie)]"><td className="px-4 py-2.5">{a.name}</td>{ORTE.map((o) => <td key={o} className="px-4 py-2.5">{bestand[o]?.[a.id] ?? 0}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
