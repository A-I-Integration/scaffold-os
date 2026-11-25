'use client';

import { useEffect, useMemo, useState } from 'react';
import { berechnePfaendung, geltendeImMonat, type Grenze, type PfaendungEintrag } from '@/lib/pfaendung';
import { ladeExcel } from '@/lib/excel-liste';

// ============================================================
// SCAFFOLD OS – Pfändung und Monatsübersicht der Zulagen (Reiter „Lohn & Konditionen“, nur Chef)
// ============================================================

const inputCls = 'w-full rounded-lg bg-[#f5f5f7] border border-black/10 px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#86868b] focus:border-[#e8590c] focus:outline-none';
const kasten = 'bg-white border border-black/5 rounded-2xl p-5 space-y-3';
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const de = (iso: string) => iso.split('-').reverse().join('.');
const heute = () => new Date().toLocaleDateString('sv-SE');

export interface PfaendungDaten extends PfaendungEintrag { notiz?: string | null }
export interface PfaendungMonatDaten { monat: string; netto: number | string; betrag_manuell: number | string | null; begruendung: string | null }

export function PfaendungBlock({ pfaendungen, monate, grenzen, laeuft, senden, loeschen }: {
  pfaendungen: PfaendungDaten[]; monate: PfaendungMonatDaten[]; grenzen: Grenze[]; laeuft: boolean;
  senden: (body: Record<string, unknown>, okText: string) => Promise<boolean>;
  loeschen: (typ: 'pfaendung', id: string) => Promise<void>;
}) {
  const [gl, setGl] = useState(''); const [az, setAz] = useState(''); const [rang, setRang] = useState('1'); const [up, setUp] = useState('0');
  const [ab, setAb] = useState(heute()); const [bis, setBis] = useState(''); const [ford, setFord] = useState(''); const [pNotiz, setPNotiz] = useState('');
  const [monat, setMonat] = useState(heute().slice(0, 7)); const [netto, setNetto] = useState(''); const [manuell, setManuell] = useState(''); const [begr, setBegr] = useState('');

  const gespeichert = monate.find(m => m.monat === monat);
  useEffect(() => { setNetto(gespeichert ? String(gespeichert.netto).replace('.', ',') : ''); setManuell(gespeichert?.betrag_manuell != null ? String(gespeichert.betrag_manuell).replace('.', ',') : ''); setBegr(gespeichert?.begruendung || ''); }, [monat, gespeichert?.netto, gespeichert?.betrag_manuell, gespeichert?.begruendung]); // eslint-disable-line react-hooks/exhaustive-deps

  const nettoZahl = Number(netto.replace(',', '.'));
  const manuellZahl = manuell.trim() ? Number(manuell.replace(',', '.')) : null;
  const rechnung = useMemo(
    () => (Number.isFinite(nettoZahl) && netto.trim() ? berechnePfaendung(nettoZahl, monat, pfaendungen, grenzen, manuellZahl !== null && Number.isFinite(manuellZahl) ? manuellZahl : null) : null),
    [nettoZahl, netto, monat, pfaendungen, grenzen, manuellZahl],
  );
  const geltend = geltendeImMonat(pfaendungen, monat);

  return (
    <section className={kasten} data-testid="pfaendung-block">
      <h3 className="font-semibold">Pfändung</h3>
      <p className="text-sm text-[#86868b]">Pfändung eintragen (Gläubiger, Aktenzeichen, Unterhaltsberechtigte). Für jeden Monat das Nettoeinkommen eintragen; die App rechnet den pfändbaren Betrag nach § 850c ZPO und verteilt ihn nach Rang auf die Gläubiger.</p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div><label className="block text-xs text-[#86868b] mb-1">Gläubiger *</label><input value={gl} onChange={e => setGl(e.target.value)} className={inputCls} data-testid="pf-glaeubiger" /></div>
        <div><label className="block text-xs text-[#86868b] mb-1">Aktenzeichen</label><input value={az} onChange={e => setAz(e.target.value)} className={inputCls} /></div>
        <div><label className="block text-xs text-[#86868b] mb-1">Rang (1 = zuerst)</label><input value={rang} onChange={e => setRang(e.target.value)} inputMode="numeric" className={inputCls} /></div>
        <div><label className="block text-xs text-[#86868b] mb-1">Unterhaltsberechtigte (0–5)</label><input value={up} onChange={e => setUp(e.target.value)} inputMode="numeric" className={inputCls} data-testid="pf-personen" /></div>
        <div><label className="block text-xs text-[#86868b] mb-1">Gilt ab</label><input type="date" value={ab} onChange={e => setAb(e.target.value)} className={inputCls} /></div>
        <div><label className="block text-xs text-[#86868b] mb-1">Gilt bis (optional)</label><input type="date" value={bis} onChange={e => setBis(e.target.value)} className={inputCls} /></div>
        <div><label className="block text-xs text-[#86868b] mb-1">Offene Forderung in € (optional)</label><input value={ford} onChange={e => setFord(e.target.value)} inputMode="decimal" className={inputCls} /></div>
        <div><label className="block text-xs text-[#86868b] mb-1">Notiz</label><input value={pNotiz} onChange={e => setPNotiz(e.target.value)} className={inputCls} /></div>
      </div>
      <button type="button" disabled={laeuft || !gl.trim()} data-testid="pf-speichern" className="rounded-lg bg-[#e8590c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        onClick={async () => { if (await senden({ typ: 'pfaendung', glaeubiger: gl, aktenzeichen: az, rang, unterhaltspersonen: up, gueltig_ab: ab, gueltig_bis: bis, forderung_offen: ford, notiz: pNotiz }, 'Pfändung gespeichert.')) { setGl(''); setAz(''); setFord(''); setPNotiz(''); setBis(''); } }}>Pfändung speichern</button>

      {pfaendungen.length > 0 ? (
        <ul className="text-sm space-y-1" data-testid="pf-liste">
          {pfaendungen.map(p => (
            <li key={p.id} className="flex justify-between gap-3 border-t border-black/5 pt-1">
              <span>Rang {p.rang}: {p.glaeubiger}{p.aktenzeichen ? ` (${p.aktenzeichen})` : ''} · {p.unterhaltspersonen} Unterhaltsberechtigte · ab {de(p.gueltig_ab)}{p.gueltig_bis ? ` bis ${de(p.gueltig_bis)}` : ''}{p.forderung_offen != null ? ` · offen ${eur(Number(p.forderung_offen))}` : ''}</span>
              <button type="button" onClick={() => loeschen('pfaendung', p.id)} className="text-xs text-red-600 hover:underline shrink-0">löschen</button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-[#86868b]">Keine Pfändung eingetragen.</p>}

      {pfaendungen.length > 0 && (
        <div className="space-y-2 pt-2" data-testid="pf-monat">
          <h4 className="text-sm font-semibold">Pfändbarer Betrag für einen Monat</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div><label className="block text-xs text-[#86868b] mb-1">Monat</label><input type="month" value={monat} onChange={e => setMonat(e.target.value)} className={inputCls} data-testid="pf-monat-wahl" /></div>
            <div><label className="block text-xs text-[#86868b] mb-1">Nettoeinkommen in €</label><input value={netto} onChange={e => setNetto(e.target.value)} inputMode="decimal" className={inputCls} data-testid="pf-netto" /></div>
            <div><label className="block text-xs text-[#86868b] mb-1">Betrag von Hand (optional)</label><input value={manuell} onChange={e => setManuell(e.target.value)} inputMode="decimal" className={inputCls} /></div>
            <div><label className="block text-xs text-[#86868b] mb-1">Begründung (bei Handbetrag)</label><input value={begr} onChange={e => setBegr(e.target.value)} className={inputCls} /></div>
          </div>
          {geltend.length === 0 && <p className="text-sm text-[#86868b]">In diesem Monat gilt keine Pfändung.</p>}
          {rechnung && (
            <div className="rounded-xl bg-[#f5f5f7] p-3 text-sm space-y-1" data-testid="pf-ergebnis">
              <p>Netto {eur(rechnung.netto)} · Freibetrag bei {rechnung.personen} Unterhaltsberechtigten {eur(rechnung.freibetrag)}</p>
              <p>Pfändbar nach Gesetz: <strong>{eur(rechnung.pfaendbar)}</strong>{rechnung.manuell && <> · Einbehalt von Hand: <strong>{eur(rechnung.einbehalt)}</strong></>}</p>
              {rechnung.verteilung.map(v => <p key={v.id}>→ {v.glaeubiger}: {eur(v.betrag)}</p>)}
              {rechnung.hinweise.map(h => <p key={h} className="text-amber-700">{h}</p>)}
            </div>
          )}
          <button type="button" disabled={laeuft || !netto.trim()} data-testid="pf-monat-speichern" className="rounded-lg bg-black/10 hover:bg-black/15 px-3 py-2 text-sm font-medium disabled:opacity-60"
            onClick={() => senden({ typ: 'pfaendung_monat', monat, netto, betrag_manuell: manuell, begruendung: begr }, 'Monat gespeichert.')}>Monat speichern</button>
          <p className="text-xs text-[#86868b]">Die Rechnung folgt dem Gesetzestext, die amtliche Tabelle arbeitet in 10-Euro-Stufen: Einzelne Beträge können um wenige Euro abweichen. Vor dem ersten Einbehalt mit Steuerberater oder Lohnbüro abgleichen. Nicht pfändbare Bezüge (z. B. Teile von Überstunden, Urlaubsgeld) bitte vor der Eingabe vom Netto abziehen.</p>
        </div>
      )}
    </section>
  );
}

export function KmSatzBlock({ kmSatz, laeuft, senden }: { kmSatz: { satz: number; gueltig_ab: string } | null; laeuft: boolean; senden: (b: Record<string, unknown>, t: string) => Promise<boolean> }) {
  const [satz, setSatz] = useState(''); const [ab, setAb] = useState(heute());
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm" data-testid="kmsatz-block">
      <span className="text-[#86868b]">Kilometersatz im Betrieb: {kmSatz ? `${kmSatz.satz.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} € je km (ab ${de(kmSatz.gueltig_ab)})` : 'noch nicht festgelegt'}</span>
      <input value={satz} onChange={e => setSatz(e.target.value)} placeholder="€ je km" inputMode="decimal" className={inputCls + ' w-24'} aria-label="Satz je km" data-testid="kmsatz-eingabe" />
      <input type="date" value={ab} onChange={e => setAb(e.target.value)} className={inputCls + ' w-40'} aria-label="Gilt ab" />
      <button type="button" disabled={laeuft || !satz.trim()} onClick={async () => { if (await senden({ typ: 'kmsatz', satz, gueltig_ab: ab }, 'Kilometersatz gespeichert.')) setSatz(''); }} className="rounded-lg bg-black/10 hover:bg-black/15 px-3 py-2 font-medium disabled:opacity-60" data-testid="kmsatz-speichern">Satz speichern</button>
    </div>
  );
}

interface UebZeile { employee_id: string; name: string; zahlungen: { art: string; art_label: string; bezeichnung: string | null; betrag: number | null; notiz: string | null; menge?: number | null; satz?: number | null }[]; hinweise: string[]; pfaendung: ReturnType<typeof berechnePfaendung>; pfaendungOhneNetto: boolean }

export function LohnMonatsUebersicht() {
  const [monat, setMonat] = useState(heute().slice(0, 7));
  const [zeilen, setZeilen] = useState<UebZeile[]>([]);
  const [fehler, setFehler] = useState('');
  useEffect(() => {
    let abbruch = false;
    (async () => {
      setFehler('');
      try {
        const res = await fetch(`/api/lohn-uebersicht?monat=${monat}`, { cache: 'no-store' });
        if (res.status === 403) { setZeilen([]); return; }
        const j = await res.json();
        if (!j.success) throw new Error(j.error);
        if (!abbruch) setZeilen(j.zeilen);
      } catch (e: any) { if (!abbruch) setFehler(e.message || 'Laden fehlgeschlagen'); }
    })();
    return () => { abbruch = true; };
  }, [monat]);

  const flach = zeilen.flatMap(z => [
    ...z.zahlungen.map(p => [z.name, p.art_label + (p.bezeichnung ? `: ${p.bezeichnung}` : ''), p.menge ? `${p.menge} km` : '', p.betrag, p.notiz || ''] as (string | number | null)[]),
    ...(z.pfaendung ? [[z.name, 'Pfändung (Einbehalt)', '', -z.pfaendung.einbehalt, z.pfaendung.verteilung.map(v => `${v.glaeubiger} ${v.betrag.toFixed(2).replace('.', ',')} €`).join('; ')] as (string | number | null)[]] : []),
  ]);
  const kopf = ['Mitarbeiter', 'Art', 'Menge', 'Betrag (EUR)', 'Hinweis'];
  const csv = () => {
    const zq = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const zeile = (r: (string | number | null)[]) => r.map(v => (typeof v === 'number' ? String(v).replace('.', ',') : zq(String(v ?? '')))).join(';');
    const blob = new Blob(['﻿' + [kopf.join(';'), ...flach.map(zeile)].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `lohn-zulagen_${monat}.csv`; a.click();
  };
  const excel = () => ladeExcel(`lohn-zulagen_${monat}.xlsx`, [{ name: 'Zulagen', kopf, zeilen: flach }]);

  return (
    <section className={kasten} data-testid="lohn-uebersicht">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">Zulagen und Pfändung im Monat</h3>
        <input type="month" value={monat} onChange={e => setMonat(e.target.value)} className={inputCls + ' w-44'} aria-label="Monat" data-testid="lohn-uebersicht-monat" />
        <div className="flex gap-2 ml-auto">
          <button type="button" onClick={csv} disabled={!flach.length} className="rounded-lg border border-black/10 px-3 py-2 text-sm disabled:opacity-40" data-testid="lohn-uebersicht-csv">CSV</button>
          <button type="button" onClick={excel} disabled={!flach.length} className="rounded-lg border border-black/10 px-3 py-2 text-sm disabled:opacity-40" data-testid="lohn-uebersicht-excel">Excel</button>
        </div>
      </div>
      {fehler && <p className="text-sm text-red-600">{fehler}</p>}
      {zeilen.length === 0 ? <p className="text-sm text-[#86868b]">Für diesen Monat ist nichts eingetragen.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase text-[#86868b]"><th className="font-normal">Mitarbeiter</th><th className="font-normal">Eintrag</th><th className="font-normal text-right">Betrag</th></tr></thead>
          <tbody>{zeilen.map(z => (
            <tr key={z.employee_id} className="border-t border-black/5 align-top">
              <td className="py-1.5 pr-3">{z.name}</td>
              <td>
                {z.zahlungen.map((p, i) => <div key={i}>{p.art_label}{p.bezeichnung ? `: ${p.bezeichnung}` : ''}{p.menge ? ` (${p.menge} km)` : ''} {p.betrag != null ? `– ${eur(p.betrag)}` : ''}</div>)}
                {z.pfaendung && <div>Pfändung: Einbehalt {eur(z.pfaendung.einbehalt)}</div>}
                {z.pfaendungOhneNetto && <div className="text-amber-700">Pfändung gilt, aber das Netto für diesen Monat fehlt noch.</div>}
                {z.hinweise.map(h => <div key={h} className="text-amber-700">{h}</div>)}
              </td>
              <td className="text-right whitespace-nowrap">{eur(z.zahlungen.reduce((s, p) => s + (p.betrag || 0), 0))}</td>
            </tr>))}</tbody>
        </table>
      )}
    </section>
  );
}
