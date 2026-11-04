'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, CalendarRange } from 'lucide-react';
import { parseBetrag } from '@/lib/nachtrag';
import { abschnitteAusSchritt2, berechneAufmass } from '@/lib/aufmassblatt-pdf';
import { BAUPHASEN_STANDARD, berechneBauphasen, normalisiereBauphasen, type Bauphase, type BauphasenEinstellung } from '@/lib/bauphasen';

// ============================================================
// SCAFFOLD OS – Bauphasen (Kundenseite, beim Auftrag)
// Aufbau-/Abbau-Termine, Teilrückbau, Kostenaufteilung (z. B. 65 % Aufbau), Lager und Personal.
// Alles wird von Hand eingestellt; Beträge, Material je Datum und Personal je Tag werden daraus berechnet.
// Gespeichert in projects.data.bauphasen (bestehende PATCH-Route, kein SQL).
// ============================================================

interface MatZeile { articleNumber?: string | null; name?: string; quantity?: number; unit?: string }
interface BauData { bauphasen?: { einstellung?: Partial<BauphasenEinstellung>; phasen?: unknown }; step2?: Parameters<typeof abschnitteAusSchritt2>[0]; kiResult?: { materialList?: MatZeile[] } }
interface Props { project: { id: string; name: string | null; adresse: string | null; data: BauData | null } }

