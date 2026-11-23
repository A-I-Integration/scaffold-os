'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { fetchRechnungAnlegen } from '@/lib/rechnung-anlegen-client';
import {
  normalisiereVereinbarung, normalisierePerioden, vorhaltungStatus, vorhaltungStand, tageZwischen, plusTage, periodenPassen,
  type Vorhaltevereinbarung, type VorhaltePeriode,
} from '@/lib/vorhaltung';

// ============================================================
// SCAFFOLD OS – Vorhalteabrechnung nach Vertragsbedingungen (Faktura F8)
// Vereinbarung erfassen (Beginn, kostenlose Vorhaltezeit, Intervall, Preis, Teilabbau, Abbau), fälligen Zeitraum sehen und auf
// Bestätigung abrechnen. Nichts läuft automatisch nach Kalender. Der Server prüft Zeitraum und Beträge erneut und führt die
// berechneten Zeiträume unteilbar (keine Doppelabrechnung, auch nicht bei gleichzeitiger Bedienung).
// ============================================================

interface Props {
  project: { id: string; name: string | null; adresse: string | null; data: any };
  kunde?: { name: string; adresse?: string | null } | null;
}

const heute = () => new Date().toLocaleDateString('sv-SE');
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const de = (iso: string) => iso.split('-').reverse().join('.');
const inputCls = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]';

function vorbelegung(data: any): Vorhaltevereinbarung {
  const s1 = data?.step1 || {};
  const beginn = typeof s1.projektbeginn === 'string' ? s1.projektbeginn : '';
  const ende = typeof s1.projektende === 'string' ? s1.projektende : '';
  const frei = beginn && ende && ende > beginn ? tageZwischen(beginn, ende) : 0;
  const preis = Number(data?.angebotAnpassungen?.miete?.preisProWoche) || 0;
  return { aktiv: true, beginn, freiTage: frei, intervall: 'woche', preis, abrechnung: 'im_voraus', teilabbauten: [] };
}

