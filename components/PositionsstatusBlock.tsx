'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Plus } from 'lucide-react';
import { normalisiereZwischenaufmasse, aktuellerStandJePosition } from '@/lib/zwischenaufmass';
import { normalisiereVereinbarung } from '@/lib/vorhaltung';
import { normalisierePositionsMiete, setzePositionsMiete, bereinigePositionsMiete, mietStandJePosition, type MietModus } from '@/lib/positions-miete';
import {
  baueBereichsStand, fuegeEreignisHinzu, normalisierePositionsEreignisse, EREIGNIS_LABEL,
  type EreignisArt, type BereichsStand,
} from '@/lib/positions-status';

// ============================================================
// SCAFFOLD OS – Positionsstatus je Gerüstbereich (kumuliertes Aufmaß, Schritt 7)
// Je Aufmaßposition (z. B. Dachgerüst, Fassade Nord): Vertrag, Leistungsstand, Abrechnungsstand, noch abrechenbar, Status/Restmenge –
// und die Ereignisse des Abbaus getrennt: Abmeldung durch den Kunden, Freigabe, geplanter und tatsächlicher Abbau (mit Menge,
// Ansprechpartner, Nachweis). Ereignisse sind ein Verlauf (nur anfügen). Sie ändern keine Beträge; abgerechnet wird weiter über das
// Zwischenaufmaß.
// ============================================================

interface Props { project: { id: string; data: any } }

