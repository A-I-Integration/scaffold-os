'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, ClipboardList, Layers, Eye } from 'lucide-react';
import { WIN } from '@/components/win/Win';
import { fmtDate } from '@/lib/invoice-pdf';
import { ENTWURF_ART_LABEL } from '@/lib/rechnung-entwurf';
import {
  type FakturaReiter, type FakturaFilter, REITER_LABEL, filtereRechnungen, zaehleJeReiter, anzeigeStatus, offenerBetrag, rechnungsJahre,
} from '@/lib/faktura-kennzahlen';
import { type FakturaDaten, type EntwurfKurz, eur } from './daten';
import { STATUS_STIL, ART_LABEL, knopf, kopfZeile } from './ui';

const REITER: FakturaReiter[] = ['alle', 'rechnungen', 'abschlag', 'schluss', 'gutschriften', 'entwuerfe'];

export default function FakturaRechnungen({ daten, startReiter = 'alle', imKundenordner = false }: { daten: FakturaDaten; startReiter?: FakturaReiter; imKundenordner?: boolean }) {
  const router = useRouter();
  const { heute, rechnungen, entwuerfe, setEntwuerfe, entwurfFehler, setEntwurfFehler, laedt } = daten;
  const [filter, setFilter] = useState<FakturaFilter>({ reiter: startReiter, suche: '', status: 'alle', jahr: heute.slice(0, 4) });

  const jeReiter = useMemo(() => zaehleJeReiter(filter.jahr === 'alle' ? rechnungen : rechnungen.filter((r) => String(r.invoice_date || '').slice(0, 4) === filter.jahr)), [rechnungen, filter.jahr]);
  const jahre = useMemo(() => rechnungsJahre(rechnungen, heute), [rechnungen, heute]);
  const sichtbar = useMemo(() => filtereRechnungen(rechnungen, filter, heute), [rechnungen, filter, heute]);
  const reiterAnzahl = { ...jeReiter, entwuerfe: entwuerfe.length };

  async function entwurfLoeschen(e: EntwurfKurz) {
    if (!window.confirm(`Entwurf${e.customer_name ? ` für ${e.customer_name}` : ''} wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    try {
      const res = await fetch('/api/invoice-drafts?id=' + e.id, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Löschen fehlgeschlagen');
      setEntwuerfe((l) => l.filter((x) => x.id !== e.id));
    } catch (err) {
      setEntwurfFehler(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
  }

  return (
    <div className="rounded-xl border bg-white" style={{ borderColor: WIN.rand }}>
      <div className="flex flex-wrap gap-1 px-3 pt-2 border-b" style={{ borderColor: WIN.rand }} role="tablist">
        {REITER.map((k) => (
          <button key={k} role="tab" aria-selected={filter.reiter === k} onClick={() => setFilter({ ...filter, reiter: k })}
            className="px-3 py-2 text-[14px] -mb-px border-b-2"
            style={{ borderColor: filter.reiter === k ? WIN.akzent : 'transparent', color: filter.reiter === k ? WIN.akzent : WIN.text, fontWeight: filter.reiter === k ? 600 : 400 }}>
            {REITER_LABEL[k]} <span className="text-[12px] opacity-60">{reiterAnzahl[k]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3">
        <Link href="/rechnungen?neu=1" className={`${knopf} text-white`} style={{ background: WIN.akzent, borderColor: WIN.akzent }}><Plus className="h-4 w-4" /> Neue Rechnung</Link>
        {!imKundenordner && <Link href="/aufmass" className={knopf} style={{ borderColor: WIN.rand }}><ClipboardList className="h-4 w-4" /> Aus Aufmaß</Link>}
        {!imKundenordner && <Link href="/kunden" className={knopf} style={{ borderColor: WIN.rand }}><Layers className="h-4 w-4" /> Aus Auftrag</Link>}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: WIN.textGedaempft }} />
          <input value={filter.suche} onChange={(e) => setFilter({ ...filter, suche: e.target.value })} placeholder="Kunde, Projektnummer, Nr. …"
            className="w-full rounded-lg border bg-white pl-9 pr-3 py-2 text-[13px] focus:outline-none" style={{ borderColor: WIN.rand }} aria-label="Rechnungen durchsuchen" />
        </div>
        <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as FakturaFilter['status'] })} className="rounded-lg border bg-white px-3 py-2 text-[13px]" style={{ borderColor: WIN.rand }} aria-label="Status filtern">
          <option value="alle">Alle Status</option><option value="offen">Offen</option><option value="ueberfaellig">Überfällig</option><option value="bezahlt">Bezahlt</option><option value="storniert">Storniert</option>
        </select>
        <select value={filter.jahr} onChange={(e) => setFilter({ ...filter, jahr: e.target.value })} className="rounded-lg border bg-white px-3 py-2 text-[13px]" style={{ borderColor: WIN.rand }} aria-label="Jahr wählen">
          <option value="alle">Alle Jahre</option>
          {jahre.map((j) => <option key={j} value={j}>{j === heute.slice(0, 4) ? 'Dieses Jahr' : j}</option>)}
        </select>
      </div>

      {filter.reiter === 'entwuerfe' ? (
        <div className="px-3 pb-4" data-testid="entwuerfe-bereich">
          {entwurfFehler && <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">⚠️ {entwurfFehler}</p>}
          <p className="mb-2 text-[13px]" style={{ color: WIN.textGedaempft }}>Entwürfe haben noch keine Rechnungsnummer. Die Nummer wird erst beim Anlegen der Rechnung vergeben; Rechnungsdatum und Fälligkeit gelten ab diesem Zeitpunkt.</p>
          {entwuerfe.length === 0 ? (
            <p className="py-3 text-sm" style={{ color: WIN.textGedaempft }} data-testid="entwuerfe-leer">Keine Entwürfe. Im Formular „Neue Rechnung“ gibt es den Knopf „Als Entwurf speichern“.</p>
          ) : (
            <table className="w-full text-[13.5px]" data-testid="entwuerfe-liste">
              <thead>
                <tr className={kopfZeile} style={{ color: WIN.textGedaempft, borderColor: WIN.randHell, background: '#fafafa' }}>
                  <th className="px-3 py-2">Kunde</th><th className="px-3 py-2">Art</th><th className="px-3 py-2 text-right">Netto (Vorschau)</th><th className="px-3 py-2">Zuletzt geändert</th><th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {entwuerfe.map((e) => (
                  <tr key={e.id} className="border-b" style={{ borderColor: WIN.randHell }}>
                    <td className="px-3 py-2.5">{e.customer_name || <span style={{ color: WIN.textGedaempft }}>ohne Kunde</span>}</td>
                    <td className="px-3 py-2.5">{ENTWURF_ART_LABEL[e.invoice_type] || 'Rechnung'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{eur(Number(e.netto_vorschau))}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{new Date(e.updated_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <Link href={`/rechnungen?entwurf=${e.id}`} className={`${knopf} mr-1`} style={{ borderColor: WIN.rand }}>Bearbeiten</Link>
                      <button onClick={() => entwurfLoeschen(e)} className={knopf} style={{ borderColor: WIN.rand, color: '#b42318' }} aria-label="Entwurf löschen">Löschen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : laedt ? (
        <p className="px-4 pb-6 text-sm" style={{ color: WIN.textGedaempft }}>Lade …</p>
      ) : sichtbar.length === 0 ? (
        <p className="px-4 pb-6 text-sm" style={{ color: WIN.textGedaempft }} data-testid="faktura-leer">Keine Rechnungen für diese Auswahl.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]" data-testid="faktura-liste">
            <thead>
              <tr className={kopfZeile} style={{ color: WIN.textGedaempft, borderColor: WIN.randHell, background: '#fafafa' }}>
                <th className="px-3 py-2">Nr.</th><th className="px-3 py-2">Kunde / Projekt</th><th className="px-3 py-2">Art</th>
                <th className="px-3 py-2 text-right">Netto</th><th className="px-3 py-2 text-right">Brutto</th><th className="px-3 py-2 text-right">Offen</th>
                <th className="px-3 py-2">Status</th><th className="px-3 py-2">Fällig</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((r) => {
                const st = STATUS_STIL[anzeigeStatus(r, heute)];
                const offen = offenerBetrag(r);
                return (
                  <tr key={r.id} onClick={() => router.push(`/rechnungen/${r.id}`)} className="border-b cursor-pointer hover:bg-[#f7f8fa]" style={{ borderColor: WIN.randHell }}>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.invoice_number}</td>
                    <td className="px-3 py-2.5"><span className="block">{r.customer_name}</span>{r.projektnummer && <span className="block text-[12px]" style={{ color: WIN.textGedaempft }}>{r.projektnummer}</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{ART_LABEL[r.invoice_type || 'standard'] || 'Rechnung'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{eur(Number(r.net_amount))}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{eur(Number(r.gross_amount))}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{offen > 0 ? eur(offen) : '–'}</td>
                    <td className="px-3 py-2.5"><span className="rounded-md px-2 py-0.5 text-[12px] font-semibold" style={{ background: st.bg, color: st.fg }}>{st.label}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.due_date ? fmtDate(r.due_date) : '–'}</td>
                    <td className="px-3 py-2.5"><Link href={`/rechnungen/${r.id}`} onClick={(e) => e.stopPropagation()} aria-label={`${r.invoice_number} öffnen`} className="p-1 rounded hover:bg-black/5 inline-flex"><Eye className="h-4 w-4" style={{ color: WIN.textGedaempft }} /></Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
