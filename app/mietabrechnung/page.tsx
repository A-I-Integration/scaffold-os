'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Euro, Loader2, AlertTriangle, Info } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Mietabrechnung (automatische Standzeit-Nachberechnung)
//
// Logik: Ein Projekt mit Status „active" und projektende in der
// Vergangenheit → das Gerüst steht länger als vereinbart → es
// entsteht Miete pro angefangener Woche.
//
// • Wochenpreis wird aus dem Angebot vorbefüllt (Schritt 6:
//   „Länger mieten" → Preis/Woche), ist aber pro Projekt änderbar.
// • „Nachberechnung erstellen" legt eine fertige Rechnung an
//   (Position: Mietverlängerung X Wo. à Y €) und merkt sich im
//   Projekt data.mietAbgerechnetBis = heute → bereits abgerechnete
//   Wochen tauchen nicht doppelt auf.
// • „Abgebaut" setzt das Projekt auf completed → raus aus der Liste.
// Keine Schema-Änderung nötig (nutzt projects.data).
// ============================================================

interface Projekt {
  id: string;
  name: string;
  adresse: string | null;
  status: string;
  data: any;
}

interface MietZeile {
  projekt: Projekt;
  kunde: string;
  ende: string;               // geplantes Standzeit-Ende (ISO)
  abgerechnetBis: string;     // ab hier läuft die Nachberechnung
  tageUeber: number;
  wochen: number;
  preisProWoche: string;      // Eingabefeld (Komma erlaubt)
}

const MS_TAG = 1000 * 60 * 60 * 24;

function heuteIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoNachDeutsch(iso: string): string {
  const [j, m, t] = iso.split('-').map(Number);
  return `${String(t).padStart(2, '0')}.${String(m).padStart(2, '0')}.${j}`;
}

