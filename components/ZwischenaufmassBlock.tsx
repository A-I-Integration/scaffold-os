'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Ruler } from 'lucide-react';
import { parseBetrag } from '@/lib/nachtrag';
import { abschnitteAusSchritt2, berechneAufmass } from '@/lib/aufmassblatt-pdf';
import {
  type Zwischenaufmass, normalisiereZwischenaufmasse, neuesZwischenaufmass, loescheZwischenaufmass,
  neuesZwischenaufmassJePosition, zaZeilen, aktuellerStandJePosition, type ZaPositionEingabe,
  zwischenaufmassNr, neueMengeM2, aktuellerStandM2, restmengeM2, ueberabgerechnetM2, istRueckgang, bisherAbgerechneteM2,
} from '@/lib/zwischenaufmass';

// ============================================================
// SCAFFOLD OS – Zwischenaufmaß je Stichtag (Kundenseite, beim Auftrag)
// Kumuliertes Aufmaß: je Stichtag die GESAMT bis dahin gestellte Fläche.
// Abgerechnet wird nur die neue Menge – über „Rechnung aus Auftrag“ →
// Abschlagsrechnung → „nach Zwischenaufmaß“. Gespeichert in
// projects.data.zwischenaufmasse (bestehende PATCH-Route, kein SQL).
// ============================================================

interface Props {
  project: { id: string; name: string | null; adresse: string | null; data: any };
}

const heute = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (lokal)
const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const datumDe = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE'); };
const inputCls = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]';

