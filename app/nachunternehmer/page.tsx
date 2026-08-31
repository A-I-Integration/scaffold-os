'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Handshake, Plus, Save, X, Trash2, Printer, CheckCheck, AlertTriangle,
} from 'lucide-react';
import { fmtEur } from '@/lib/invoice-pdf';

// ============================================================
// SCAFFOLD OS – Nachunternehmer (Reiter für Admin + Disposition)
//
// • Sub-Stammdaten mit Rahmenvertrag-Preisen (m², Regie, Anfahrt)
// • Nachweis-Ampel: Freistellung §48b EStG, Unbedenklichkeits-
//   bescheinigung, Haftpflicht (Nachunternehmerhaftung)
// • Leistungserfassung pro Baustelle: m² Montage/Demontage,
//   Regiestunden (mit Stundenzettel-Flag, VOB/B § 15), Anfahrt
// • Monatsabrechnung mit Sicherheitseinbehalt, als abgerechnet
//   markieren, drucken
//
// Rechte werden zusätzlich in /api/nachunternehmer* erzwungen.
// ============================================================

interface Sub {
  id: string;
  firma: string;
  ansprechpartner: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  ust_idnr: string | null;
  steuernummer: string | null;
  preis_m2_montage: number | null;
  preis_m2_demontage: number | null;
  stundensatz_regie: number | null;
  anfahrt_pauschale: number | null;
  sicherheitseinbehalt_prozent: number | null;
  gutschrift_verfahren: boolean | null;
  freistellung_bis: string | null;
  unbedenklichkeit_bis: string | null;
  haftpflicht_bis: string | null;
  notizen: string | null;
  is_active: boolean;
}

interface Eintrag {
  id: string;
  subcontractor_id: string;
  project_id: string | null;
  project_name: string | null;
  datum: string;
  art: 'montage_m2' | 'demontage_m2' | 'regie_stunden' | 'anfahrt';
  menge: number;
  einheitspreis: number;
  betrag: number;
  stundenzettel: boolean;
  bemerkung: string | null;
  status: 'offen' | 'abgerechnet';
}

interface Projekt {
  id: string;
  name: string;
  status: string;
}

const ART_LABEL: Record<string, string> = {
  montage_m2: 'Montage (m²)',
  demontage_m2: 'Demontage (m²)',
  regie_stunden: 'Regie (Std.)',
  anfahrt: 'Anfahrt',
};

const ART_EINHEIT: Record<string, string> = {
  montage_m2: 'm²',
  demontage_m2: 'm²',
  regie_stunden: 'Std.',
  anfahrt: 'psch.',
};

const LEER_SUB = {
  firma: '', ansprechpartner: '', email: '', phone: '',
  street: '', zip: '', city: '', ust_idnr: '', steuernummer: '',
  preis_m2_montage: '', preis_m2_demontage: '', stundensatz_regie: '',
  anfahrt_pauschale: '', sicherheitseinbehalt_prozent: '',
  gutschrift_verfahren: false,
  freistellung_bis: '', unbedenklichkeit_bis: '', haftpflicht_bis: '',
  notizen: '',
};

const heuteISO = () => new Date().toISOString().slice(0, 10);
const aktuellerMonat = () => new Date().toISOString().slice(0, 7);

// Nachweis-Ampel: frühestes Ablaufdatum bestimmt die Farbe
function nachweisAmpel(s: Sub): 'grau' | 'gruen' | 'gelb' | 'rot' {
  const daten = [s.freistellung_bis, s.unbedenklichkeit_bis, s.haftpflicht_bis].filter(Boolean) as string[];
  if (!daten.length) return 'grau';
  const heute = heuteISO();
  const in31 = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (daten.some((d) => d < heute)) return 'rot';
  if (daten.some((d) => d < in31)) return 'gelb';
  return 'gruen';
}

const AMPEL_CLS: Record<string, string> = {
  rot: 'bg-red-500',
  gelb: 'bg-amber-400',
  gruen: 'bg-emerald-500',
  grau: 'bg-black/20',
};

const AMPEL_TEXT: Record<string, string> = {
  rot: 'Nachweis abgelaufen!',
  gelb: 'Nachweis läuft bald ab',
  gruen: 'Nachweise gültig',
  grau: 'Keine Nachweise hinterlegt',
};