export default function VorhaltungBlock({ project, kunde }: Props) {
  const [daten, setDaten] = useState<any>(project.data);
  const [offen, setOffen] = useState(false);
  const [form, setForm] = useState<Vorhaltevereinbarung>(() => normalisiereVereinbarung(project.data?.vorhaltung) || vorbelegung(project.data));
  const [grund, setGrund] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async () => {
    try {
      const j = await (await fetch(`/api/projects?id=${project.id}`)).json();
      if (j?.success && j.project?.data) setDaten(j.project.data);
    } catch { /* Anzeige bleibt auf dem zuletzt bekannten Stand */ }
  }, [project.id]);
  useEffect(() => { laden(); }, [laden]);

  const vereinbarung = useMemo(() => normalisiereVereinbarung(daten?.vorhaltung), [daten]);
  const perioden: VorhaltePeriode[] = useMemo(() => normalisierePerioden(daten?.vorhaltePerioden), [daten]);
  const status = useMemo(() => vorhaltungStatus(vereinbarung, perioden, heute()), [vereinbarung, perioden]);
  const passt = vereinbarung ? periodenPassen(vereinbarung, perioden) : true;
  const set = <K extends keyof Vorhaltevereinbarung>(k: K, v: Vorhaltevereinbarung[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (s: string) => Number(String(s).replace(',', '.')) || 0;
  const kostenpflichtigVorschau = form.beginn ? de(plusTage(form.beginn, form.freiTage)) : '–';

  async function speichern() {
    if (vereinbarung && !grund.trim()) { setMeldung({ ok: false, text: 'Bitte den Grund der Änderung eintragen (wird im Verlauf festgehalten).' }); return; }
    if (!form.beginn) { setMeldung({ ok: false, text: 'Bitte den Beginn der Vorhaltung angeben.' }); return; }
    if (!(form.preis > 0)) { setMeldung({ ok: false, text: 'Bitte den Preis je Intervall (netto) angeben.' }); return; }
    setLaeuft(true); setMeldung(null);
    try {
      const r = await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: project.id, data: { vorhaltung: form }, aenderungsgrund: grund.trim() || undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.success === false) throw new Error(j.error || 'Speichern fehlgeschlagen');
      await laden(); setOffen(false); setGrund('');
      setMeldung({ ok: true, text: 'Vorhalte-Vereinbarung gespeichert.' });
    } catch (e: any) { setMeldung({ ok: false, text: e?.message || 'Fehler beim Speichern' }); }
    finally { setLaeuft(false); }
  }

  async function abrechnen() {
    const f = status.faellig;
    if (!vereinbarung || !f) return;
    const text = `Vorhaltung ${de(f.von)} bis ${de(plusTage(f.bis, -1))}: ${eur(f.netto)} netto. Rechnung jetzt anlegen?`;
    if (!window.confirm(text)) return;
    setLaeuft(true); setMeldung(null);
    try {
      const res = await fetchRechnungAnlegen('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id, customer_name: kunde?.name || project.name || 'Kunde', customer_address: kunde?.adresse || project.adresse || undefined,
          invoice_type: 'standard', positions: f.positionen,
          vorhaltung: { von: f.von, bis: f.bis, stand: vorhaltungStand(vereinbarung, perioden) },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!j.success) throw new Error(j.error || 'Rechnung konnte nicht angelegt werden.');
      await laden();
      setMeldung(j.vorhaltung_warnung ? { ok: false, text: j.vorhaltung_warnung } : { ok: true, text: `Rechnung ${j.invoice?.invoice_number || ''} angelegt (noch nicht versendet).` });
    } catch (e: any) { setMeldung({ ok: false, text: e?.message || 'Fehler' }); await laden(); }
    finally { setLaeuft(false); }
  }

  const faellig = status.faellig;
  return (
    <div className="rounded-lg border border-black/10 bg-[#fafafa] p-3 space-y-2" data-testid="vorhaltung-block">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#1d1d1f] flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-[#e8590c]" /> Vorhaltung (nach Vereinbarung)</p>
        <button onClick={() => { setForm(vereinbarung || vorbelegung(daten)); setOffen((o) => !o); setMeldung(null); }} className="flex items-center gap-1 text-[11px] text-[#e8590c] font-semibold hover:underline" data-testid="vorhaltung-bearbeiten">
          <Plus className="h-3 w-3" /> {vereinbarung ? 'Vereinbarung ändern' : 'Vereinbarung erfassen'}
        </button>
      </div>
      {!vereinbarung && <p className="text-[11px] text-[#86868b]">Noch keine Vereinbarung. Ohne Vereinbarung läuft die bisherige Standzeit-Nachberechnung (Mietabrechnung). Mit Vereinbarung wird nur nach den hier erfassten Bedingungen und auf Ihre Bestätigung abgerechnet.</p>}

      {vereinbarung && (
        <div className="text-[11px] text-[#1d1d1f] space-y-0.5" data-testid="vorhaltung-status">
          <p>Beginn {vereinbarung.beginn ? de(vereinbarung.beginn) : '–'} · {vereinbarung.freiTage} Tage kostenlos · kostenpflichtig ab <b>{status.kostenpflichtigAb ? de(status.kostenpflichtigAb) : '–'}</b> · {eur(vereinbarung.preis)} je {vereinbarung.intervall === 'monat' ? 'Monat' : 'Woche'} ({vereinbarung.abrechnung === 'im_voraus' ? 'angefangenes Intervall voll' : 'nachträglich'}){vereinbarung.abbauDatum ? ` · Abbau ${de(vereinbarung.abbauDatum)}` : ''}{!vereinbarung.aktiv ? ' · inaktiv' : ''}</p>
          {vereinbarung.teilabbauten.map((t, i) => <p key={i} className="text-[#86868b]">Teilabbau {de(t.datum)}: {t.verbleibendProzent.toLocaleString('de-DE')} % bleiben stehen ({t.preisModus === 'voll' ? 'voller Preis' : t.preisModus === 'anteilig' ? 'Preis anteilig' : 'Preisberechnung fehlt'})</p>)}
          {(vereinbarung.preisStufen || []).map((st, i) => <p key={'s' + i} className="text-[#86868b]">Ab {de(st.ab)}: {eur(st.preis)} je Intervall</p>)}
          {status.hinweise.map((h, i) => <p key={i} className={/fehlt|passen nicht|endet in/.test(h) ? 'text-red-600' : 'text-[#e8590c]'}>{h}</p>)}
        </div>
      )}

      {faellig && (
        <div className="rounded-lg bg-white border border-black/10 p-2 space-y-1 text-[11px]" data-testid="vorhaltung-faellig">
          <p className="font-semibold text-[#1d1d1f]">Jetzt abrechenbar: {de(faellig.von)} bis {de(plusTage(faellig.bis, -1))}</p>
          {faellig.positionen.map((p, i) => <p key={i}>{p.bezeichnung}: {p.menge.toLocaleString('de-DE')} {p.einheit} × {eur(p.einzelpreis)}</p>)}
          <p className="font-semibold">Summe netto {eur(faellig.netto)}</p>
          <button onClick={abrechnen} disabled={laeuft || !passt} className="rounded-lg bg-[#e8590c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" data-testid="vorhaltung-abrechnen">{laeuft ? 'Legt an …' : 'Rechnung anlegen'}</button>
        </div>
      )}

      {perioden.length > 0 && (
        <ul className="divide-y divide-black/5 rounded-lg border border-black/10 bg-white text-[11px]" data-testid="vorhaltung-perioden">
          {perioden.map((p) => (
            <li key={p.id} className="px-3 py-1.5">{de(p.von)} bis {de(plusTage(p.bis, -1))} · {p.intervalle} Intervall(e) · {eur(p.netto)} · {p.rechnungId ? `Rechnung ${p.rechnungNr || ''}` : 'wird gerade abgerechnet'}</li>
          ))}
        </ul>
      )}

      {offen && (
        <div className="rounded-lg bg-white border border-black/10 p-3 space-y-2" data-testid="vorhaltung-form">
          <label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={form.aktiv} onChange={(e) => set('aktiv', e.target.checked)} /> Vereinbarung aktiv (ersetzt die automatische Standzeit-Nachberechnung für diesen Auftrag)</label>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="block text-[11px] text-[#86868b] mb-1">Beginn der Vorhaltung (z. B. Aufbaudatum)</label><input type="date" value={form.beginn} onChange={(e) => set('beginn', e.target.value)} className={inputCls} aria-label="Beginn der Vorhaltung" /></div>
            <div><label className="block text-[11px] text-[#86868b] mb-1">Kostenlose Vorhaltezeit (Tage)</label><input value={String(form.freiTage)} onChange={(e) => set('freiTage', Math.max(0, Math.round(num(e.target.value))))} inputMode="numeric" className={inputCls} aria-label="Kostenlose Vorhaltezeit in Tagen" /></div>
            <div><label className="block text-[11px] text-[#86868b] mb-1">Abrechnungsintervall</label><select value={form.intervall} onChange={(e) => set('intervall', e.target.value as 'woche' | 'monat')} className={inputCls} aria-label="Abrechnungsintervall"><option value="woche">Woche</option><option value="monat">Monat</option></select></div>
            <div><label className="block text-[11px] text-[#86868b] mb-1">Preis je Intervall (netto, volles Gerüst)</label><input value={form.preis ? String(form.preis).replace('.', ',') : ''} onChange={(e) => set('preis', num(e.target.value))} inputMode="decimal" placeholder="z. B. 250" className={inputCls} aria-label="Preis je Intervall" /></div>
            <div><label className="block text-[11px] text-[#86868b] mb-1">Abrechnung</label><select value={form.abrechnung} onChange={(e) => set('abrechnung', e.target.value as 'im_voraus' | 'nachtraeglich')} className={inputCls} aria-label="Abrechnungsart"><option value="im_voraus">Angefangenes Intervall sofort voll</option><option value="nachtraeglich">Erst nach Ablauf des Intervalls</option></select></div>
            <div><label className="block text-[11px] text-[#86868b] mb-1">Vollständiger Abbau am (optional)</label><input type="date" value={form.abbauDatum || ''} onChange={(e) => set('abbauDatum', e.target.value || undefined)} className={inputCls} aria-label="Datum des vollständigen Abbaus" /></div>
          </div>
          <p className="text-[11px] text-[#86868b]">Kostenpflichtig ab: <b>{kostenpflichtigVorschau}</b></p>
          <div className="space-y-1">
            <p className="text-[11px] text-[#86868b]">Teilabbau (ab dem Datum zählt nur noch der Restbestand):</p>
            {form.teilabbauten.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_1fr_24px] gap-1">
                <input type="date" value={t.datum} onChange={(e) => set('teilabbauten', form.teilabbauten.map((x, k) => (k === i ? { ...x, datum: e.target.value } : x)))} className={inputCls} aria-label="Datum Teilabbau" />
                <input value={String(t.verbleibendProzent).replace('.', ',')} onChange={(e) => set('teilabbauten', form.teilabbauten.map((x, k) => (k === i ? { ...x, verbleibendProzent: Math.min(100, Math.max(0, num(e.target.value))) } : x)))} inputMode="decimal" className={inputCls} aria-label="Verbleibender Anteil in Prozent" />
                <select value={t.preisModus || ''} onChange={(e) => set('teilabbauten', form.teilabbauten.map((x, k) => (k === i ? { ...x, preisModus: (e.target.value || undefined) as 'anteilig' | 'voll' | undefined } : x)))} className={inputCls} aria-label="Preisberechnung beim Teilabbau"><option value="">Preis laut Vereinbarung wählen …</option><option value="anteilig">Preis anteilig zum Restbestand</option><option value="voll">Voller Preis bleibt</option></select>
                <button type="button" onClick={() => set('teilabbauten', form.teilabbauten.filter((_, k) => k !== i))} aria-label="Teilabbau entfernen" className="p-1 rounded hover:bg-black/5"><Trash2 className="h-3.5 w-3.5 text-[#86868b]" /></button>
              </div>
            ))}
            <button type="button" onClick={() => set('teilabbauten', [...form.teilabbauten, { datum: heute(), verbleibendProzent: 50 }])} className="text-[11px] text-[#e8590c] font-semibold hover:underline">+ Teilabbau hinzufügen</button>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-[#86868b]">Preisänderung (gilt erst ab dem Datum; bereits berechnete Zeiträume bleiben unverändert):</p>
            {(form.preisStufen || []).map((st, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_24px] gap-1">
                <input type="date" value={st.ab} onChange={(e) => set('preisStufen', (form.preisStufen || []).map((x, k) => (k === i ? { ...x, ab: e.target.value } : x)))} className={inputCls} aria-label="Preis gilt ab" />
                <input value={st.preis ? String(st.preis).replace('.', ',') : ''} onChange={(e) => set('preisStufen', (form.preisStufen || []).map((x, k) => (k === i ? { ...x, preis: num(e.target.value) } : x)))} inputMode="decimal" className={inputCls} aria-label="Neuer Preis je Intervall" />
                <button type="button" onClick={() => set('preisStufen', (form.preisStufen || []).filter((_, k) => k !== i))} aria-label="Preisänderung entfernen" className="p-1 rounded hover:bg-black/5"><Trash2 className="h-3.5 w-3.5 text-[#86868b]" /></button>
              </div>
            ))}
            <button type="button" onClick={() => set('preisStufen', [...(form.preisStufen || []), { ab: heute(), preis: form.preis }])} className="text-[11px] text-[#e8590c] font-semibold hover:underline">+ Preisänderung ab Datum</button>
          </div>
          {vereinbarung && <div><label className="block text-[11px] text-[#86868b] mb-1">Grund der Änderung (Pflicht, steht im Verlauf)</label><input value={grund} onChange={(e) => setGrund(e.target.value)} className={inputCls} aria-label="Grund der Änderung" /></div>}
          <button onClick={speichern} disabled={laeuft} className="rounded-lg bg-[#e8590c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{laeuft ? 'Speichert …' : 'Speichern'}</button>
        </div>
      )}
      {meldung && <p className={`text-[11px] ${meldung.ok ? 'text-emerald-700' : 'text-red-600'}`}>{meldung.ok ? '✅' : '❌'} {meldung.text}</p>}
    </div>
  );
}