function plusTageIso(iso: string, tage: number): string {
  const [j, m, t] = iso.split('-').map(Number);
  const d = new Date(j, m - 1, t + tage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseZahl(v: string): number {
  const n = Number(v.trim().replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function eur(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function MietabrechnungPage() {
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState('');
  const [ueberzogen, setUeberzogen] = useState<MietZeile[]>([]);
  const [endetBald, setEndetBald] = useState<MietZeile[]>([]);
  const [beschaeftigt, setBeschaeftigt] = useState<string | null>(null);
  const [meldung, setMeldung] = useState('');

  const lade = useCallback(async () => {
    setLaden(true);
    setFehler('');
    try {
      const res = await fetch('/api/projects', { cache: 'no-store' });
      const antwort = await res.json();
      if (!res.ok) throw new Error(antwort.error || 'Projekte konnten nicht geladen werden.');
      const projekte: Projekt[] = antwort.projects || antwort || [];
      const heute = heuteIso();

      const ueber: MietZeile[] = [];
      const bald: MietZeile[] = [];

      for (const p of projekte) {
        if (p.status !== 'active') continue;
        const s1 = p.data?.step1 || {};
        const ende: string | undefined = s1.projektende;
        if (!ende || !/^\d{4}-\d{2}-\d{2}$/.test(ende)) continue;

        const kunde = s1.name || p.name || '–';
        const mietePreis = p.data?.angebotAnpassungen?.miete?.preisProWoche;
        const vorschlag = mietePreis ? String(mietePreis).replace('.', ',') : '';
        const tageBisEnde = Math.floor((new Date(ende + 'T12:00:00').getTime() - new Date(heute + 'T12:00:00').getTime()) / MS_TAG);

        if (tageBisEnde < 0) {
          // Überzogen: Nachberechnung läuft ab projektende bzw. ab letzter Abrechnung
          const abgerechnetBis = p.data?.mietAbgerechnetBis && p.data.mietAbgerechnetBis > ende
            ? p.data.mietAbgerechnetBis
            : ende;
          const tageUeber = Math.floor((new Date(heute + 'T12:00:00').getTime() - new Date(abgerechnetBis + 'T12:00:00').getTime()) / MS_TAG);
          if (tageUeber < 1) continue; // heute bereits abgerechnet
          ueber.push({
            projekt: p, kunde, ende, abgerechnetBis, tageUeber,
            wochen: Math.ceil(tageUeber / 7),
            preisProWoche: vorschlag,
          });
        } else if (tageBisEnde <= 14) {
          bald.push({
            projekt: p, kunde, ende, abgerechnetBis: ende,
            tageUeber: 0, wochen: 0, preisProWoche: vorschlag,
          });
        }
      }
      ueber.sort((a, b) => b.tageUeber - a.tageUeber);
      bald.sort((a, b) => a.ende.localeCompare(b.ende));
      setUeberzogen(ueber);
      setEndetBald(bald);
    } catch (e: any) {
      setFehler(e.message || 'Fehler beim Laden.');
    }
    setLaden(false);
  }, []);

  useEffect(() => { lade(); }, [lade]);

  async function nachberechnung(zeile: MietZeile) {
    const preis = parseZahl(zeile.preisProWoche);
    if (preis <= 0) {
      setFehler(`Bitte bei „${zeile.projekt.name}" einen Wochenpreis eintragen.`);
      return;
    }
    setBeschaeftigt(zeile.projekt.id);
    setFehler('');
    setMeldung('');
    const heute = heuteIso();
    try {
      // 1) Rechnung anlegen
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: zeile.projekt.id,
          customer_name: zeile.kunde,
          customer_address: zeile.projekt.adresse || undefined,
          due_date: plusTageIso(heute, 14),
          notes: `Miet-Nachberechnung: Standzeit „${zeile.projekt.name}" war am ${isoNachDeutsch(zeile.abgerechnetBis)} überschritten.`,
          positions: [{
            bezeichnung: `Mietverlängerung ${zeile.projekt.name} – ${zeile.wochen} Wo. über Standzeit (ab ${isoNachDeutsch(zeile.abgerechnetBis)})`,
            menge: zeile.wochen,
            einheit: 'Wo.',
            einzelpreis: preis,
          }],
        }),
      });
      const antwort = await res.json();
      if (!res.ok) throw new Error(antwort.error || 'Rechnung konnte nicht angelegt werden.');

      // 2) Im Projekt merken, bis wann abgerechnet wurde (verhindert Doppelabrechnung)
      const patch = await fetch('/api/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: zeile.projekt.id, data: { mietAbgerechnetBis: heute } }),
      });
      if (!patch.ok) {
        const p = await patch.json().catch(() => ({}));
        throw new Error('Rechnung erstellt, aber Merker fehlgeschlagen: ' + (p.error || patch.status));
      }

      setMeldung(`✅ Rechnung ${antwort.invoice?.invoice_number || ''} für ${zeile.kunde} erstellt (${eur(zeile.wochen * preis)} netto).`);
      setUeberzogen((liste) => liste.filter((z) => z.projekt.id !== zeile.projekt.id));
    } catch (e: any) {
      setFehler(e.message || 'Fehler bei der Nachberechnung.');
    }
    setBeschaeftigt(null);
  }

  async function abgebaut(zeile: MietZeile) {
    if (!window.confirm(`„${zeile.projekt.name}" als abgebaut/abschlossen markieren? Das Gerüst steht dann nicht mehr in der Miete.`)) return;
    setBeschaeftigt(zeile.projekt.id);
    setFehler('');
    setMeldung('');
    try {
      const res = await fetch('/api/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: zeile.projekt.id, status: 'completed' }),
      });
      const antwort = await res.json();
      if (!res.ok) throw new Error(antwort.error || 'Status konnte nicht geändert werden.');
      setMeldung(`✅ ${zeile.kunde}: Projekt abgeschlossen.`);
      setUeberzogen((liste) => liste.filter((z) => z.projekt.id !== zeile.projekt.id));
      setEndetBald((liste) => liste.filter((z) => z.projekt.id !== zeile.projekt.id));
    } catch (e: any) {
      setFehler(e.message || 'Fehler beim Abschließen.');
    }
    setBeschaeftigt(null);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-3">
        <Euro className="w-7 h-7 text-[#e8590c]" /> Mietabrechnung
      </h1>
      <p className="mt-2 text-[#6e6e73] leading-relaxed max-w-3xl">
        Steht ein Gerüst länger als vereinbart, entsteht Miete pro angefangener Woche.
        Überzogene Projekte erscheinen hier <strong>automatisch</strong> – ein Klick erstellt
        die Nachberechnung als fertige Rechnung. Bereits abgerechnete Wochen werden
        nicht doppelt berechnet.
      </p>

      {fehler && (
        <p className="mt-5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {fehler}
        </p>
      )}
      {meldung && (
        <p className="mt-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3">
          {meldung}
        </p>
      )}

      {laden ? (
        <p className="mt-10 text-[#86868b] flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Projekte werden geprüft …
        </p>
      ) : (
        <>
          {/* ─── Überzogene Standzeiten ─── */}
          <h2 className="mt-10 text-lg font-semibold tracking-tight">
            Überzogene Standzeiten
            {ueberzogen.length > 0 && (
              <span className="ml-2 rounded-full bg-[#e8590c] text-white text-xs font-bold px-2.5 py-1 align-middle">
                {ueberzogen.length}
              </span>
            )}
          </h2>
          {ueberzogen.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-white border border-black/5 p-8 text-center text-[#6e6e73]">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
              Keine überzogenen Standzeiten – alles im Plan.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {ueberzogen.map((z) => (
                <div key={z.projekt.id} className="rounded-2xl bg-white border border-black/5 shadow-sm p-5">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div className="min-w-[200px] flex-1">
                      <p className="font-semibold">{z.projekt.name}</p>
                      <p className="text-sm text-[#86868b]">{z.kunde}{z.projekt.adresse ? ` · ${z.projekt.adresse}` : ''}</p>
                    </div>
                    <div className="text-sm">
                      <p className="text-[#86868b]">Ende geplant</p>
                      <p className="font-medium">{isoNachDeutsch(z.ende)}</p>
                    </div>
                    <div className="text-sm">
                      <p className="text-[#86868b]">Überzogen</p>
                      <p className="font-semibold text-[#e8590c]">
                        {z.tageUeber} {z.tageUeber === 1 ? 'Tag' : 'Tage'} = {z.wochen} Wo.
                      </p>
                    </div>
                    <label className="text-sm">
                      <span className="block text-[#86868b]">Preis / Woche</span>
                      <input
                        value={z.preisProWoche}
                        onChange={(e) =>
                          setUeberzogen((liste) => liste.map((x) => x.projekt.id === z.projekt.id ? { ...x, preisProWoche: e.target.value } : x))
                        }
                        inputMode="decimal"
                        placeholder="z. B. 180,00"
                        className="mt-1 w-28 rounded-lg border border-black/10 px-3 py-2 outline-none focus:ring-2 focus:ring-[#e8590c]/40"
                      />
                    </label>
                    <div className="text-sm">
                      <p className="text-[#86868b]">Betrag (netto)</p>
                      <p className="font-semibold">{eur(z.wochen * parseZahl(z.preisProWoche))}</p>
                    </div>
                    <div className="flex gap-2 ml-auto">
                      <button
                        onClick={() => nachberechnung(z)}
                        disabled={beschaeftigt === z.projekt.id}
                        className="rounded-full bg-[#e8590c] hover:bg-[#d14e06] disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 transition flex items-center gap-2"
                      >
                        {beschaeftigt === z.projekt.id && <Loader2 className="w-4 h-4 animate-spin" />}
                        Nachberechnung erstellen
                      </button>
                      <button
                        onClick={() => abgebaut(z)}
                        disabled={beschaeftigt === z.projekt.id}
                        className="rounded-full border border-black/15 hover:border-black/40 text-sm font-semibold px-4 py-2.5 transition"
                      >
                        Abgebaut
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── Endet in Kürze ─── */}
          <h2 className="mt-10 text-lg font-semibold tracking-tight">Standzeit endet in den nächsten 14 Tagen</h2>
          {endetBald.length === 0 ? (
            <p className="mt-3 text-sm text-[#86868b]">Keine Projekte mit bald endender Standzeit.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {endetBald.map((z) => (
                <div key={z.projekt.id} className="rounded-2xl bg-white border border-black/5 px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <p className="font-medium min-w-[180px] flex-1">{z.projekt.name}</p>
                  <p className="text-sm text-[#86868b]">{z.kunde}</p>
                  <p className="text-sm">endet <strong>{isoNachDeutsch(z.ende)}</strong></p>
                  <button
                    onClick={() => abgebaut(z)}
                    disabled={beschaeftigt === z.projekt.id}
                    className="ml-auto rounded-full border border-black/15 hover:border-black/40 text-sm font-semibold px-4 py-2 transition"
                  >
                    Abgebaut
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="mt-8 text-xs text-[#86868b] flex items-start gap-2 leading-relaxed">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Grundlage: Aufmaß Schritt 1 (Projektbeginn/-ende). Projekte ohne Enddatum erscheinen hier nicht.
            Der Wochenpreis wird aus dem Angebot (Schritt 6, „Länger mieten") vorbefüllt und lässt sich pro
            Nachberechnung anpassen. Die Rechnung liegt danach unter „Rechnungen" mit Status „offen".
          </p>
        </>
      )}
    </div>
  );
}
