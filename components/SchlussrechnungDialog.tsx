'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Receipt } from 'lucide-react';
import { normalisiereNachtraege, nachtragNummer, type Nachtrag } from '@/lib/nachtrag';
import { abschnitteAusSchritt2, berechneAufmass } from '@/lib/aufmassblatt-pdf';
import {
  baueRechnungsPositionen, eingabeAusProjektData, summeNetto, abschlagAbzug, baueAbzugsPositionen, abzugsHinweis, istAbzugZuHoch, istAbschlagZuHoch,
  type RechnungsBasis, type RechnungsEingabe,
} from '@/lib/schlussrechnung';
import type { Invoice } from '@/lib/invoice-pdf';
import { normalisiereZwischenaufmasse, baueTeilleistungsPosition, markiereAbgerechnet, zwischenaufmassNr, neueMengeM2, type Zwischenaufmass } from '@/lib/zwischenaufmass';

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
  /** Optional: Rechnungsart und Prozentwert vorbelegen (z. B. Teilrechnung aus der Auftragsübersicht). */
  startArt?: 'schluss' | 'standard' | 'abschlag';
  startProzent?: number;
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
}

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const inputCls = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]';

export default function SchlussrechnungDialog({ projectId, customerName, customerAddress, daten, startArt, startProzent, onClose, onCreated }: Props) {
  const [laden, setLaden] = useState(true);
  const [fehlerLaden, setFehlerLaden] = useState('');
  const [projektDaten, setProjektDaten] = useState<any>(null);
  const [nachtraege, setNachtraege] = useState<Nachtrag[]>([]);
  const [kranTagessatz, setKranTagessatz] = useState(850);
  const [firmenPreisM2, setFirmenPreisM2] = useState('');
  const [bestehende, setBestehende] = useState<Invoice[]>([]);
  const [abschlagKandidaten, setAbschlagKandidaten] = useState<Invoice[]>([]);
  const [gewaehlteAbschlaege, setGewaehlteAbschlaege] = useState<Set<string>>(new Set());

  const [basis, setBasis] = useState<RechnungsBasis>('angebot');
  const [art, setArt] = useState<'schluss' | 'standard' | 'abschlag'>(startArt ?? 'schluss');
  const [abschlagProzent, setAbschlagProzent] = useState(startProzent ? String(startProzent).replace('.', ',') : '');
  const [abschlagBetrag, setAbschlagBetrag] = useState('');
  const [zwischenaufmasse, setZwischenaufmasse] = useState<Zwischenaufmass[]>([]);
  const [abschlagModus, setAbschlagModus] = useState<'betrag' | 'zwischenaufmass'>('betrag');
  const [gewaehltesZA, setGewaehltesZA] = useState('');
  const [preisM2, setPreisM2] = useState('');
  const [gewaehlteNachtraege, setGewaehlteNachtraege] = useState<Set<string>>(new Set());

  const [laeuft, setLaeuft] = useState(false);
  const [angelegt, setAngelegt] = useState(false);
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
        const za = normalisiereZwischenaufmasse(pRes.project?.data?.zwischenaufmasse);
        setZwischenaufmasse(za);
        const offen = za.filter((z) => !z.rechnungId);
        if (offen.length > 0) setGewaehltesZA(offen[offen.length - 1].id);
        setGewaehlteNachtraege(new Set(n.map((x) => x.id)));
        if (cRes?.success && cRes.company) {
          setKranTagessatz(Number(cRes.company.calc_crane_day) || 850);
          const f = cRes.company.calc_festpreis_pro_m2;
          if (f != null && f !== '') setFirmenPreisM2(String(f));
        }
        if (iRes?.success) {
          const alle: Invoice[] = iRes.invoices || [];
          setBestehende(alle.filter((i) => i.project_id === projectId && i.status !== 'storniert'));
          // Abschlagsrechnungen dieses Auftrags (§ 14 Abs. 5 UStG: in der Endrechnung abzusetzen);
          // Abschläge ohne Auftragszuordnung nur bei gleichem Kundennamen und nie vorausgewählt.
          const kn = customerName.trim().toLowerCase();
          const kand = alle.filter((i) => i.invoice_type === 'abschlag' && i.status !== 'storniert'
            && (i.project_id === projectId || (!i.project_id && i.customer_name.trim().toLowerCase() === kn)));
          setAbschlagKandidaten(kand);
          setGewaehlteAbschlaege(new Set(kand
            .filter((i) => i.project_id === projectId)
            .map((i) => abschlagAbzug(i))
            .filter((a) => a.abziehbar && a.gezahlt)
            .map((a) => a.id)));
        }
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

  const leistungsPositionen = useMemo(() => {
    if (!eingabe) return [];
    return baueRechnungsPositionen({
      eingabe, basis, aufmassM2, aufmassPreisProM2: preisM2Zahl,
      nachtraege: nachtraege.filter((n) => gewaehlteNachtraege.has(n.id)),
    });
  }, [eingabe, basis, aufmassM2, preisM2Zahl, nachtraege, gewaehlteNachtraege]);
  // Abzug bereits gestellter Abschlagsrechnungen – nur bei der Schlussrechnung
  const abzuege = useMemo(
    () => (art === 'schluss' ? abschlagKandidaten.filter((i) => gewaehlteAbschlaege.has(i.id)).map((i) => abschlagAbzug(i)) : []),
    [art, abschlagKandidaten, gewaehlteAbschlaege],
  );
  const gesamtNetto = summeNetto(leistungsPositionen);
  // Abschlagsrechnung: Betrag netto direkt ODER Prozent der Gesamtleistung (netto)
  const zahl = (v: string) => parseFloat(String(v).replace(',', '.')) || 0;
  const zaModus = art === 'abschlag' && abschlagModus === 'zwischenaufmass';
  const zaAuswahl = zwischenaufmasse.find((z) => z.id === gewaehltesZA) || null;
  const teilleistung = useMemo(
    () => (zaModus && zaAuswahl ? baueTeilleistungsPosition({ z: zaAuswahl, liste: zwischenaufmasse, preisProM2: preisM2Zahl }) : { position: null, fehler: null }),
    [zaModus, zaAuswahl, zwischenaufmasse, preisM2Zahl],
  );
  const abschlagNetto = art !== 'abschlag' ? 0
    : zaModus ? Math.round((teilleistung.position ? teilleistung.position.menge * teilleistung.position.einzelpreis : 0) * 100) / 100
    : zahl(abschlagBetrag) > 0 ? Math.round(zahl(abschlagBetrag) * 100) / 100
    : Math.round(gesamtNetto * zahl(abschlagProzent)) / 100;
  const abschlagZuHoch = art === 'abschlag' && !zaModus && istAbschlagZuHoch(abschlagNetto, gesamtNetto);
  const positionen = useMemo(() => {
    if (zaModus) return teilleistung.position ? [teilleistung.position] : [];
    if (art === 'abschlag') {
      if (abschlagNetto <= 0) return [];
      const pct = zahl(abschlagBetrag) > 0 ? '' : ` (${zahl(abschlagProzent).toLocaleString('de-DE')} % der Gesamtleistung)`;
      return [{ bezeichnung: `Abschlagszahlung Gerüstbau${pct}`, menge: 1, einheit: 'Pauschale', einzelpreis: abschlagNetto }];
    }
    return [...leistungsPositionen, ...baueAbzugsPositionen(abzuege)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art, zaModus, teilleistung, abschlagNetto, abschlagBetrag, abschlagProzent, leistungsPositionen, abzuege]);
  const netto = summeNetto(positionen);
  const abzugNetto = Math.round(abzuege.reduce((s, a) => s + a.netto, 0) * 100) / 100;
  const ustRest = Math.round(netto * 19) / 100;
  const abzugsText = art === 'abschlag' ? 'Abschlagszahlung; die Verrechnung erfolgt in der Schlussrechnung.' : abzugsHinweis(gesamtNetto, abzuege);

  const hatAngebotspreis = !!eingabe?.kiResult;
  const aufmassMoeglich = aufmassM2 > 0;
  const basisOk = basis === 'angebot' ? hatAngebotspreis : aufmassMoeglich && preisM2Zahl > 0;
  // Abschlag mit festem Betrag braucht keine Kalkulationsbasis, mit Prozent schon
  const kannAnlegen = !laeuft && !angelegt && positionen.length > 0 && netto > 0 && !abschlagZuHoch
    && (zaModus ? !!teilleistung.position : art === 'abschlag' && zahl(abschlagBetrag) > 0 ? true : basisOk);

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
          notes: [eingabe.anpassungen?.skonto ? '2% Skonto bei Zahlung innerhalb von 8 Tagen.' : '', abzugsText || ''].filter(Boolean).join(' ') || undefined,
          positions: positionen,
          override_grund: overrideGrund || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!json.success) {
        if (json.code === 'FREIGABE_FEHLT_OVERRIDE_MOEGLICH') { setBrauchtBegruendung(json.error); return; }
        throw new Error(json.error || 'Rechnung konnte nicht angelegt werden.');
      }
      let warnung = '';
      if (zaModus && zaAuswahl && json.invoice?.id) {
        // Zwischenaufmaß als abgerechnet markieren (frisch lesen, damit nichts überschrieben wird)
        try {
          const fr = await fetch(`/api/projects?id=${projectId}`).then((r) => r.json());
          const liste = normalisiereZwischenaufmasse(fr?.project?.data?.zwischenaufmasse);
          const neu = markiereAbgerechnet(liste, zaAuswahl.id, { id: json.invoice.id, nummer: json.invoice.invoice_number || '' }, new Date().toISOString().slice(0, 10));
          const pr = await fetch('/api/projects', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: projectId, data: { zwischenaufmasse: neu } }),
          }).then((r) => r.json());
          if (!pr?.success) throw new Error(pr?.error || 'unbekannt');
        } catch (e: any) {
          warnung = `Die Rechnung ${json.invoice.invoice_number || ''} wurde angelegt, aber ${zwischenaufmassNr(zaAuswahl)} konnte nicht als abgerechnet markiert werden (${e?.message || 'Fehler'}). Bitte NICHT erneut anlegen, sonst wird doppelt berechnet.`;
        }
      }
      onCreated(json.invoice);
      if (warnung) { setAngelegt(true); setFehler(warnung); return; }
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
                <p className="mt-1">Nur <b>Abschlagsrechnungen</b> kannst du unten abziehen. Andere bereits abgerechnete Leistungen werden hier <b>nicht</b> automatisch abgezogen. Bitte prüfen, dass nichts doppelt berechnet wird.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-[#86868b] mb-1">Rechnungsart</label>
                <select value={art} onChange={(e) => setArt(e.target.value as 'schluss' | 'standard' | 'abschlag')} className={inputCls}>
                  <option value="abschlag">Abschlagsrechnung</option>
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

            {art === 'abschlag' && (
              <div className="rounded-lg bg-[#f5f5f7] p-3 space-y-2">
                {zwischenaufmasse.length > 0 && (
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">Berechnung</label>
                    <select value={abschlagModus} onChange={(e) => setAbschlagModus(e.target.value as 'betrag' | 'zwischenaufmass')} className={inputCls}>
                      <option value="betrag">Betrag oder Prozent</option>
                      <option value="zwischenaufmass">Nach Zwischenaufmaß (nur neue Menge)</option>
                    </select>
                  </div>
                )}
                {zaModus ? (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[11px] text-[#86868b] mb-1">Zwischenaufmaß</label>
                      <select value={gewaehltesZA} onChange={(e) => setGewaehltesZA(e.target.value)} className={inputCls}>
                        {zwischenaufmasse.map((z) => (
                          <option key={z.id} value={z.id} disabled={!!z.rechnungId}>
                            {zwischenaufmassNr(z)} · {new Date(z.stichtag + 'T12:00:00').toLocaleDateString('de-DE')} · {z.flaecheM2.toLocaleString('de-DE')} m² kumuliert{z.rechnungId ? ` · schon abgerechnet (${z.rechnungNr || ''})` : ` · neu ${neueMengeM2(z, zwischenaufmasse).toLocaleString('de-DE')} m²`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#86868b] mb-1">Preis je m² netto (€)</label>
                      <input value={preisM2} onChange={(e) => setPreisM2(e.target.value)} inputMode="decimal" placeholder="z. B. 8,50" className={inputCls} />
                    </div>
                    {teilleistung.fehler && <p className="text-xs text-red-600">{teilleistung.fehler}</p>}
                    {teilleistung.position && (
                      <p className="text-xs text-[#1d1d1f]">{teilleistung.position.menge.toLocaleString('de-DE')} m² × {eur(teilleistung.position.einzelpreis)} = <b>{eur(abschlagNetto)}</b> netto</p>
                    )}
                  </div>
                ) : (<>
                <p className="text-[11px] text-[#86868b]">Eine Abschlagsrechnung gehört zu diesem Auftrag. In der Schlussrechnung wird sie später automatisch netto abgezogen (§ 14 Abs. 5 UStG). Gib entweder einen Betrag oder Prozent der Gesamtleistung an.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">Betrag netto (€)</label>
                    <input value={abschlagBetrag} onChange={(e) => setAbschlagBetrag(e.target.value)} inputMode="decimal" placeholder="z. B. 3000" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">oder Prozent der Gesamtleistung</label>
                    <input value={abschlagProzent} onChange={(e) => setAbschlagProzent(e.target.value)} inputMode="decimal" placeholder="z. B. 30" disabled={zahl(abschlagBetrag) > 0} className={inputCls + (zahl(abschlagBetrag) > 0 ? ' opacity-50' : '')} />
                  </div>
                </div>
                {zahl(abschlagBetrag) <= 0 && zahl(abschlagProzent) > 0 && (
                  <p className="text-xs text-[#1d1d1f]">Gesamtleistung netto {eur(gesamtNetto)} × {zahl(abschlagProzent).toLocaleString('de-DE')} % = <b>{eur(abschlagNetto)}</b> netto</p>
                )}
                {abschlagZuHoch && (
                  <p className="text-xs text-red-600">Der Abschlag ist höher als die Gesamtleistung (netto {eur(gesamtNetto)}). Bitte Betrag oder Prozent prüfen.</p>
                )}
                </>)}
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

            {art === 'schluss' && abschlagKandidaten.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#1d1d1f] mb-1">Abschlagsrechnungen abziehen</p>
                <p className="text-[11px] text-[#86868b] mb-1">Abgezogen wird netto, die Umsatzsteuer wird nur auf den Restbetrag berechnet (§ 14 Abs. 5 UStG). Vorausgewählt sind bezahlte Abschläge.</p>
                <ul className="space-y-1">
                  {abschlagKandidaten.map((i) => {
                    const a = abschlagAbzug(i);
                    const ohneAuftrag = i.project_id !== projectId;
                    return (
                      <li key={i.id}>
                        <label className={`flex items-center gap-2 text-xs ${a.abziehbar ? 'cursor-pointer' : 'opacity-60'}`}>
                          <input type="checkbox" disabled={!a.abziehbar} checked={gewaehlteAbschlaege.has(i.id)}
                            onChange={() => setGewaehlteAbschlaege((prev) => { const s = new Set(prev); s.has(i.id) ? s.delete(i.id) : s.add(i.id); return s; })} />
                          <span>
                            {i.invoice_number} · {a.teilweise ? 'teilweise bezahlt' : a.gezahlt ? 'bezahlt' : 'noch nicht bezahlt'}
                            {ohneAuftrag ? ' · ohne Auftragszuordnung, bitte prüfen' : ''}
                            {!a.abziehbar ? ' · anderer Steuersatz, nicht abziehbar' : ''}
                          </span>
                          <span className="ml-auto font-medium">− {eur(a.netto)} netto</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {abzuege.some((a) => !a.gezahlt) && (
                  <p className="text-[11px] text-red-600 mt-1">Ein ausgewählter Abschlag ist noch nicht bezahlt. Nach § 14 Abs. 5 UStG werden vereinnahmte Beträge abgezogen. Bitte mit dem Steuerberater klären.</p>
                )}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-[#1d1d1f] mb-1">Positionen der Rechnung</p>
              <ul className="divide-y divide-black/5 rounded-lg border border-black/10 text-xs">
                {positionen.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 px-3 py-2">
                    <span className="flex-1">{p.bezeichnung}</span>
                    <span className="whitespace-nowrap font-medium">{eur((Number(p.menge) || 0) * (Number(p.einzelpreis) || 0))}</span>
                  </li>
                ))}
                {abzuege.length > 0 && (
                  <li className="flex items-center gap-2 px-3 py-2 text-[#86868b]">
                    <span className="flex-1">Gesamtleistung netto {eur(gesamtNetto)}, abzüglich Abschläge netto {eur(abzugNetto)}</span>
                  </li>
                )}
                <li className="flex items-center gap-2 px-3 py-2 bg-[#f5f5f7] font-semibold">
                  <span className="flex-1">Summe netto (zzgl. MwSt.)</span>
                  <span>{eur(netto)}</span>
                </li>
                {(abzuege.length > 0 || art === 'abschlag') && (
                  <>
                    <li className="flex items-center gap-2 px-3 py-2"><span className="flex-1">{art === 'abschlag' ? 'zzgl. 19 % USt' : 'zzgl. 19 % USt auf den Restbetrag'}</span><span>{eur(ustRest)}</span></li>
                    <li className="flex items-center gap-2 px-3 py-2 font-semibold"><span className="flex-1">{art === 'abschlag' ? 'Abschlag brutto' : 'Restbetrag brutto'}</span><span>{eur(Math.round((netto + ustRest) * 100) / 100)}</span></li>
                  </>
                )}
              </ul>
              {istAbzugZuHoch(gesamtNetto, abzuege) && (
                <p className="text-xs text-red-600 mt-1">Der Abzug ist so hoch wie oder höher als die Gesamtleistung. Bitte Auswahl prüfen (bei Überzahlung wäre eine Gutschrift nötig).</p>
              )}
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
                {laeuft ? 'Legt an …' : `${art === 'schluss' ? 'Schlussrechnung' : art === 'abschlag' ? 'Abschlagsrechnung' : 'Rechnung'} anlegen`}
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
