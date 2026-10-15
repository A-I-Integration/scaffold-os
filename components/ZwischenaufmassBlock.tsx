'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Ruler } from 'lucide-react';
import { parseBetrag } from '@/lib/nachtrag';
import { abschnitteAusSchritt2, berechneAufmass } from '@/lib/aufmassblatt-pdf';
import {
  type Zwischenaufmass, normalisiereZwischenaufmasse, neuesZwischenaufmass, loescheZwischenaufmass,
  zwischenaufmassNr, neueMengeM2, letzteKumulierteFlaeche,
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

  const gesamtAufmass = useMemo(() => berechneAufmass(abschnitteAusSchritt2(project.data?.step2)).gesamtM2, [project.data]);
  const letzte = letzteKumulierteFlaeche(liste);

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
        <button onClick={() => setOffen((o) => !o)} className="flex items-center gap-1 text-[11px] text-[#e8590c] font-semibold hover:underline">
          <Plus className="h-3 w-3" /> Zwischenaufmaß erfassen
        </button>
      </div>
      <p className="text-[11px] text-[#86868b]">Trage zum Stichtag die <b>gesamte</b> bis dahin gestellte Fläche ein. Abgerechnet wird nur die neue Menge seit dem letzten abgerechneten Stand. Abrechnung: „Rechnung aus Auftrag“ → Abschlagsrechnung → nach Zwischenaufmaß.</p>

      {liste.length === 0 ? (
        <p className="text-[11px] text-[#86868b]">Noch kein Zwischenaufmaß erfasst.</p>
      ) : (
        <ul className="divide-y divide-black/5 rounded-lg border border-black/10 bg-white text-xs">
          {liste.map((z) => (
            <li key={z.id} className="flex items-start gap-2 px-3 py-2">
              <div className="flex-1">
                <p className="font-medium text-[#1d1d1f]">{zwischenaufmassNr(z)} · Stichtag {datumDe(z.stichtag)} · kumuliert {fmt(z.flaecheM2)} m²</p>
                <p className="text-[11px] text-[#86868b]">
                  {z.rechnungId
                    ? `Abgerechnet mit ${z.rechnungNr || 'Rechnung'}${z.abgerechnetAm ? ` am ${datumDe(z.abgerechnetAm)}` : ''}`
                    : `Noch nicht abgerechnet · neue Menge ${fmt(Math.max(0, neueMengeM2(z, liste)))} m²`}
                  {z.notiz ? ` · ${z.notiz}` : ''}
                </p>
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

      {offen && (
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