export default function NachunternehmerPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrationFehlt, setMigrationFehlt] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [neu, setNeu] = useState(false);
  const [form, setForm] = useState({ ...LEER_SUB });
  const [saving, setSaving] = useState(false);

  const [monat, setMonat] = useState(aktuellerMonat());
  const [eintragForm, setEintragForm] = useState({
    datum: heuteISO(), art: 'montage_m2', menge: '', einheitspreis: '',
    project_id: '', bemerkung: '', stundenzettel: false,
  });

  const inputCls =
    'w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]';

  // ─── Laden ───
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, pRes] = await Promise.all([
        fetch('/api/nachunternehmer'),
        fetch('/api/projects'),
      ]);
      const sJson = await sRes.json();
      if (!sJson.success) {
        if (sJson.error === 'NACHUNTERNEHMER_MIGRATION_FEHLT') {
          setMigrationFehlt(true);
        } else {
          throw new Error(sJson.error || 'Nachunternehmer konnten nicht geladen werden');
        }
      } else {
        setSubs(sJson.nachunternehmer || []);
      }
      const pJson = await pRes.json();
      if (pJson.success) setProjekte(pJson.projects || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadEintraege = useCallback(async (subId: string, m: string) => {
    try {
      const res = await fetch(`/api/nachunternehmer-eintraege?sub=${subId}&monat=${m}`);
      const json = await res.json();
      if (json.success) setEintraege(json.eintraege || []);
    } catch { /* Einträge sind optional – Liste bleibt leer */ }
  }, []);

  useEffect(() => {
    if (selectedId) loadEintraege(selectedId, monat);
  }, [selectedId, monat, loadEintraege]);

  const selected = subs.find((s) => s.id === selectedId) || null;

  function formAusSub(s: Sub) {
    const n = (v: number | null) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
    return {
      firma: s.firma || '',
      ansprechpartner: s.ansprechpartner || '',
      email: s.email || '',
      phone: s.phone || '',
      street: s.street || '',
      zip: s.zip || '',
      city: s.city || '',
      ust_idnr: s.ust_idnr || '',
      steuernummer: s.steuernummer || '',
      preis_m2_montage: n(s.preis_m2_montage),
      preis_m2_demontage: n(s.preis_m2_demontage),
      stundensatz_regie: n(s.stundensatz_regie),
      anfahrt_pauschale: n(s.anfahrt_pauschale),
      sicherheitseinbehalt_prozent: n(s.sicherheitseinbehalt_prozent),
      gutschrift_verfahren: !!s.gutschrift_verfahren,
      freistellung_bis: s.freistellung_bis || '',
      unbedenklichkeit_bis: s.unbedenklichkeit_bis || '',
      haftpflicht_bis: s.haftpflicht_bis || '',
      notizen: s.notizen || '',
    };
  }

  function selectSub(s: Sub) {
    setSelectedId(s.id);
    setNeu(false);
    setForm(formAusSub(s));
  }

  function neuAnlegen() {
    setSelectedId(null);
    setNeu(true);
    setForm({ ...LEER_SUB });
    setEintraege([]);
  }

  // Rahmenvertrag-Preis je Leistungsart (Vorschlag für den Eintrag)
  function preisFuer(art: string, s: Sub | null): string {
    if (!s) return '';
    const map: Record<string, number | null> = {
      montage_m2: s.preis_m2_montage,
      demontage_m2: s.preis_m2_demontage,
      regie_stunden: s.stundensatz_regie,
      anfahrt: s.anfahrt_pauschale,
    };
    const v = map[art];
    return v ? String(v).replace('.', ',') : '';
  }

  // ─── Speichern: Sub ───
  async function saveSub() {
    if (!form.firma.trim()) { alert('❌ Firma ist Pflicht.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/nachunternehmer', {
        method: neu ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(neu ? { ...form } : { id: selectedId, updates: { ...form } }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Speichern fehlgeschlagen');
      await load();
      if (json.eintrag?.id) setSelectedId(json.eintrag.id);
      setNeu(false);
      alert(neu ? '✅ Nachunternehmer angelegt!' : '✅ Gespeichert!');
    } catch (err: any) {
      alert('❌ ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleAktiv(s: Sub) {
    try {
      const res = await fetch('/api/nachunternehmer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, updates: { is_active: !s.is_active } }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      await load();
    } catch (err: any) {
      alert('❌ ' + err.message);
    }
  }

  // ─── Eintrag anlegen ───
  async function saveEintrag() {
    if (!selectedId) return;
    if (!eintragForm.menge || !eintragForm.einheitspreis) {
      alert('❌ Menge und Einheitspreis sind Pflicht.');
      return;
    }
    if (eintragForm.art === 'regie_stunden' && !eintragForm.stundenzettel) {
      if (!confirm('Regiestunden OHNE unterschriebenen Stundenlohnzettel (VOB/B § 15) erfassen? Die Abrechnung wird diesen Eintrag als Risiko markieren.')) return;
    }
    setSaving(true);
    try {
      const projekt = projekte.find((p) => p.id === eintragForm.project_id);
      const res = await fetch('/api/nachunternehmer-eintraege', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...eintragForm,
          subcontractor_id: selectedId,
          project_id: eintragForm.project_id || null,
          project_name: projekt?.name || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Eintrag fehlgeschlagen');
      setEintragForm({
        datum: heuteISO(), art: eintragForm.art, menge: '', einheitspreis: '',
        project_id: '', bemerkung: '', stundenzettel: false,
      });
      await loadEintraege(selectedId, monat);
    } catch (err: any) {
      alert('❌ ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function loescheEintrag(id: string) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    try {
      const res = await fetch('/api/nachunternehmer-eintraege', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      if (selectedId) await loadEintraege(selectedId, monat);
    } catch (err: any) {
      alert('❌ ' + err.message);
    }
  }

  // ─── Monatsabrechnung ───
  const abrechnung = useMemo(() => {
    const gruppen: Record<string, { menge: number; betrag: number }> = {};
    let zwischensumme = 0;
    let regieOhneZettel = 0;
    for (const e of eintraege) {
      if (!gruppen[e.art]) gruppen[e.art] = { menge: 0, betrag: 0 };
      gruppen[e.art].menge += Number(e.menge);
      gruppen[e.art].betrag += Number(e.betrag);
      zwischensumme += Number(e.betrag);
      if (e.art === 'regie_stunden' && !e.stundenzettel) regieOhneZettel++;
    }
    const einbehaltProzent = Number(selected?.sicherheitseinbehalt_prozent) || 0;
    const einbehalt = Math.round(zwischensumme * einbehaltProzent) / 100;
    return {
      gruppen,
      zwischensumme,
      einbehaltProzent,
      einbehalt,
      gesamt: zwischensumme - einbehalt,
      regieOhneZettel,
      offene: eintraege.filter((e) => e.status === 'offen').length,
    };
  }, [eintraege, selected]);

  async function monatAbrechnen() {
    if (!selectedId || !abrechnung.offene) return;
    if (!confirm(`Alle ${abrechnung.offene} offenen Einträge von ${monat} als abgerechnet markieren?`)) return;
    try {
      const res = await fetch('/api/nachunternehmer-eintraege', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subcontractor_id: selectedId, monat, status: 'abgerechnet' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      await loadEintraege(selectedId, monat);
      alert(`✅ ${json.geaendert} Einträge als abgerechnet markiert.`);
    } catch (err: any) {
      alert('❌ ' + err.message);
    }
  }

  const gefiltert = subs;

  return (
    <div className="min-h-screen bg-[#fbfbfd] p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Kopf */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Handshake className="h-8 w-8 text-[#e8590c]" />
            <div>
              <h1 className="text-2xl font-bold text-[#1d1d1f]">Nachunternehmer</h1>
              <p className="text-sm text-[#86868b]">
                {subs.length} Subunternehmer · Abrechnung nach m², Regiestunden und Anfahrt
              </p>
            </div>
          </div>
          <button
            onClick={neuAnlegen}
            className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            <Plus className="h-4 w-4" /> Neuer Nachunternehmer
          </button>
        </div>

        {/* Hinweis, falls die Migration noch fehlt */}
        {migrationFehlt && (
          <div className="rounded-xl border border-[#e8590c]/40 bg-[#e8590c]/10 p-4 text-sm text-amber-800">
            <strong>Nachunternehmer-Tabellen fehlen auf dieser Instanz.</strong> Bitte einmal die Datei{' '}
            <code className="bg-black/10 px-1 rounded">migration-nachunternehmer.sql</code>{' '}
            im Supabase SQL-Editor dieser Instanz ausführen – danach funktioniert dieser Reiter.
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700">
            Fehler: {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* ─── Linke Spalte: Liste ─── */}
          <div className="md:col-span-1 space-y-3">
            <div className="bg-[#f5f5f7] rounded-xl border border-blue-500/20 overflow-hidden">
              {loading ? (
                <p className="p-6 text-[#86868b] text-sm">Lade Nachunternehmer…</p>
              ) : gefiltert.length === 0 ? (
                <p className="p-6 text-[#86868b] text-sm">
                  Noch keine Nachunternehmer. Lege oben den ersten an und hinterlege die Rahmenvertrag-Preise.
                </p>
              ) : (
                <ul className="divide-y divide-black/5">
                  {gefiltert.map((s) => {
                    const ampel = nachweisAmpel(s);
                    const aktiv = s.id === selectedId;
                    return (
                      <li key={s.id}>
                        <button
                          onClick={() => selectSub(s)}
                          className={`w-full text-left px-4 py-3 transition-colors ${
                            aktiv ? 'bg-[#e8590c]/10 border-l-4 border-[#e8590c]' : 'hover:bg-black/5 border-l-4 border-transparent'
                          } ${!s.is_active ? 'opacity-50' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm text-[#1d1d1f] truncate">{s.firma}</span>
                            <span
                              className={`h-2.5 w-2.5 rounded-full shrink-0 ${AMPEL_CLS[ampel]}`}
                              title={AMPEL_TEXT[ampel]}
                            />
                          </div>
                          <p className="text-xs text-[#86868b] truncate">
                            {[s.ansprechpartner, s.city].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="text-[11px] text-[#86868b] px-1">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1" />Nachweise gültig ·{' '}
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400 mr-1" />läuft ab ·{' '}
              <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-1" />abgelaufen
            </p>
          </div>

          {/* ─── Rechte Spalte: Detail ─── */}
          <div className="md:col-span-2 space-y-6">
            {!selected && !neu ? (
              <div className="bg-[#f5f5f7] rounded-xl border border-blue-500/20 p-10 text-center text-[#86868b] text-sm">
                Wähle links einen Nachunternehmer – oder lege oben einen neuen an.
              </div>
            ) : (
              <>
                {/* Stammdaten + Rahmenvertrag */}
                <div className="bg-[#f5f5f7] rounded-xl border border-blue-500/20 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-[#1d1d1f]">
                      {neu ? 'Neuer Nachunternehmer' : form.firma}
                    </h2>
                    {!neu && selected && (
                      <button
                        onClick={() => toggleAktiv(selected)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-black/10 hover:bg-black/20 text-[#1d1d1f] transition-colors"
                      >
                        {selected.is_active ? 'Deaktivieren' : 'Aktivieren'}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[#86868b]">Firma *</label>
                      <input className={inputCls} value={form.firma}
                        onChange={(e) => setForm({ ...form, firma: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-[#86868b]">Ansprechpartner</label>
                      <input className={inputCls} value={form.ansprechpartner}
                        onChange={(e) => setForm({ ...form, ansprechpartner: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-[#86868b]">E-Mail</label>
                      <input className={inputCls} type="email" value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-[#86868b]">Telefon</label>
                      <input className={inputCls} value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-[#86868b]">Straße</label>
                      <input className={inputCls} value={form.street}
                        onChange={(e) => setForm({ ...form, street: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-[#86868b]">PLZ</label>
                        <input className={inputCls} value={form.zip}
                          onChange={(e) => setForm({ ...form, zip: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-[#86868b]">Ort</label>
                        <input className={inputCls} value={form.city}
                          onChange={(e) => setForm({ ...form, city: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-[#86868b]">USt-IdNr.</label>
                      <input className={inputCls} value={form.ust_idnr}
                        onChange={(e) => setForm({ ...form, ust_idnr: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-[#86868b]">Steuernummer</label>
                      <input className={inputCls} value={form.steuernummer}
                        onChange={(e) => setForm({ ...form, steuernummer: e.target.value })} />
                    </div>
                  </div>

                  {/* Rahmenvertrag-Preise */}
                  <div className="border-t border-black/10 pt-4">
                    <h3 className="text-sm font-semibold text-[#1d1d1f] mb-2">Rahmenvertrag · Einheitspreise (netto)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-[#86868b]">Montage €/m²</label>
                        <input className={inputCls} inputMode="decimal" value={form.preis_m2_montage}
                          onChange={(e) => setForm({ ...form, preis_m2_montage: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs text-[#86868b]">Demontage €/m²</label>
                        <input className={inputCls} inputMode="decimal" value={form.preis_m2_demontage}
                          onChange={(e) => setForm({ ...form, preis_m2_demontage: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs text-[#86868b]">Regie €/Std.</label>
                        <input className={inputCls} inputMode="decimal" value={form.stundensatz_regie}
                          onChange={(e) => setForm({ ...form, stundensatz_regie: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs text-[#86868b]">Anfahrt pauschal €</label>
                        <input className={inputCls} inputMode="decimal" value={form.anfahrt_pauschale}
                          onChange={(e) => setForm({ ...form, anfahrt_pauschale: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs text-[#86868b]">Sicherheitseinbehalt %</label>
                        <input className={inputCls} inputMode="decimal" value={form.sicherheitseinbehalt_prozent}
                          onChange={(e) => setForm({ ...form, sicherheitseinbehalt_prozent: e.target.value })} />
                      </div>
                      <div className="col-span-2 md:col-span-3 flex items-end pb-1">
                        <label className="flex items-center gap-2 text-sm text-[#1d1d1f]">
                          <input
                            type="checkbox"
                            checked={form.gutschrift_verfahren}
                            onChange={(e) => setForm({ ...form, gutschrift_verfahren: e.target.checked })}
                            className="h-4 w-4 accent-[#e8590c]"
                          />
                          Gutschriftverfahren vereinbart (§ 14 Abs. 2 UStG)
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Nachweise */}
                  <div className="border-t border-black/10 pt-4">
                    <h3 className="text-sm font-semibold text-[#1d1d1f] mb-1">Nachweise (Nachunternehmerhaftung)</h3>
                    <p className="text-[11px] text-[#86868b] mb-2">
                      Ohne gültige Nachweise haftet euer Betrieb u. a. für Mindestlohn, Sozialabgaben
                      und Steuerabzug des Nachunternehmers.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-[#86868b]">Freistellung § 48b EStG bis</label>
                        <input className={inputCls} type="date" value={form.freistellung_bis}
                          onChange={(e) => setForm({ ...form, freistellung_bis: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs text-[#86868b]">Unbedenklichkeitsbescheinigung bis</label>
                        <input className={inputCls} type="date" value={form.unbedenklichkeit_bis}
                          onChange={(e) => setForm({ ...form, unbedenklichkeit_bis: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs text-[#86868b]">Betriebshaftpflicht bis</label>
                        <input className={inputCls} type="date" value={form.haftpflicht_bis}
                          onChange={(e) => setForm({ ...form, haftpflicht_bis: e.target.value })} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-[#86868b]">Notizen</label>
                    <textarea className={inputCls} rows={2} value={form.notizen}
                      onChange={(e) => setForm({ ...form, notizen: e.target.value })} />
                  </div>

                  <div className="flex justify-end gap-2">
                    {!neu && (
                      <button
                        onClick={() => selected && selectSub(selected)}
                        className="flex items-center gap-2 rounded-xl bg-black/10 hover:bg-black/20 px-4 py-2 text-sm font-semibold text-[#1d1d1f] transition-colors"
                      >
                        <X className="h-4 w-4" /> Verwerfen
                      </button>
                    )}
                    <button
                      onClick={saveSub}
                      disabled={saving}
                      className="flex items-center gap-2 rounded-xl bg-[#e8590c] hover:bg-[#d64f09] disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
                    >
                      <Save className="h-4 w-4" /> {saving ? 'Speichere…' : 'Speichern'}
                    </button>
                  </div>
                </div>

                {/* Leistungserfassung + Abrechnung */}
                {selected && (
                  <div className="bg-[#f5f5f7] rounded-xl border border-blue-500/20 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="font-bold text-[#1d1d1f]">Leistungserfassung & Abrechnung</h2>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-[#86868b]">Monat</label>
                        <input
                          type="month"
                          value={monat}
                          onChange={(e) => setMonat(e.target.value)}
                          className={inputCls + ' !w-auto'}
                        />
                      </div>
                    </div>

                    {/* Neuer Eintrag */}
                    <div className="rounded-xl border border-black/10 bg-white/50 p-4 space-y-3">
                      <p className="text-sm font-semibold text-[#1d1d1f]">Leistung erfassen</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs text-[#86868b]">Datum</label>
                          <input className={inputCls} type="date" value={eintragForm.datum}
                            onChange={(e) => setEintragForm({ ...eintragForm, datum: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs text-[#86868b]">Art</label>
                          <select
                            className={inputCls}
                            value={eintragForm.art}
                            onChange={(e) => setEintragForm({
                              ...eintragForm,
                              art: e.target.value as Eintrag['art'],
                              einheitspreis: preisFuer(e.target.value, selected),
                            })}
                          >
                            <option value="montage_m2">Montage (m²)</option>
                            <option value="demontage_m2">Demontage (m²)</option>
                            <option value="regie_stunden">Regie (Std.)</option>
                            <option value="anfahrt">Anfahrt</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-[#86868b]">Menge ({ART_EINHEIT[eintragForm.art]})</label>
                          <input className={inputCls} inputMode="decimal" value={eintragForm.menge}
                            onChange={(e) => setEintragForm({ ...eintragForm, menge: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs text-[#86868b]">Einheitspreis €</label>
                          <input className={inputCls} inputMode="decimal" value={eintragForm.einheitspreis}
                            onChange={(e) => setEintragForm({ ...eintragForm, einheitspreis: e.target.value })} />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-[#86868b]">Baustelle</label>
                          <select
                            className={inputCls}
                            value={eintragForm.project_id}
                            onChange={(e) => setEintragForm({ ...eintragForm, project_id: e.target.value })}
                          >
                            <option value="">– ohne Projekt –</option>
                            {projekte.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-[#86868b]">Bemerkung</label>
                          <input className={inputCls} value={eintragForm.bemerkung}
                            onChange={(e) => setEintragForm({ ...eintragForm, bemerkung: e.target.value })} />
                        </div>
                      </div>
                      {eintragForm.art === 'regie_stunden' && (
                        <label className="flex items-center gap-2 text-sm text-[#1d1d1f]">
                          <input
                            type="checkbox"
                            checked={eintragForm.stundenzettel}
                            onChange={(e) => setEintragForm({ ...eintragForm, stundenzettel: e.target.checked })}
                            className="h-4 w-4 accent-[#e8590c]"
                          />
                          Stundenlohnzettel vom Auftraggeber unterschrieben (VOB/B § 15)
                        </label>
                      )}
                      <div className="flex justify-end">
                        <button
                          onClick={saveEintrag}
                          disabled={saving}
                          className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
                        >
                          <Plus className="h-4 w-4" /> Erfassen
                        </button>
                      </div>
                    </div>

                    {/* Einträge des Monats */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-[#86868b] border-b border-black/10">
                            <th className="py-2 pr-2">Datum</th>
                            <th className="py-2 pr-2">Art</th>
                            <th className="py-2 pr-2">Baustelle</th>
                            <th className="py-2 pr-2 text-right">Menge</th>
                            <th className="py-2 pr-2 text-right">EP €</th>
                            <th className="py-2 pr-2 text-right">Betrag €</th>
                            <th className="py-2 pr-2">Status</th>
                            <th className="py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {eintraege.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-6 text-center text-[#86868b]">
                                Keine Einträge in {monat}.
                              </td>
                            </tr>
                          ) : (
                            eintraege.map((e) => (
                              <tr key={e.id} className="border-b border-black/5">
                                <td className="py-2 pr-2 whitespace-nowrap">
                                  {new Date(e.datum + 'T00:00:00').toLocaleDateString('de-DE')}
                                </td>
                                <td className="py-2 pr-2 whitespace-nowrap">
                                  {ART_LABEL[e.art]}
                                  {e.art === 'regie_stunden' && !e.stundenzettel && (
                                    <span title="Ohne unterschriebenen Stundenlohnzettel">
                                      <AlertTriangle className="inline h-3.5 w-3.5 text-amber-500 ml-1" />
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 pr-2 max-w-[140px] truncate">{e.project_name || '—'}</td>
                                <td className="py-2 pr-2 text-right">
                                  {Number(e.menge).toLocaleString('de-DE')} {ART_EINHEIT[e.art]}
                                </td>
                                <td className="py-2 pr-2 text-right">{fmtEur(Number(e.einheitspreis))}</td>
                                <td className="py-2 pr-2 text-right font-semibold">{fmtEur(Number(e.betrag))}</td>
                                <td className="py-2 pr-2">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    e.status === 'abgerechnet'
                                      ? 'bg-emerald-500/20 text-emerald-700'
                                      : 'bg-amber-500/20 text-[#e8590c]'
                                  }`}>
                                    {e.status === 'abgerechnet' ? 'abgerechnet' : 'offen'}
                                  </span>
                                </td>
                                <td className="py-2 text-right">
                                  {e.status === 'offen' && (
                                    <button
                                      onClick={() => loescheEintrag(e.id)}
                                      className="text-[#86868b] hover:text-red-500 transition-colors"
                                      title="Eintrag löschen"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Summen / Abrechnung */}
                    {eintraege.length > 0 && (
                      <div className="rounded-xl border border-black/10 bg-white/50 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-[#1d1d1f]">Abrechnung {monat} (netto)</p>
                          <button
                            onClick={() => window.print()}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-black/10 hover:bg-black/20 text-[#1d1d1f] transition-colors"
                          >
                            <Printer className="h-3.5 w-3.5" /> Drucken
                          </button>
                        </div>
                        {Object.entries(abrechnung.gruppen).map(([art, g]) => (
                          <div key={art} className="flex justify-between text-sm text-[#1d1d1f]">
                            <span>{ART_LABEL[art]} · {g.menge.toLocaleString('de-DE')} {ART_EINHEIT[art]}</span>
                            <span>{fmtEur(g.betrag)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm border-t border-black/10 pt-2">
                          <span className="text-[#86868b]">Zwischensumme</span>
                          <span className="font-semibold">{fmtEur(abrechnung.zwischensumme)}</span>
                        </div>
                        {abrechnung.einbehaltProzent > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-[#86868b]">
                              Sicherheitseinbehalt ({abrechnung.einbehaltProzent} %)
                            </span>
                            <span className="text-red-600">− {fmtEur(abrechnung.einbehalt)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-black/10 pt-2">
                          <span className="font-bold text-[#1d1d1f]">Auszahlbetrag</span>
                          <span className="font-bold text-[#e8590c]">{fmtEur(abrechnung.gesamt)}</span>
                        </div>

                        {abrechnung.regieOhneZettel > 0 && (
                          <p className="text-xs text-amber-700 bg-amber-500/10 rounded-lg p-2">
                            ⚠️ {abrechnung.regieOhneZettel} Regie-Eintrag/Einträge ohne unterschriebenen
                            Stundenlohnzettel – nach VOB/B § 15 nur mit Zettel vergütungspflichtig.
                          </p>
                        )}
                        {selected.gutschrift_verfahren && (
                          <p className="text-xs text-[#86868b] bg-black/5 rounded-lg p-2">
                            Gutschriftverfahren vereinbart: Ihr stellt die Gutschrift aus, der
                            Nachunternehmer muss keine eigene Rechnung schreiben (§ 14 Abs. 2 UStG).
                          </p>
                        )}

                        <div className="flex justify-end pt-1">
                          <button
                            onClick={monatAbrechnen}
                            disabled={abrechnung.offene === 0}
                            className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white transition-colors"
                          >
                            <CheckCheck className="h-4 w-4" />
                            {abrechnung.offene > 0
                              ? `${abrechnung.offene} offene als abgerechnet markieren`
                              : 'Alles abgerechnet'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Rechtlicher Hinweis */}
        <div className="rounded-xl border border-blue-500/20 bg-[#f5f5f7] p-4 text-xs text-[#86868b] leading-relaxed">
          <strong className="text-[#1d1d1f]">Rechtlicher Hinweis:</strong> Die saubere Abrechnung von
          Nachunternehmern läuft über Werkverträge nach Fläche (m²). Reine Stundenverrechnung fremder
          Monteure kann als Arbeitnehmerüberlassung oder Scheinselbstständigkeit gewertet werden.
          Regiearbeiten nur mit unterschriebenem Stundenlohnzettel (VOB/B § 15). Gutschriftverfahren
          nur mit schriftlicher Vereinbarung (§ 14 Abs. 2 UStG). Lasst euren Rahmenvertrag von einem
          Fachanwalt für Baurecht prüfen – diese Übersicht ersetzt keine Rechtsberatung.
        </div>
      </div>
    </div>
  );
}
