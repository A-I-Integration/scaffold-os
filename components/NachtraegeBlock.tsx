'use client';

import { useState } from 'react';
import { Plus, FileText, Check, X, Trash2, Camera } from 'lucide-react';
import {
  type Nachtrag, type NachtragStatus, NACHTRAG_STATUS_LABEL, nachtragNummer, normalisiereNachtraege,
  neuerNachtrag, setzeNachtragStatus, setzeNachtragBetrag, nachtragBraeuchteBetrag, nachtragSummen, parseBetrag,
  type NachtragArt, type RegieZeile, verlaengerungBetrag, regieBetrag, regieStunden, artFehlt,
} from '@/lib/nachtrag';
import { erzeugeNachtragPdf } from '@/lib/nachtrag-pdf';
import { unversendeteRechnungen, type RechnungKurz } from '@/lib/rechnung-versand';
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
  const [art, setArt] = useState<'' | NachtragArt>('');
  const [verl, setVerl] = useState({ wochen: '', preis: '', bis: '' });
  const [regie, setRegie] = useState<{ bezeichnung: string; personen: string; stunden: string; satz: string }[]>([{ bezeichnung: '', personen: '', stunden: '', satz: '' }]);
  const [betragEingabe, setBetragEingabe] = useState<Record<string, string>>({});
  const [offeneRechnungen, setOffeneRechnungen] = useState<RechnungKurz[]>([]);

  /** Beim Schließen des Nachtrag-Fensters: gibt es zu diesem Auftrag Rechnungen, die noch nicht per Mail verschickt wurden? */
  async function pruefeVersand() {
    try {
      const rRes = await fetch(`/api/invoices?project_id=${project.id}`);
      const rJson = await rRes.json();
      const rechnungen: RechnungKurz[] = rRes.ok && rJson.success ? rJson.invoices || [] : [];
      if (rechnungen.length === 0) { setOffeneRechnungen([]); return; }
      const nummern = rechnungen.map((r) => r.invoice_number).join(',');
      const mRes = await fetch(`/api/email-log?invoice_numbers=${encodeURIComponent(nummern)}`);
      const mJson = await mRes.json();
      if (!mRes.ok || !mJson.success) { setOffeneRechnungen(rechnungen.filter((r) => r.status !== 'storniert' && r.status !== 'bezahlt')); return; }
      setOffeneRechnungen(unversendeteRechnungen(rechnungen, mJson.emails || []));
    } catch { setOffeneRechnungen([]); }
  }

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
    const verlaengerung = { wochen: parseBetrag(verl.wochen), preisProWoche: parseBetrag(verl.preis), ...(verl.bis ? { bis: verl.bis } : {}) };
    const regieZeilen: RegieZeile[] = regie.map((z) => ({ bezeichnung: z.bezeichnung.trim(), personen: parseBetrag(z.personen), stunden: parseBetrag(z.stunden), satz: parseBetrag(z.satz) }));
    const fehltArt = artFehlt(art || undefined, verlaengerung, regieZeilen);
    const betrag = art === 'verlaengerung' ? verlaengerungBetrag(verlaengerung) : art === 'regie' ? regieBetrag(regieZeilen) : parseBetrag(form.betrag);
    if (fehltArt.length > 0) { setMeldung({ ok: false, text: 'Noch offen: ' + fehltArt.join(' · ') }); return; }
    if (!form.titel.trim()) { setMeldung({ ok: false, text: 'Bitte die zusätzliche Leistung kurz beschreiben.' }); return; }
    if (!form.grund.trim()) { setMeldung({ ok: false, text: 'Bitte den Grund des Nachtrags angeben.' }); return; }
    if (!(betrag > 0)) { setMeldung({ ok: false, text: 'Bitte einen Betrag größer 0 eingeben.' }); return; }
    setLaeuft(true); setMeldung(null);
    try {
      const fotos = await ladeNachtragFotosHoch(dateien, project.id);
      const id = crypto.randomUUID();
      await speichere((aktuell) => [...aktuell, neuerNachtrag(aktuell, { datum: form.datum || heute(), titel: form.titel, grund: form.grund, betrag, fotos, ...(art === 'verlaengerung' ? { art, verlaengerung } : art === 'regie' ? { art, regie: regieZeilen } : {}) }, id)]);
      setForm({ datum: heute(), titel: '', grund: '', betrag: '' });
      setArt(''); setVerl({ wochen: '', preis: '', bis: '' }); setRegie([{ bezeichnung: '', personen: '', stunden: '', satz: '' }]);
      setDateien([]); setOffen(false);
      setMeldung({ ok: true, text: 'Nachtrag gespeichert.' });
      void pruefeVersand();
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

  async function betragSpeichern(n: Nachtrag) {
    const b = parseBetrag(betragEingabe[n.id] || '');
    if (!(b > 0)) { setMeldung({ ok: false, text: 'Bitte einen Betrag größer 0 eingeben.' }); return; }
    setLaeuft(true); setMeldung(null);
    try { await speichere((a) => setzeNachtragBetrag(a, n.id, b)); setBetragEingabe((m) => ({ ...m, [n.id]: '' })); }
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
                {n.vorOrt && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-sky-100 text-sky-800">📍 von der Baustelle gemeldet</span>}
                <span className="ml-auto font-semibold text-[#1d1d1f]">{nachtragBraeuchteBetrag(n) ? 'Betrag fehlt' : eur(n.betrag)}</span>
              </div>
              <p className="text-[#1d1d1f]">{n.titel}</p>
              <p className="text-[#86868b]"><span className="font-medium">Grund:</span> {n.grund}</p>
              {n.art === 'verlaengerung' && n.verlaengerung && <p className="text-[#1d1d1f]">Verlängerung: {n.verlaengerung.wochen.toLocaleString('de-DE')} Wochen × {eur(n.verlaengerung.preisProWoche)}{n.verlaengerung.bis ? ` · Standzeit bis ${datumDe(n.verlaengerung.bis)}` : ''}</p>}
              {n.art === 'regie' && n.regie && (
                <ul className="text-[#1d1d1f]">
                  {n.regie.map((z, i) => <li key={i}>Regie: {z.bezeichnung}, {z.personen.toLocaleString('de-DE')} Mitarbeiter × {z.stunden.toLocaleString('de-DE')} Std. × {eur(z.satz)}</li>)}
                  <li className="text-[#86868b]">Gesamt {regieStunden(n.regie).toLocaleString('de-DE')} Arbeitsstunden</li>
                </ul>
              )}
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
              {n.status === 'offen' && nachtragBraeuchteBetrag(n) && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 p-2">
                  <span className="text-amber-800">Betrag (netto) eintragen:</span>
                  <input value={betragEingabe[n.id] || ''} onChange={(e) => setBetragEingabe((m) => ({ ...m, [n.id]: e.target.value }))} placeholder="z. B. 480,00" inputMode="decimal" className="w-28 rounded-lg border border-black/10 px-2 py-1" />
                  <button onClick={() => betragSpeichern(n)} disabled={laeuft} className="rounded-lg bg-[#e8590c] px-2 py-1 font-semibold text-white disabled:opacity-60">Speichern</button>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button onClick={() => pdf(n)} disabled={laeuft || nachtragBraeuchteBetrag(n)} title={nachtragBraeuchteBetrag(n) ? 'Erst den Betrag eintragen' : undefined} className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 font-semibold hover:bg-black/5 disabled:opacity-60"><FileText className="h-3 w-3" /> PDF</button>
                {n.status === 'offen' ? (
                  <>
                    <button onClick={() => status(n, 'bestaetigt')} disabled={laeuft || nachtragBraeuchteBetrag(n)} title={nachtragBraeuchteBetrag(n) ? 'Erst den Betrag eintragen' : undefined} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2 py-1 font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"><Check className="h-3 w-3" /> Kunde hat bestätigt</button>
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
          <div>
            <label className="block text-[11px] text-[#86868b] mb-1">Art</label>
            <select value={art} onChange={(e) => setArt(e.target.value as '' | NachtragArt)} className={inputCls}>
              <option value="">Zusatzleistung mit Pauschalbetrag</option>
              <option value="verlaengerung">Verlängerung der Standzeit (Wochen)</option>
              <option value="regie">Abrechnung nach Arbeitsstunden (Regie)</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] text-[#86868b] mb-1">Datum</label>
              <input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] text-[#86868b] mb-1">Betrag netto (€)</label>
              {art === '' ? (
                <input value={form.betrag} onChange={(e) => setForm({ ...form, betrag: e.target.value })} placeholder="z. B. 480,00" inputMode="decimal" className={inputCls} />
              ) : (
                <div className={`${inputCls} bg-[#f5f5f7] font-semibold`}>{eur(art === 'verlaengerung'
                  ? verlaengerungBetrag({ wochen: parseBetrag(verl.wochen), preisProWoche: parseBetrag(verl.preis) })
                  : regieBetrag(regie.map((z) => ({ bezeichnung: z.bezeichnung, personen: parseBetrag(z.personen), stunden: parseBetrag(z.stunden), satz: parseBetrag(z.satz) }))))} <span className="font-normal text-[#86868b]">wird berechnet</span></div>
              )}
            </div>
          </div>
          {art === 'verlaengerung' && (
            <div className="grid grid-cols-3 gap-2">
              <div><label className="block text-[11px] text-[#86868b] mb-1">Wochen</label><input value={verl.wochen} onChange={(e) => setVerl({ ...verl, wochen: e.target.value })} inputMode="decimal" placeholder="z. B. 6" className={inputCls} /></div>
              <div><label className="block text-[11px] text-[#86868b] mb-1">Preis je Woche (netto, €)</label><input value={verl.preis} onChange={(e) => setVerl({ ...verl, preis: e.target.value })} inputMode="decimal" className={inputCls} /></div>
              <div><label className="block text-[11px] text-[#86868b] mb-1">Standzeit bis (optional)</label><input type="date" value={verl.bis} onChange={(e) => setVerl({ ...verl, bis: e.target.value })} className={inputCls} /></div>
            </div>
          )}
          {art === 'regie' && (
            <div className="space-y-1.5">
              {regie.map((z, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 items-end">
                  <div className="col-span-5"><label className="block text-[11px] text-[#86868b] mb-1">{i === 0 ? 'Tätigkeit' : ''}</label><input value={z.bezeichnung} onChange={(e) => setRegie((r) => r.map((x, j) => (j === i ? { ...x, bezeichnung: e.target.value } : x)))} placeholder="z. B. Umbau oben" className={inputCls} /></div>
                  <div className="col-span-2"><label className="block text-[11px] text-[#86868b] mb-1">{i === 0 ? 'Mitarbeiter' : ''}</label><input value={z.personen} onChange={(e) => setRegie((r) => r.map((x, j) => (j === i ? { ...x, personen: e.target.value } : x)))} inputMode="decimal" className={inputCls} /></div>
                  <div className="col-span-2"><label className="block text-[11px] text-[#86868b] mb-1">{i === 0 ? 'Std. je MA' : ''}</label><input value={z.stunden} onChange={(e) => setRegie((r) => r.map((x, j) => (j === i ? { ...x, stunden: e.target.value } : x)))} inputMode="decimal" className={inputCls} /></div>
                  <div className="col-span-2"><label className="block text-[11px] text-[#86868b] mb-1">{i === 0 ? '€/Std. netto' : ''}</label><input value={z.satz} onChange={(e) => setRegie((r) => r.map((x, j) => (j === i ? { ...x, satz: e.target.value } : x)))} inputMode="decimal" className={inputCls} /></div>
                  <div className="col-span-1">{regie.length > 1 && <button type="button" onClick={() => setRegie((r) => r.filter((_, j) => j !== i))} className="w-full rounded-lg bg-black/10 py-2 text-xs" title="Zeile entfernen">✕</button>}</div>
                </div>
              ))}
              <button type="button" onClick={() => setRegie((r) => [...r, { bezeichnung: '', personen: '', stunden: '', satz: '' }])} className="text-xs text-[#e8590c] font-semibold hover:underline">+ Zeile</button>
            </div>
          )}
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
            <button onClick={() => { setOffen(false); setDateien([]); void pruefeVersand(); }} disabled={laeuft} className="rounded-lg bg-black/10 hover:bg-black/20 px-3 py-2 text-sm text-[#1d1d1f]">Abbrechen</button>
          </div>
        </div>
      )}
      {meldung && <p className={`text-[11px] ${meldung.ok ? 'text-emerald-600' : 'text-red-600'}`}>{meldung.text}</p>}
      {!offen && offeneRechnungen.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1.5" role="alert">
          <p className="font-semibold">Sind die Rechnungen schon verschickt?</p>
          <p>Zu diesem Auftrag gibt es noch keine verschickte Mail für: {offeneRechnungen.map((r) => r.invoice_number).join(', ')}.</p>
          <div className="flex flex-wrap gap-1.5">
            <a href="/rechnungen" className="rounded-lg bg-[#e8590c] px-2.5 py-1 font-semibold text-white">Zu den Rechnungen</a>
            <button onClick={() => setOffeneRechnungen([])} className="rounded-lg border border-amber-300 px-2.5 py-1 font-semibold hover:bg-amber-100">Schon verschickt</button>
          </div>
        </div>
      )}
    </div>
  );
}