const heute = () => new Date().toLocaleDateString('sv-SE');
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const mg = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
const de = (iso: string) => iso.split('-').reverse().join('.');
const pct = (n: number | null) => (n === null ? '–' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`);
const inputCls = 'w-full px-2 py-1.5 bg-white border border-black/10 rounded-lg text-xs text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]';
const STATUS_TEXT = { steht: 'Steht noch', teilabgebaut: 'Teilweise abgebaut', abgebaut: 'Abgebaut' } as const;
const STATUS_CLS = { steht: 'text-[#1d1d1f]', teilabgebaut: 'text-amber-700', abgebaut: 'text-emerald-700' } as const;

export default function PositionsstatusBlock({ project }: Props) {
  const [daten, setDaten] = useState<any>(project.data);
  const [offenKey, setOffenKey] = useState<string | null>(null);
  const [form, setForm] = useState({ art: 'abbau' as EreignisArt, datum: heute(), menge: '', vollstaendig: false, ansprechpartner: '', nachweis: '', notiz: '' });
  const [laeuft, setLaeuft] = useState(false);
  const [mieteKey, setMieteKey] = useState<string | null>(null);
  const [mForm, setMForm] = useState<{ modus: MietModus; freiTage: string; beginn: string; verweisKey: string }>({ modus: 'baustelle', freiTage: '', beginn: '', verweisKey: '' });
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async () => {
    try {
      const j = await (await fetch(`/api/projects?id=${project.id}`)).json();
      if (j?.success && j.project?.data) setDaten(j.project.data);
      return j?.project?.data ?? null;
    } catch { return null; }
  }, [project.id]);
  useEffect(() => { laden(); }, [laden]);

  const zaListe = useMemo(() => normalisiereZwischenaufmasse(daten?.zwischenaufmasse), [daten]);
  const ereignisse = useMemo(() => normalisierePositionsEreignisse(daten?.positionsEreignisse), [daten]);
  const zeilen: BereichsStand[] = useMemo(() => baueBereichsStand(zaListe, ereignisse, heute()), [zaListe, ereignisse]);
  const aufmassPositionen = useMemo(() => [...aktuellerStandJePosition(zaListe).values()], [zaListe]);
  const regeln = useMemo(() => normalisierePositionsMiete(daten?.positionsMiete), [daten]);
  const mietStaende = useMemo(() => new Map(mietStandJePosition(regeln, aufmassPositionen, normalisiereVereinbarung(daten?.vorhaltung), heute()).map((m) => [m.key, m])), [regeln, aufmassPositionen, daten]);
  if (zeilen.length === 0) return null;

  function oeffneMiete(z: BereichsStand) {
    if (mieteKey === z.key) { setMieteKey(null); return; }
    const r = regeln.find((x) => x.key === z.key);
    setMForm({ modus: r?.modus ?? 'baustelle', freiTage: r?.freiTage !== undefined ? String(r.freiTage) : '', beginn: r?.beginn ?? '', verweisKey: r?.verweisKey ?? '' });
    setMieteKey(z.key); setMeldung(null);
  }

  async function speichereMiete(z: BereichsStand) {
    setLaeuft(true); setMeldung(null);
    try {
      const frisch = (await laden()) ?? daten;
      const za = normalisiereZwischenaufmasse(frisch?.zwischenaufmasse);
      const pos = [...aktuellerStandJePosition(za).values()];
      const tage = mForm.freiTage.trim() === '' ? undefined : Number(mForm.freiTage.replace(',', '.'));
      const r = setzePositionsMiete(bereinigePositionsMiete(normalisierePositionsMiete(frisch?.positionsMiete), pos), pos, {
        key: z.key, modus: mForm.modus, freiTage: tage, beginn: mForm.beginn || undefined, verweisKey: mForm.verweisKey || undefined,
      });
      if (!r.ok) { setMeldung({ ok: false, text: r.fehler }); return; }
      const res = await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: project.id, data: { positionsMiete: r.liste } }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) throw new Error(j.error || 'Speichern fehlgeschlagen');
      await laden(); setMieteKey(null);
      setMeldung({ ok: true, text: `Vorhaltung für „${z.bezeichnung}“ gespeichert.` });
    } catch (e: any) { setMeldung({ ok: false, text: e?.message || 'Fehler beim Speichern' }); }
    finally { setLaeuft(false); }
  }

  function oeffne(z: BereichsStand) {
    setOffenKey(offenKey === z.key ? null : z.key); setMeldung(null);
    setForm({ art: 'abbau', datum: heute(), menge: '', vollstaendig: false, ansprechpartner: '', nachweis: '', notiz: '' });
  }

  async function speichern(z: BereichsStand) {
    setLaeuft(true); setMeldung(null);
    try {
      // immer auf dem frisch geladenen Stand anfügen (gleichzeitige Ereignisse anderer gehen nicht verloren)
      const frisch = (await laden()) ?? daten;
      const r = fuegeEreignisHinzu(
        normalisierePositionsEreignisse(frisch?.positionsEreignisse), normalisiereZwischenaufmasse(frisch?.zwischenaufmasse),
        { key: z.key, art: form.art, datum: form.datum, menge: form.menge.trim() ? Number(form.menge.replace(',', '.')) : undefined, vollstaendig: form.art === 'abbau' && form.vollstaendig, ansprechpartner: form.ansprechpartner, nachweis: form.nachweis, notiz: form.notiz },
        crypto.randomUUID(), heute(),
      );
      if (!r.ok) { setMeldung({ ok: false, text: r.fehler }); return; }
      const res = await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: project.id, data: { positionsEreignisse: r.liste } }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) throw new Error(j.error || 'Speichern fehlgeschlagen');
      await laden(); setOffenKey(null);
      setMeldung({ ok: true, text: `${EREIGNIS_LABEL[form.art]} für „${z.bezeichnung}“ festgehalten.` });
    } catch (e: any) { setMeldung({ ok: false, text: e?.message || 'Fehler beim Speichern' }); }
    finally { setLaeuft(false); }
  }

  const hinweise = zeilen.flatMap((z) => z.hinweise);
  return (
    <div className="rounded-lg border border-black/10 bg-[#fafafa] p-3 space-y-2" data-testid="positionsstatus-block">
      <p className="text-xs font-semibold text-[#1d1d1f] flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-[#e8590c]" /> Positionsstatus (je Gerüstbereich)</p>
      <p className="text-[11px] text-[#86868b]">Je Position: Leistungsstand = aufgemessen im Verhältnis zur vereinbarten Menge, Abrechnungsstand = bereits mit Rechnung abgerechnet. Abgerechnet wird über das Zwischenaufmaß; Abmeldung, Freigabe und Abbau werden hier getrennt festgehalten und ändern keine Beträge.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]" data-testid="positionsstatus-tabelle">
          <thead><tr className="text-left text-[#86868b]">
            <th className="font-normal">Bereich</th><th className="font-normal text-right">Vertrag</th><th className="font-normal text-right">Leistung</th><th className="font-normal text-right">Abgerechnet</th>
            <th className="font-normal text-right pl-3">Noch abrechenbar</th><th className="font-normal pl-3">Status</th><th />
          </tr></thead>
          <tbody>
            {zeilen.map((z) => (
              <Fragment key={z.key}>
                <tr className="border-t border-black/5 align-top" data-testid={`positionsstatus-zeile-${z.bezeichnung}`}>
                  <td className="py-1 pr-2 font-medium text-[#1d1d1f]">{z.bezeichnung}</td>
                  <td className="py-1 text-right">{z.vereinbart > 0 ? `${mg(z.vereinbart)} ${z.einheit}` : '–'}{z.auftragswert !== null ? <span className="block text-[#86868b]">{eur(z.auftragswert)}</span> : null}</td>
                  <td className="py-1 text-right">{pct(z.leistungProzent)}<span className="block text-[#86868b]">{mg(z.leistungM)} {z.einheit}</span></td>
                  <td className="py-1 text-right">{pct(z.abgerechnetProzent)}<span className="block text-[#86868b]">{mg(z.abgerechnetM)} {z.einheit}</span></td>
                  <td className="py-1 text-right">{eur(z.offenAusAufmass)}<span className="block text-[#86868b]">{z.offenZumVertrag !== null ? `bis Vertrag ${eur(z.offenZumVertrag)}` : 'aus Aufmaß'}</span></td>
                  <td className={`py-1 pl-2 ${STATUS_CLS[z.status]}`}>{STATUS_TEXT[z.status]}{z.letzterAbbau ? ` ${de(z.letzterAbbau)}` : ''}
                    <span className="block text-[#86868b]">Rest {mg(z.restM)} {z.einheit}{z.geplanterAbbau && z.status !== 'abgebaut' ? ` · geplant ${de(z.geplanterAbbau)}` : ''}</span></td>
                  <td className="py-1 text-right"><button type="button" onClick={() => oeffne(z)} className="flex items-center gap-1 text-[#e8590c] font-semibold hover:underline whitespace-nowrap" data-testid={`positionsstatus-ereignis-${z.bezeichnung}`}><Plus className="h-3 w-3" /> Ereignis</button></td>
                </tr>
                <tr data-testid={`positionsstatus-miete-${z.bezeichnung}`}><td colSpan={7} className="pb-1 pl-2 text-[11px] text-[#86868b]">
                  Vorhaltung: <span className="text-[#1d1d1f]" data-testid="positionsstatus-miete-text">{mietStaende.get(z.key)?.text ?? '–'}</span>{' '}
                  <button type="button" onClick={() => oeffneMiete(z)} className="text-[#e8590c] font-semibold hover:underline" data-testid={`positionsstatus-miete-aendern-${z.bezeichnung}`}>ändern</button>
                  {mieteKey === z.key && (
                    <div className="mt-1 rounded-lg bg-white border border-black/10 p-2 grid grid-cols-2 sm:grid-cols-4 gap-1 text-[#1d1d1f]" data-testid="positionsstatus-miete-form">
                      <select value={mForm.modus} onChange={(e) => setMForm({ ...mForm, modus: e.target.value as MietModus })} className={inputCls} aria-label="Vorhalte-Regel">
                        <option value="baustelle">Wie Baustelle</option>
                        <option value="eigen">Eigene Vorhaltezeit</option>
                        <option value="keine">Keine Miete (läuft in Hauptposition weiter)</option>
                      </select>
                      {mForm.modus === 'eigen' && (
                        <>
                          <input value={mForm.freiTage} onChange={(e) => setMForm({ ...mForm, freiTage: e.target.value })} inputMode="numeric" placeholder="freie Tage (0 = sofort Miete, 28 = 4 Wochen)" className={inputCls + ' sm:col-span-2'} aria-label="Freie Vorhaltezeit in Tagen" />
                          <input type="date" value={mForm.beginn} onChange={(e) => setMForm({ ...mForm, beginn: e.target.value })} className={inputCls} aria-label="Eigener Beginn (leer = wie Baustelle)" />
                        </>
                      )}
                      {mForm.modus === 'keine' && (
                        <select value={mForm.verweisKey} onChange={(e) => setMForm({ ...mForm, verweisKey: e.target.value })} className={inputCls + ' sm:col-span-2'} aria-label="Hauptposition">
                          <option value="">Hauptposition wählen …</option>
                          {zeilen.filter((x) => x.key !== z.key).map((x) => <option key={x.key} value={x.key}>{x.bezeichnung}</option>)}
                        </select>
                      )}
                      <button type="button" onClick={() => speichereMiete(z)} disabled={laeuft} className="rounded-lg bg-[#e8590c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" data-testid="positionsstatus-miete-speichern">{laeuft ? 'Speichert …' : 'Speichern'}</button>
                    </div>
                  )}
                </td></tr>
                {(z.ereignisse.length > 0 || offenKey === z.key) && (
                  <tr><td colSpan={7} className="pb-2">
                    {z.ereignisse.length > 0 && (
                      <ul className="text-[#86868b] space-y-0.5 pl-2" data-testid={`positionsstatus-verlauf-${z.bezeichnung}`}>
                        {z.ereignisse.map((e) => <li key={e.id}>{de(e.datum)} · {EREIGNIS_LABEL[e.art]}{e.art === 'abbau' ? (e.vollstaendig ? ' (vollständig)' : e.menge ? ` (${mg(e.menge)} ${z.einheit})` : '') : ''}{e.ansprechpartner ? ` · ${e.ansprechpartner}` : ''}{e.nachweis ? ` · Nachweis: ${e.nachweis}` : ''}{e.notiz ? ` · ${e.notiz}` : ''}</li>)}
                      </ul>
                    )}
                    {offenKey === z.key && (
                      <div className="mt-1 rounded-lg bg-white border border-black/10 p-2 grid grid-cols-2 sm:grid-cols-4 gap-1" data-testid="positionsstatus-form">
                        <select value={form.art} onChange={(e) => setForm({ ...form, art: e.target.value as EreignisArt })} className={inputCls} aria-label="Art des Ereignisses">
                          {(Object.keys(EREIGNIS_LABEL) as EreignisArt[]).map((a) => <option key={a} value={a}>{EREIGNIS_LABEL[a]}</option>)}
                        </select>
                        <input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} className={inputCls} aria-label="Datum" />
                        {form.art === 'abbau' && (
                          <>
                            <input value={form.menge} disabled={form.vollstaendig} onChange={(e) => setForm({ ...form, menge: e.target.value })} inputMode="decimal" placeholder={`abgebaut in ${z.einheit}`} className={inputCls} aria-label="Abgebaute Menge" />
                            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={form.vollstaendig} onChange={(e) => setForm({ ...form, vollstaendig: e.target.checked, menge: '' })} /> vollständig abgebaut (Rest {mg(z.restM)} {z.einheit})</label>
                          </>
                        )}
                        <input value={form.ansprechpartner} onChange={(e) => setForm({ ...form, ansprechpartner: e.target.value })} placeholder="Ansprechpartner" className={inputCls} aria-label="Ansprechpartner" />
                        <input value={form.nachweis} onChange={(e) => setForm({ ...form, nachweis: e.target.value })} placeholder="Nachweis (Protokoll-/Foto-Nr.)" className={inputCls} aria-label="Nachweis" />
                        <input value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} placeholder="Notiz" className={inputCls + ' col-span-2'} aria-label="Notiz" />
                        <button type="button" onClick={() => speichern(z)} disabled={laeuft} className="rounded-lg bg-[#e8590c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" data-testid="positionsstatus-speichern">{laeuft ? 'Speichert …' : 'Festhalten'}</button>
                      </div>
                    )}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {hinweise.length > 0 && <ul className="text-[11px] text-[#e8590c] space-y-0.5" data-testid="positionsstatus-hinweise">{hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>}
      {meldung && <p className={`text-[11px] ${meldung.ok ? 'text-emerald-700' : 'text-red-600'}`}>{meldung.ok ? '✅' : '❌'} {meldung.text}</p>}
    </div>
  );
}
