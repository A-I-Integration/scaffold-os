'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Receipt } from 'lucide-react';
import { normalisiereNachtraege, nachtragNummer, type Nachtrag } from '@/lib/nachtrag';
import { abschnitteAusSchritt2, berechneAufmass } from '@/lib/aufmassblatt-pdf';
import {
  baueRechnungsPositionen, eingabeAusProjektData, summeNetto, type RechnungsBasis, type RechnungsEingabe,
} from '@/lib/schlussrechnung';
import type { Invoice } from '@/lib/invoice-pdf';

// ============================================================
// SCAFFOLD OS – Schlussrechnung aus Auftrag erstellen
// Basis wählbar: Angebotspreis ODER aufgemessene Fläche × Preis/m².
// Bestätigte Nachträge (N-01 …) können mit auf die Rechnung.
// Wird auf der Kundenseite und in Aufmaß Schritt 6 benutzt.
// ============================================================

interface Props {
  projectId: string;
  customerName: string;
  customerAddress?: string;
  /** Optional: aktueller Stand (z. B. Schritt 6, auch ungespeichert). Ohne Angabe: gespeicherter Stand aus der Datenbank. */
  daten?: any;
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
}

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const inputCls = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]';

export default function SchlussrechnungDialog({ projectId, customerName, customerAddress, daten, onClose, onCreated }: Props) {
  const [laden, setLaden] = useState(true);
  const [fehlerLaden, setFehlerLaden] = useState('');
  const [projektDaten, setProjektDaten] = useState<any>(null);
  const [nachtraege, setNachtraege] = useState<Nachtrag[]>([]);
  const [kranTagessatz, setKranTagessatz] = useState(850);
  const [firmenPreisM2, setFirmenPreisM2] = useState('');
  const [bestehende, setBestehende] = useState<Invoice[]>([]);

  const [basis, setBasis] = useState<RechnungsBasis>('angebot');
  const [art, setArt] = useState<'schluss' | 'standard'>('schluss');
  const [preisM2, setPreisM2] = useState('');
  const [gewaehlteNachtraege, setGewaehlteNachtraege] = useState<Set<string>>(new Set());

  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const [brauchtBegruendung, setBrauchtBegruendung] = useState<string | null>(null);
  const [begruendung, setBegruendung] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [pRes, cRes, iRes] = await Promise.all([
          fetch(`/api/projects?id=${projectId}`).then((r) => r.json()),
          fetch('/api/company').then((r) => r.json()).catch(() => null),
          fetch('/api/invoices').then((r) => r.json()).catch(() => null),
        ]);
        if (!pRes?.success) throw new Error(pRes?.error || 'Auftrag konnte nicht geladen werden');
        const d = daten ?? pRes.project?.data ?? {};
        setProjektDaten(d);
        const n = normalisiereNachtraege(pRes.project?.data?.nachtraege).filter((x) => x.status === 'bestaetigt');
        setNachtraege(n);
        setGewaehlteNachtraege(new Set(n.map((x) => x.id)));
        if (cRes?.success && cRes.company) {
          setKranTagessatz(Number(cRes.company.calc_crane_day) || 850);
          const f = cRes.company.calc_festpreis_pro_m2;
          if (f != null && f !== '') setFirmenPreisM2(String(f));
        }
        if (iRes?.success) setBestehende((iRes.invoices || []).filter((i: Invoice) => i.project_id === projectId && i.status !== 'storniert'));
        // Vorbelegung Preis/m²: gespeicherter Festpreis des Auftrags, sonst Firmenstandard
        const fp = String(d.festpreisProM2 ?? '');
        setPreisM2(fp || (cRes?.company?.calc_festpreis_pro_m2 != null ? String(cRes.company.calc_festpreis_pro_m2) : ''));
      } catch (e: any) {
        setFehlerLaden(e?.message || 'Fehler beim Laden');
      } finally {
        setLaden(false);
      }
    })();
    // daten bewusst nur beim Öffnen gelesen (Momentaufnahme), sonst Endlosschleife bei neuem Objekt je Render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const eingabe: RechnungsEingabe | null = useMemo(
    () => (projektDaten ? eingabeAusProjektData(projektDaten, kranTagessatz) : null),
    [projektDaten, kranTagessatz],
  );
  const aufmassM2 = useMemo(() => (projektDaten ? berechneAufmass(abschnitteAusSchritt2(projektDaten.step2)).gesamtM2 : 0), [projektDaten]);
  const preisM2Zahl = parseFloat(String(preisM2).replace(',', '.')) || 0;

  const positionen = useMemo(() => {
    if (!eingabe) return [];
    return baueRechnungsPositionen({
      eingabe, basis, aufmassM2, aufmassPreisProM2: preisM2Zahl,
      nachtraege: nachtraege.filter((n) => gewaehlteNachtraege.has(n.id)),
    });
  }, [eingabe, basis, aufmassM2, preisM2Zahl, nachtraege, gewaehlteNachtraege]);
  const netto = summeNetto(positionen);

  const hatAngebotspreis = !!eingabe?.kiResult;
  const aufmassMoeglich = aufmassM2 > 0;
  const kannAnlegen = !laeuft && positionen.length > 0 && netto > 0
    && (basis === 'angebot' ? hatAngebotspreis : aufmassMoeglich && preisM2Zahl > 0);

  async function anlegen(overrideGrund?: string) {
    if (!eingabe) return;
    setLaeuft(true); setFehler('');
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          customer_name: customerName,
          customer_address: customerAddress || undefined,
          invoice_type: art,
          notes: eingabe.anpassungen?.skonto ? '2% Skonto bei Zahlung innerhalb von 8 Tagen.' : undefined,
          positions: positionen,
          override_grund: overrideGrund || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!json.success) {
        if (json.code === 'FREIGABE_FEHLT_OVERRIDE_MOEGLICH') { setBrauchtBegruendung(json.error); return; }
        throw new Error(json.error || 'Rechnung konnte nicht angelegt werden.');
      }
      onCreated(json.invoice);
      onClose();
    } catch (e: any) {
      setFehler(e?.message || 'Fehler');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[92vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#1d1d1f] flex items-center gap-1.5"><Receipt className="h-4 w-4 text-[#e8590c]" /> Rechnung aus Auftrag erstellen</h3>
            <p className="text-[11px] text-[#86868b]">{customerName}</p>
          </div>
          <button onClick={onClose} aria-label="Schließen" className="p-1 rounded-lg hover:bg-black/5"><X className="h-4 w-4" /></button>
        </div>

        {laden ? <p className="text-xs text-[#86868b]">Lade Auftragsdaten …</p> : fehlerLaden ? <p className="text-xs text-red-600">{fehlerLaden}</p> : (
          <>
            {bestehende.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900">
                <p className="font-semibold mb-1">Zu diesem Auftrag gibt es schon Rechnungen:</p>
                <ul className="space-y-0.5">
                  {bestehende.map((i) => <li key={i.id}>{i.invoice_number} · {eur(Number(i.gross_amount))} brutto · {i.status}</li>)}
                </ul>
                <p className="mt-1">Bereits abgerechnete Leistungen werden hier <b>nicht</b> automatisch abgezogen. Bitte prüfen, dass nichts doppelt berechnet wird.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-[#86868b] mb-1">Rechnungsart</label>
                <select value={art} onChange={(e) => setArt(e.target.value as 'schluss' | 'standard')} className={inputCls}>
                  <option value="schluss">Schlussrechnung</option>
                  <option value="standard">Rechnung</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#86868b] mb-1">Abrechnung nach</label>
                <select value={basis} onChange={(e) => setBasis(e.target.value as RechnungsBasis)} className={inputCls}>
                  <option value="angebot">Angebotspreis</option>
                  <option value="aufmass">Aufmaß (Fläche × Preis/m²)</option>
                </select>
              </div>
            </div>

            {basis === 'angebot' && !hatAngebotspreis && (
              <p className="text-xs text-red-600">Für diesen Auftrag ist kein berechnetes Angebot gespeichert. Bitte nach Aufmaß abrechnen oder zuerst im Aufmaß (Schritt 6) berechnen.</p>
            )}
            {basis === 'aufmass' && (
              <div className="rounded-lg bg-[#f5f5f7] p-3 space-y-2">
                {aufmassMoeglich ? (
                  <p className="text-xs text-[#1d1d1f]">Aufgemessene Fläche (laut Aufmaßblatt, inkl. Mindestlänge): <b>{aufmassM2.toLocaleString('de-DE')} m²</b></p>
                ) : (
                  <p className="text-xs text-red-600">Für diesen Auftrag sind keine Maße (Länge × Höhe) gespeichert – Abrechnung nach Aufmaß nicht möglich.</p>
                )}
                <div>
                  <label className="block text-[11px] text-[#86868b] mb-1">Preis je m² (netto, €){firmenPreisM2 ? ` – Firmenstandard ${firmenPreisM2.replace('.', ',')} €` : ''}</label>
                  <input value={preisM2} onChange={(e) => setPreisM2(e.target.value)} inputMode="decimal" placeholder="z. B. 12,50" className={inputCls} />
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-[#1d1d1f] mb-1">Bestätigte Nachträge</p>
              {nachtraege.length === 0 ? (
                <p className="text-[11px] text-[#86868b]">Keine vom Kunden bestätigten Nachträge vorhanden. (Offene Nachträge werden nicht berechnet.)</p>
              ) : (
                <ul className="space-y-1">
                  {nachtraege.map((n) => (
                    <li key={n.id}>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={gewaehlteNachtraege.has(n.id)}
                          onChange={() => setGewaehlteNachtraege((prev) => { const s = new Set(prev); s.has(n.id) ? s.delete(n.id) : s.add(n.id); return s; })} />
                        <span>{nachtragNummer(n)} · {n.titel}</span>
                        <span className="ml-auto font-medium">{eur(n.betrag)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-[#1d1d1f] mb-1">Positionen der Rechnung</p>
              <ul className="divide-y divide-black/5 rounded-lg border border-black/10 text-xs">
                {positionen.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 px-3 py-2">
                    <span className="flex-1">{p.bezeichnung}</span>
                    <span className="whitespace-nowrap font-medium">{eur((Number(p.menge) || 0) * (Number(p.einzelpreis) || 0))}</span>
                  </li>
                ))}
                <li className="flex items-center gap-2 px-3 py-2 bg-[#f5f5f7] font-semibold">
                  <span className="flex-1">Summe netto (zzgl. MwSt.)</span>
                  <span>{eur(netto)}</span>
                </li>
              </ul>
              {projektDaten && daten === undefined && (
                <p className="text-[10px] text-[#86868b] mt-1">Grundlage: gespeicherter Stand des Auftrags.</p>
              )}
            </div>

            {brauchtBegruendung && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                <p className="text-[11px] text-amber-900">{brauchtBegruendung}</p>
                <input value={begruendung} onChange={(e) => setBegruendung(e.target.value)} placeholder="Begründung für die Überschreibung" className={inputCls} />
                <button onClick={() => begruendung.trim() && anlegen(begruendung.trim())} disabled={laeuft || !begruendung.trim()} className="rounded-lg bg-[#e8590c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Mit Begründung anlegen</button>
              </div>
            )}

            {fehler && <p className="text-xs text-red-600">❌ {fehler}</p>}
            <div className="flex gap-2">
              <button onClick={() => anlegen()} disabled={!kannAnlegen || !!brauchtBegruendung} className="flex-1 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 py-2 text-sm font-semibold text-white">
                {laeuft ? 'Legt an …' : `${art === 'schluss' ? 'Schlussrechnung' : 'Rechnung'} anlegen`}
              </button>
              <button onClick={onClose} className="rounded-lg bg-black/10 hover:bg-black/20 px-3 py-2 text-sm text-[#1d1d1f]">Abbrechen</button>
            </div>
            <p className="text-[10px] text-[#86868b]">Die Rechnung wird nur angelegt, nicht versendet. Versand bleibt ein eigener Schritt.</p>
          </>
        )}
      </div>
    </div>
  );
}