export default function ZwischenaufmassBlock({ project }: Props) {
  const [liste, setListe] = useState<Zwischenaufmass[]>(() => normalisiereZwischenaufmasse(project.data?.zwischenaufmasse));
  const [offen, setOffen] = useState(false);
  const [form, setForm] = useState({ stichtag: heute(), flaeche: '', notiz: '' });
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const aufmassZeilen = useMemo(() => berechneAufmass(abschnitteAusSchritt2(project.data?.step2)).zeilen, [project.data]);
  const gesamtAufmass = useMemo(() => berechneAufmass(abschnitteAusSchritt2(project.data?.step2)).gesamtM2, [project.data]);
  const [modus, setModus] = useState<'flaeche' | 'positionen'>('flaeche');
  type Zeile = { bezeichnung: string; einheit: string; einzelpreis: string; menge: string };
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const leereZeile = (): Zeile => ({ bezeichnung: '', einheit: 'm²', einzelpreis: '', menge: '' });
  /** Vorbelegung: Positionen des letzten Zwischenaufmaßes (mit dem letzten Stand), sonst die Abschnitte des Aufmaßblatts. */
  function vorbelegen() {
    const stand = [...aktuellerStandJePosition(liste).values()];
    if (stand.length) return stand.map((p): Zeile => ({ bezeichnung: p.bezeichnung, einheit: p.einheit, einzelpreis: String(p.einzelpreis).replace('.', ','), menge: String(p.menge).replace('.', ',') }));
    const fp = String(project.data?.festpreisProM2 ?? '').replace('.', ',');
    const z = aufmassZeilen.map((a): Zeile => ({ bezeichnung: `Gerüst ${a.bezeichnung}`, einheit: 'm²', einzelpreis: project.data?.preisModus === 'festpreis' ? fp : '', menge: '' }));
    return z.length ? z : [leereZeile()];
  }
  function aufPositionen() { setModus('positionen'); setZeilen(vorbelegen()); setOffen(true); }
  const setZeile = (i: number, f: keyof Zeile, v: string) => setZeilen((l) => l.map((z, k) => (k === i ? { ...z, [f]: v } : z)));
  const letzte = aktuellerStandM2(liste);
  const abgerechnet = bisherAbgerechneteM2(liste);
  const rest = restmengeM2(liste);
  const ueber = ueberabgerechnetM2(liste);

  /** Frischen Stand lesen, ändern, zurückschreiben (ein veralteter Stand überschreibt nichts). */
  async function speichere(aendere: (aktuell: Zwischenaufmass[]) => Zwischenaufmass[]): Promise<Zwischenaufmass[]> {
    const gRes = await fetch(`/api/projects?id=${project.id}`);
    const gJson = await gRes.json();
    if (!gRes.ok || !gJson.success) throw new Error(gJson.error || 'Auftrag konnte nicht geladen werden');
    const neu = aendere(normalisiereZwischenaufmasse(gJson.project?.data?.zwischenaufmasse));
    const pRes = await fetch('/api/projects', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: project.id, data: { zwischenaufmasse: neu } }),
    });
    const pJson = await pRes.json().catch(() => ({}));
    if (!pRes.ok || pJson.success === false) throw new Error(pJson.error || 'Speichern fehlgeschlagen');
    setListe(neu);
    return neu;
  }

  async function anlegen() {
    const flaeche = parseBetrag(form.flaeche);
    setLaeuft(true); setMeldung(null);
    try {
      let fehler: string | null = null;
      await speichere((aktuell) => {
        const r = neuesZwischenaufmass(aktuell, { stichtag: form.stichtag, flaecheM2: flaeche, notiz: form.notiz }, crypto.randomUUID());
        if (!r.ok) { fehler = r.fehler; return aktuell; }
        return [...aktuell, r.eintrag];
      });
      if (fehler) { setMeldung({ ok: false, text: fehler }); return; }
      setForm({ stichtag: heute(), flaeche: '', notiz: '' });
      setOffen(false);
      setMeldung({ ok: true, text: 'Zwischenaufmaß gespeichert.' });
    } catch (e: any) {
      setMeldung({ ok: false, text: e?.message || 'Fehler beim Speichern' });
    } finally {
      setLaeuft(false);
    }
  }

  async function anlegenJePosition() {
    setLaeuft(true); setMeldung(null);
    try {
      let fehler: string | null = null;
      const eingabe: ZaPositionEingabe[] = zeilen.map((z) => ({ bezeichnung: z.bezeichnung, einheit: z.einheit, einzelpreis: parseBetrag(z.einzelpreis), menge: parseBetrag(z.menge) }));
      await speichere((aktuell) => {
        const r = neuesZwischenaufmassJePosition(aktuell, { stichtag: form.stichtag, positionen: eingabe, notiz: form.notiz }, crypto.randomUUID());
        if (!r.ok) { fehler = r.fehler; return aktuell; }
        return [...aktuell, r.eintrag];
      });
      if (fehler) { setMeldung({ ok: false, text: fehler }); return; }
      setForm({ stichtag: heute(), flaeche: '', notiz: '' }); setOffen(false); setModus('flaeche');
      setMeldung({ ok: true, text: 'Zwischenaufmaß gespeichert.' });
    } catch (e: any) { setMeldung({ ok: false, text: e?.message || 'Fehler beim Speichern' }); }
    finally { setLaeuft(false); }
  }

  async function loeschen(z: Zwischenaufmass) {
    if (z.rechnungId) return;
    if (!window.confirm(`Zwischenaufmaß ${zwischenaufmassNr(z)} wirklich löschen?`)) return;
    setLaeuft(true); setMeldung(null);
    try { await speichere((a) => loescheZwischenaufmass(a, z.id)); }
    catch (e: any) { setMeldung({ ok: false, text: e?.message || 'Fehler' }); }
    finally { setLaeuft(false); }
  }

  return (
    <div className="rounded-lg border border-black/10 bg-[#fafafa] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#1d1d1f] flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5 text-[#e8590c]" /> Zwischenaufmaß (kumuliert je Stichtag)</p>
        <span className="flex items-center gap-3">
          <button onClick={() => { setModus('flaeche'); setOffen((o) => !o) }} className="flex items-center gap-1 text-[11px] text-[#e8590c] font-semibold hover:underline">
            <Plus className="h-3 w-3" /> Gesamtfläche erfassen
          </button>
          <button onClick={aufPositionen} data-testid="za-je-position" className="flex items-center gap-1 text-[11px] text-[#e8590c] font-semibold hover:underline">
            <Plus className="h-3 w-3" /> Je Position erfassen
          </button>
        </span>
      </div>
      <p className="text-[11px] text-[#86868b]">Trage zum Stichtag die <b>gesamte</b> bis dahin gestellte Fläche ein. Abgerechnet wird nur die neue Menge seit dem letzten abgerechneten Stand. Abrechnung: „Rechnung aus Auftrag“ → Abschlagsrechnung → nach Zwischenaufmaß.</p>

      {liste.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-center text-[11px]" data-testid="za-bilanz">
          <div className="rounded-lg bg-white border border-black/10 p-2"><p className="text-[#86868b]">Aktueller Stand</p><p className="font-semibold text-[#1d1d1f]">{fmt(letzte)} m²</p></div>
          <div className="rounded-lg bg-white border border-black/10 p-2"><p className="text-[#86868b]">Abgerechnet</p><p className="font-semibold text-[#1d1d1f]">{fmt(abgerechnet)} m²</p></div>
          <div className="rounded-lg bg-white border border-black/10 p-2"><p className="text-[#86868b]">Noch offen</p><p className="font-semibold text-[#e8590c]">{fmt(rest)} m²</p></div>
        </div>
      )}
      {ueber > 0 && (
        <p className="text-[11px] text-red-600" data-testid="za-ueberabrechnung">⚠️ Es sind {fmt(ueber)} m² mehr abgerechnet, als aktuell gestellt sind (Rückbau/Korrektur). Bitte Gutschrift oder Korrektur der Abrechnung prüfen.</p>
      )}
      {liste.length === 0 ? (
        <p className="text-[11px] text-[#86868b]">Noch kein Zwischenaufmaß erfasst.</p>
      ) : (
        <ul className="divide-y divide-black/5 rounded-lg border border-black/10 bg-white text-xs">
          {liste.map((z) => (
            <li key={z.id} className="flex items-start gap-2 px-3 py-2">
              <div className="flex-1">
                <p className="font-medium text-[#1d1d1f]">{zwischenaufmassNr(z)} · Stichtag {datumDe(z.stichtag)} · kumuliert {fmt(z.flaecheM2)} m²{istRueckgang(z, liste) ? <span className="ml-1 text-amber-700">(Rückgang)</span> : null}</p>
                <p className="text-[11px] text-[#86868b]">
                  {z.rechnungId
                    ? `Abgerechnet mit ${z.rechnungNr || 'Rechnung'}${z.abgerechnetAm ? ` am ${datumDe(z.abgerechnetAm)}` : ''}`
                    : `Noch nicht abgerechnet · neue Menge ${fmt(Math.max(0, neueMengeM2(z, liste)))} m²`}
                  {z.notiz ? ` · ${z.notiz}` : ''}
                </p>
                {z.positionen && z.positionen.length > 0 && (
                  <table className="mt-1 w-full text-[11px] tabular-nums" data-testid="za-positionen">
                    <thead><tr className="text-left text-[#86868b]"><th className="font-normal">Position</th><th className="font-normal text-right">kumuliert</th><th className="font-normal text-right">schon abgerechnet</th><th className="font-normal text-right">neu</th></tr></thead>
                    <tbody>
                      {zaZeilen(z, liste).map((r) => (
                        <tr key={r.key} className={r.zuViel > 0 ? 'text-red-600' : ''}>
                          <td>{r.bezeichnung}</td><td className="text-right">{fmt(r.menge)} {r.einheit}</td><td className="text-right">{z.rechnungId ? "–" : fmt(r.bisher)}</td>
                          <td className="text-right">{z.rechnungId ? '–' : fmt(r.neu)}{r.zuViel > 0 ? ` (${fmt(r.zuViel)} zu viel abgerechnet)` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {!z.rechnungId && (
                <button onClick={() => loeschen(z)} disabled={laeuft} aria-label={`${zwischenaufmassNr(z)} löschen`} className="p-1 rounded hover:bg-black/5 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5 text-[#86868b]" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {offen && modus === 'positionen' && (
        <div className="rounded-lg bg-white border border-black/10 p-3 space-y-2" data-testid="za-form-positionen">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="block text-[11px] text-[#86868b] mb-1">Stichtag</label><input type="date" value={form.stichtag} onChange={(e) => setForm({ ...form, stichtag: e.target.value })} className={inputCls} /></div>
          </div>
          <p className="text-[11px] text-[#86868b]">Trage je Position die <b>gesamte</b> Menge bis zum Stichtag ein (kumuliert). Berechnet wird später nur die Differenz zur bereits abgerechneten Menge.</p>
          <div className="space-y-1">
            {zeilen.map((z, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_90px_100px_24px] gap-1">
                <input value={z.bezeichnung} onChange={(e) => setZeile(i, 'bezeichnung', e.target.value)} placeholder="Position" className={inputCls} aria-label="Position" />
                <input value={z.einheit} onChange={(e) => setZeile(i, 'einheit', e.target.value)} className={inputCls} aria-label="Einheit" />
                <input value={z.einzelpreis} onChange={(e) => setZeile(i, 'einzelpreis', e.target.value)} inputMode="decimal" placeholder="Preis netto" className={inputCls} aria-label="Preis netto" />
                <input value={z.menge} onChange={(e) => setZeile(i, 'menge', e.target.value)} inputMode="decimal" placeholder="Menge kumuliert" className={inputCls} aria-label="Menge kumuliert" />
                <button type="button" onClick={() => setZeilen((l) => l.filter((_, k) => k !== i))} aria-label="Zeile entfernen" className="p-1 rounded hover:bg-black/5"><Trash2 className="h-3.5 w-3.5 text-[#86868b]" /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setZeilen((l) => [...l, leereZeile()])} className="text-[11px] text-[#e8590c] font-semibold hover:underline">+ Position hinzufügen</button>
          <div><label className="block text-[11px] text-[#86868b] mb-1">Notiz / Grund (bei Rückgang Pflicht)</label><input value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} placeholder="z. B. Südfassade fertig" className={inputCls} /></div>
          <button onClick={anlegenJePosition} disabled={laeuft} className="rounded-lg bg-[#e8590c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{laeuft ? 'Speichert …' : 'Speichern'}</button>
        </div>
      )}
      {offen && modus === 'flaeche' && (
        <div className="rounded-lg bg-white border border-black/10 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#86868b] mb-1">Stichtag</label>
              <input type="date" value={form.stichtag} onChange={(e) => setForm({ ...form, stichtag: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] text-[#86868b] mb-1">Gesamtfläche bis Stichtag (m², kumuliert)</label>
              <input value={form.flaeche} onChange={(e) => setForm({ ...form, flaeche: e.target.value })} inputMode="decimal" placeholder="z. B. 350" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-[#86868b] mb-1">Notiz (optional)</label>
            <input value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} placeholder="z. B. Südfassade fertig" className={inputCls} />
          </div>
          <p className="text-[11px] text-[#86868b]">
            {letzte > 0 ? `Letzter Stand: ${fmt(letzte)} m². ` : ''}
            {gesamtAufmass > 0 ? `Gesamtaufmaß laut Aufmaßblatt: ${fmt(gesamtAufmass)} m².` : ''}
          </p>
          <button onClick={anlegen} disabled={laeuft} className="rounded-lg bg-[#e8590c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{laeuft ? 'Speichert …' : 'Speichern'}</button>
        </div>
      )}
      {meldung && <p className={`text-[11px] ${meldung.ok ? 'text-emerald-700' : 'text-red-600'}`}>{meldung.ok ? '✅' : '❌'} {meldung.text}</p>}
    </div>
  );
}