const heute = () => new Date().toLocaleDateString('sv-SE');
const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const datumDe = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE'); };
const inputCls = 'w-full px-2 py-1.5 bg-white border border-black/10 rounded-lg text-xs text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]';
const zahl = (v: string): number | undefined => { if (v.trim() === '') return undefined; const n = parseBetrag(v); return Number.isFinite(n) ? n : undefined; };
const neueId = () => `bp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Einst = Omit<BauphasenEinstellung, 'material'>;

export default function BauphasenBlock({ project }: Props) {
  const gespeichert = project.data?.bauphasen;
  const gesamtAufmass = useMemo(() => berechneAufmass(abschnitteAusSchritt2(project.data?.step2)).gesamtM2, [project.data]);
  const material = useMemo(() => {
    const liste = project.data?.kiResult?.materialList ?? [];
    return liste.filter((m) => m && Number(m.quantity) > 0).map((m) => ({ artikel: String(m.articleNumber || m.name), name: String(m.name), menge: Number(m.quantity), einheit: String(m.unit || 'Stk') }));
  }, [project.data]);

  const [einst, setEinst] = useState<Einst>(() => ({
    gesamtFlaecheM2: gespeichert?.einstellung?.gesamtFlaecheM2 ?? gesamtAufmass ?? 0,
    preisJeM2: gespeichert?.einstellung?.preisJeM2 ?? 0,
    aufbauAnteilProzent: gespeichert?.einstellung?.aufbauAnteilProzent ?? BAUPHASEN_STANDARD.aufbauAnteilProzent,
    aufbauStundenGesamt: gespeichert?.einstellung?.aufbauStundenGesamt ?? 0,
    abbauStundenGesamt: gespeichert?.einstellung?.abbauStundenGesamt ?? 0,
    standardPersonen: gespeichert?.einstellung?.standardPersonen ?? BAUPHASEN_STANDARD.standardPersonen,
    stundenJeTag: gespeichert?.einstellung?.stundenJeTag ?? BAUPHASEN_STANDARD.stundenJeTag,
  }));
  const [phasen, setPhasen] = useState<Bauphase[]>(() => normalisiereBauphasen(gespeichert?.phasen));
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const erg = useMemo(() => berechneBauphasen(phasen, { ...einst, material }), [phasen, einst, material]);
  const setE = (k: keyof Einst, v: string) => setEinst((e) => ({ ...e, [k]: zahl(v) ?? 0 }));
  const setP = (id: string, patch: Partial<Bauphase>) => setPhasen((l) => l.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  async function speichern() {
    setLaeuft(true); setMeldung(null);
    try {
      const res = await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: project.id, data: { bauphasen: { einstellung: einst, phasen } } }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) throw new Error(j.error || 'Speichern fehlgeschlagen');
      setMeldung({ ok: true, text: 'Gespeichert.' });
    } catch (e) { setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Fehler' }); } finally { setLaeuft(false); }
  }

  const feld = (label: string, wert: number, k: keyof Einst, einheit?: string) => (
    <div><label className='block text-[11px] text-[#86868b] mb-1'>{label}{einheit ? ` (${einheit})` : ''}</label>
      <input className={inputCls} inputMode='decimal' value={wert ? String(wert).replace('.', ',') : ''} onChange={(e) => setE(k, e.target.value)} /></div>
  );

  return (
    <div className='border-t border-black/5 pt-3'>
      <button type='button' onClick={() => setOffen((o) => !o)} className='text-xs font-semibold text-[#1d1d1f] flex items-center gap-1.5'>
        <CalendarRange className='h-3.5 w-3.5 text-[#e8590c]' /> Bauphasen: Aufbau, Abbau, Teilrückbau {phasen.length ? `(${phasen.length})` : ''} {offen ? '▲' : '▼'}
      </button>
      {offen && (
        <div className='mt-2 space-y-3'>
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-2'>
            {feld('Gesamtfläche', einst.gesamtFlaecheM2, 'gesamtFlaecheM2', 'm²')}
            {feld('Preis Montage + Demontage', einst.preisJeM2, 'preisJeM2', '€/m²')}
            {feld('Anteil Aufbau', einst.aufbauAnteilProzent, 'aufbauAnteilProzent', '%')}
            {feld('Personen je Phase', einst.standardPersonen, 'standardPersonen')}
            {feld('Stunden Aufbau gesamt', einst.aufbauStundenGesamt, 'aufbauStundenGesamt', 'h')}
            {feld('Stunden Abbau gesamt', einst.abbauStundenGesamt, 'abbauStundenGesamt', 'h')}
            {feld('Stunden je Person/Tag', einst.stundenJeTag, 'stundenJeTag', 'h')}
          </div>
          <p className='text-[10px] text-[#86868b]'>Abbau-Anteil = 100 % − Aufbau-Anteil ({100 - einst.aufbauAnteilProzent} %). Material: {material.length ? `${material.length} Positionen aus der Stückliste` : 'keine Stückliste im Auftrag – Lagerplanung entfällt'}.</p>

          <div className='space-y-1.5'>
            {phasen.map((p) => {
              const r = erg.phasen.find((x) => x.id === p.id);
              return (
                <div key={p.id} className='rounded-lg border border-black/10 p-2 space-y-1.5'>
                  <div className='grid grid-cols-2 sm:grid-cols-6 gap-1.5 items-end'>
                    <div><label className='block text-[11px] text-[#86868b] mb-1'>Art</label>
                      <select className={inputCls} value={p.art} onChange={(e) => setP(p.id, { art: e.target.value as 'aufbau' | 'abbau' })}><option value='aufbau'>Aufbau</option><option value='abbau'>Abbau / Teilrückbau</option></select></div>
                    <div><label className='block text-[11px] text-[#86868b] mb-1'>Beginn</label><input type='date' className={inputCls} value={p.datum} onChange={(e) => setP(p.id, { datum: e.target.value })} /></div>
                    <div><label className='block text-[11px] text-[#86868b] mb-1'>Menge (m²)</label><input className={inputCls} inputMode='decimal' value={p.flaecheM2 ? String(p.flaecheM2).replace('.', ',') : ''} onChange={(e) => setP(p.id, { flaecheM2: zahl(e.target.value) ?? 0 })} /></div>
                    <div><label className='block text-[11px] text-[#86868b] mb-1'>Tage (leer = berechnet)</label><input className={inputCls} inputMode='numeric' value={p.tageManuell ?? ''} onChange={(e) => setP(p.id, { tageManuell: zahl(e.target.value) })} /></div>
                    <div><label className='block text-[11px] text-[#86868b] mb-1'>Personen</label><input className={inputCls} inputMode='numeric' value={p.personen ?? ''} placeholder={String(einst.standardPersonen)} onChange={(e) => setP(p.id, { personen: zahl(e.target.value) })} /></div>
                    <div className='flex justify-end'><button type='button' aria-label='Phase entfernen' disabled={!!p.rechnungId} title={p.rechnungId ? 'Schon abgerechnet' : undefined} onClick={() => setPhasen((l) => l.filter((x) => x.id !== p.id))} className='px-2 py-1.5 text-[#86868b] hover:text-red-600 disabled:opacity-30'><Trash2 className='h-3.5 w-3.5' /></button></div>
                  </div>
                  <div className='grid grid-cols-2 gap-1.5'>
                    <div><label className='block text-[11px] text-[#86868b] mb-1'>Anteil am Preis in % (leer = {p.art === 'aufbau' ? einst.aufbauAnteilProzent : 100 - einst.aufbauAnteilProzent})</label><input className={inputCls} inputMode='decimal' value={p.anteilProzentManuell ?? ''} onChange={(e) => setP(p.id, { anteilProzentManuell: zahl(e.target.value) })} /></div>
                    <div><label className='block text-[11px] text-[#86868b] mb-1'>Fester Betrag € (leer = berechnet)</label><input className={inputCls} inputMode='decimal' value={p.betragManuell ?? ''} onChange={(e) => setP(p.id, { betragManuell: zahl(e.target.value) })} /></div>
                  </div>
                  {r && <p className='text-[11px] text-[#424245]'>{p.rechnungId && <span className='mr-1 rounded bg-green-100 px-1 text-green-800'>abgerechnet {p.rechnungNr}</span>}<b>{fmt(r.betrag)} €</b> netto · {r.stunden ? `${fmt(r.stunden)} h, ` : ''}{r.tage ? `${r.tage} Arbeitstage ab ${datumDe(r.datum)} mit ${r.personen} Pers.` : 'keine Dauer (Stunden oder Tage eingeben)'}</p>}
                </div>
              );
            })}
            <button type='button' onClick={() => setPhasen((l) => [...l, { id: neueId(), art: l.some((x) => x.art === 'aufbau') ? 'abbau' : 'aufbau', datum: heute(), flaecheM2: 0 }])} className='text-xs font-semibold text-[#e8590c] hover:underline flex items-center gap-1'><Plus className='h-3 w-3' /> Phase hinzufügen</button>
          </div>

          {phasen.length > 0 && (
            <div className='rounded-lg bg-[#f5f5f7] p-2 text-[11px] text-[#424245] space-y-1'>
              <p><b>Kosten:</b> Aufbau {fmt(erg.summeAufbau)} € · Abbau {fmt(erg.summeAbbau)} € · Summe {fmt(erg.summeBetrag)} € (Soll {fmt(erg.sollBetrag)} €)</p>
              {erg.bestand.length > 0 && <p><b>Gerüst steht:</b> {erg.bestand.map((b) => `${datumDe(b.datum)}: ${fmt(b.stehendM2)} m²`).join(' → ')}</p>}
              {erg.personal.length > 0 && <p><b>Personal:</b> {erg.personal.length} Einsatztage, höchstens {Math.max(...erg.personal.map((t) => t.koepfe))} Pers. gleichzeitig ({datumDe(erg.personal[0].datum)} bis {datumDe(erg.personal[erg.personal.length - 1].datum)})</p>}
              {erg.lager.length > 0 && <p><b>Lager (draußen nach letzter Phase):</b> {(() => { const l = erg.lager.filter((x) => x.datum === erg.lager[erg.lager.length - 1].datum); return `${l.length} Artikel, ${l.filter((x) => x.draussen > 0).length} noch auf der Baustelle`; })()}</p>}
              {erg.warnungen.map((w, i) => <p key={i} className='text-red-600'>⚠ {w}</p>)}
              <details><summary className='cursor-pointer text-[#86868b]'>So wird gerechnet</summary><ul className='list-disc pl-4 mt-1'>{erg.annahmen.map((a, i) => <li key={i}>{a}</li>)}</ul></details>
            </div>
          )}
          <div className='flex items-center gap-2'>
            <button type='button' disabled={laeuft} onClick={speichern} className='px-3 py-1.5 rounded-lg bg-[#1d1d1f] text-white text-xs font-semibold disabled:opacity-50'>{laeuft ? 'Speichert …' : 'Bauphasen speichern'}</button>
            {meldung && <span className={`text-xs ${meldung.ok ? 'text-green-700' : 'text-red-600'}`}>{meldung.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
