'use client';

import { useState } from 'react';
import { Plus, FileText, Check, X, Trash2, Camera } from 'lucide-react';
import {
  type Nachtrag, type NachtragStatus, NACHTRAG_STATUS_LABEL, nachtragNummer, normalisiereNachtraege,
  neuerNachtrag, setzeNachtragStatus, nachtragSummen, parseBetrag,
} from '@/lib/nachtrag';
import { erzeugeNachtragPdf } from '@/lib/nachtrag-pdf';
import { ladeNachtragFotosHoch, ladeFotosFuerPdf, legeNachtragPdfAmProjektAb } from '@/lib/nachtrag-client';

// ============================================================
// SCAFFOLD OS – Nachträge beim Auftrag (Kundenseite)
// Mehrere Nachträge je Auftrag: Grund, Datum, Fotos, Betrag (netto),
// Status (offen / vom Kunden bestätigt / abgelehnt) und Nachtrags-PDF.
// Gespeichert in projects.data.nachtraege (bestehende PATCH-Route,
// keine Schema-Änderung).
// ============================================================

interface Props {
  project: { id: string; name: string | null; adresse: string | null; data: any };
  kunde: { name: string };
}

const heute = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (lokal)
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const datumDe = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE'); };
const inputCls = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]';
const STATUS_FARBE: Record<NachtragStatus, string> = {
  offen: 'bg-amber-100 text-amber-800',
  bestaetigt: 'bg-emerald-100 text-emerald-800',
  abgelehnt: 'bg-red-100 text-red-700',
};

export default function NachtraegeBlock({ project, kunde }: Props) {
  const [liste, setListe] = useState<Nachtrag[]>(() => normalisiereNachtraege(project.data?.nachtraege));
  const [offen, setOffen] = useState(false);
  const [form, setForm] = useState({ datum: heute(), titel: '', grund: '', betrag: '' });
  const [dateien, setDateien] = useState<File[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const summen = nachtragSummen(liste);

  /** Frischen Stand lesen, ändern, zurückschreiben (verhindert, dass ein veralteter Stand Nachträge überschreibt). */
  async function speichere(aendere: (aktuell: Nachtrag[]) => Nachtrag[]): Promise<Nachtrag[]> {
    const gRes = await fetch(`/api/projects?id=${project.id}`);
    const gJson = await gRes.json();
    if (!gRes.ok || !gJson.success) throw new Error(gJson.error || 'Auftrag konnte nicht geladen werden');
    const neu = aendere(normalisiereNachtraege(gJson.project?.data?.nachtraege));
    const pRes = await fetch('/api/projects', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: project.id, data: { nachtraege: neu } }),
    });
    const pJson = await pRes.json().catch(() => ({}));
    if (!pRes.ok || pJson.success === false) throw new Error(pJson.error || 'Speichern fehlgeschlagen');
    setListe(neu);
    return neu;
  }

  async function anlegen() {
    const betrag = parseBetrag(form.betrag);
    if (!form.titel.trim()) { setMeldung({ ok: false, text: 'Bitte die zusätzliche Leistung kurz beschreiben.' }); return; }
    if (!form.grund.trim()) { setMeldung({ ok: false, text: 'Bitte den Grund des Nachtrags angeben.' }); return; }
    if (!(betrag > 0)) { setMeldung({ ok: false, text: 'Bitte einen Betrag größer 0 eingeben.' }); return; }
    setLaeuft(true); setMeldung(null);
    try {
      const fotos = await ladeNachtragFotosHoch(dateien, project.id);
      const id = crypto.randomUUID();
      await speichere((aktuell) => [...aktuell, neuerNachtrag(aktuell, { datum: form.datum || heute(), titel: form.titel, grund: form.grund, betrag, fotos }, id)]);
      setForm({ datum: heute(), titel: '', grund: '', betrag: '' });
      setDateien([]); setOffen(false);
      setMeldung({ ok: true, text: 'Nachtrag gespeichert.' });
    } catch (e: any) {
      setMeldung({ ok: false, text: e?.message || 'Fehler beim Speichern' });
    } finally {
      setLaeuft(false);
    }
  }

  async function status(n: Nachtrag, neu: NachtragStatus) {
    const frage = neu === 'bestaetigt' ? `Nachtrag ${nachtragNummer(n)} als „vom Kunden bestätigt“ markieren?` : neu === 'abgelehnt' ? `Nachtrag ${nachtragNummer(n)} als „abgelehnt“ markieren?` : `Nachtrag ${nachtragNummer(n)} wieder auf „offen“ setzen?`;
    if (!window.confirm(frage)) return;
    setLaeuft(true); setMeldung(null);
    try { await speichere((a) => setzeNachtragStatus(a, n.id, neu, heute())); }
    catch (e: any) { setMeldung({ ok: false, text: e?.message || 'Fehler' }); }
    finally { setLaeuft(false); }
  }

  async function loeschen(n: Nachtrag) {
    if (n.status !== 'offen') return;
    if (!window.confirm(`Offenen Nachtrag ${nachtragNummer(n)} wirklich löschen?`)) return;
    setLaeuft(true); setMeldung(null);
    try { await speichere((a) => a.filter((x) => x.id !== n.id)); }
    catch (e: any) { setMeldung({ ok: false, text: e?.message || 'Fehler' }); }
    finally { setLaeuft(false); }
  }

  async function pdf(n: Nachtrag) {
    setLaeuft(true); setMeldung(null);
    try {
      let firma = null;
      try {
        const cRes = await fetch('/api/company'); const cJson = await cRes.json();
        if (cJson?.success) firma = cJson.company;
      } catch { /* Firma optional */ }
      const fotos = await ladeFotosFuerPdf(n.fotos);
      const doc = erzeugeNachtragPdf({ nachtrag: n, kunde: kunde.name, adresse: project.adresse || undefined, projektName: project.name || undefined, firma, fotos });
      const name = `Nachtrag_${nachtragNummer(n)}_${String(kunde.name || 'Kunde').replace(/[^\wäöüÄÖÜß-]+/g, '_')}_${n.datum}.pdf`;
      doc.save(name);
      try {
        await legeNachtragPdfAmProjektAb(doc.output('blob'), project.id, name, `Nachtrag ${nachtragNummer(n)} vom ${datumDe(n.datum)}`);
        setMeldung({ ok: true, text: 'PDF heruntergeladen und unter „Dokumente“ am Projekt gespeichert.' });
      } catch (e: any) {
        setMeldung({ ok: false, text: `PDF heruntergeladen, aber nicht am Projekt gespeichert: ${e?.message || 'Fehler'}` });
      }
    } catch (e: any) {
      setMeldung({ ok: false, text: e?.message || 'PDF konnte nicht erstellt werden' });
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[#1d1d1f]">Nachträge ({liste.length})</p>
        {liste.length > 0 && (
          <p className="text-[11px] text-[#86868b]">
            bestätigt {eur(summen.bestaetigt)} · offen {eur(summen.offen)} <span className="opacity-70">(netto)</span>
          </p>
        )}
      </div>

      {liste.length > 0 && (
        <ul className="space-y-2">
          {liste.map((n) => (
            <li key={n.id} className="rounded-xl border border-black/10 bg-white p-3 text-xs space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[#1d1d1f]">{nachtragNummer(n)}</span>
                <span className="text-[#86868b]">{datumDe(n.datum)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_FARBE[n.status]}`}>{NACHTRAG_STATUS_LABEL[n.status]}{n.statusDatum && n.status !== 'offen' ? ` · ${datumDe(n.statusDatum)}` : ''}</span>
                <span className="ml-auto font-semibold text-[#1d1d1f]">{eur(n.betrag)}</span>
              </div>
              <p className="text-[#1d1d1f]">{n.titel}</p>
              <p className="text-[#86868b]"><span className="font-medium">Grund:</span> {n.grund}</p>
              {n.fotos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {n.fotos.map((f, i) => (
                    <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" title={f.file_name}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={f.file_name} className="h-14 w-14 rounded-lg object-cover border border-black/10" />
                    </a>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button onClick={() => pdf(n)} disabled={laeuft} className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 font-semibold hover:bg-black/5 disabled:opacity-60"><FileText className="h-3 w-3" /> PDF</button>
                {n.status === 'offen' ? (
                  <>
                    <button onClick={() => status(n, 'bestaetigt')} disabled={laeuft} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2 py-1 font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"><Check className="h-3 w-3" /> Kunde hat bestätigt</button>
                    <button onClick={() => status(n, 'abgelehnt')} disabled={laeuft} className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-2 py-1 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"><X className="h-3 w-3" /> Abgelehnt</button>
                    <button onClick={() => loeschen(n)} disabled={laeuft} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[#86868b] hover:text-red-600 disabled:opacity-60"><Trash2 className="h-3 w-3" /> Löschen</button>
                  </>
                ) : (
                  <button onClick={() => status(n, 'offen')} disabled={laeuft} className="rounded-lg px-2 py-1 text-[#86868b] hover:underline disabled:opacity-60">Wieder auf offen setzen</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!offen ? (
        <button onClick={() => { setOffen(true); setMeldung(null); }} className="flex items-center gap-1.5 text-xs text-[#e8590c] font-semibold hover:underline">
          <Plus className="h-3.5 w-3.5" /> Nachtrag erfassen
        </button>
      ) : (
        <div className="bg-[#f5f5f7] rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] text-[#86868b] mb-1">Datum</label>
              <input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] text-[#86868b] mb-1">Betrag netto (€)</label>
              <input value={form.betrag} onChange={(e) => setForm({ ...form, betrag: e.target.value })} placeholder="z. B. 480,00" inputMode="decimal" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-[#86868b] mb-1">Zusätzliche Leistung</label>
            <input value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} placeholder="z. B. Gerüstverlängerung Giebelseite um 6 m" className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] text-[#86868b] mb-1">Grund / Anlass</label>
            <textarea value={form.grund} onChange={(e) => setForm({ ...form, grund: e.target.value })} rows={2} placeholder="z. B. Bauherr hat zusätzliche Dachflächenarbeiten beauftragt" className={inputCls} />
          </div>
          <div>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1d1d1f] cursor-pointer rounded-lg border border-black/10 bg-white px-3 py-1.5 hover:bg-black/5">
              <Camera className="h-3.5 w-3.5" /> Fotos hinzufügen
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setDateien((prev) => [...prev, ...Array.from(e.target.files || [])])} />
            </label>
            {dateien.length > 0 && (
              <span className="ml-2 text-[11px] text-[#86868b]">
                {dateien.length} Foto{dateien.length === 1 ? '' : 's'} gewählt{' '}
                <button type="button" onClick={() => setDateien([])} className="underline">entfernen</button>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={anlegen} disabled={laeuft} className="flex-1 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 py-2 text-sm font-semibold text-white">{laeuft ? 'Speichert…' : 'Nachtrag speichern'}</button>
            <button onClick={() => { setOffen(false); setDateien([]); }} disabled={laeuft} className="rounded-lg bg-black/10 hover:bg-black/20 px-3 py-2 text-sm text-[#1d1d1f]">Abbrechen</button>
          </div>
        </div>
      )}
      {meldung && <p className={`text-[11px] ${meldung.ok ? 'text-emerald-600' : 'text-red-600'}`}>{meldung.text}</p>}
    </div>
  );
}
