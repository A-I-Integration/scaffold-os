'use client';

import { useCallback, useEffect, useState } from 'react';
import { BESCHAEFTIGUNGSARTEN, KONFESSIONEN } from '@/lib/personalstamm';
import { FUEHRERSCHEIN_KLASSEN } from '@/lib/touren/fuehrerschein';

// ============================================================
// SCAFFOLD OS – Reiter „Mitarbeiter“ (Personalstamm)
// Alle Angaben, die für Lohn und Finanzamt gebraucht werden. Nur für den Chef (die Route prüft das).
// ============================================================

interface MaListe { id: string; first_name: string; last_name: string; status: string; fuehrerschein_klassen: string[] | null; license_expires: string | null }
type Form = Record<string, string> & { fuehrerschein_klassen_liste?: never };

const FELDER = ['geburtsname', 'geburtsdatum', 'geburtsort', 'staatsangehoerigkeit', 'strasse', 'plz', 'ort', 'telefon_privat', 'notfall_name', 'notfall_telefon', 'sv_nummer', 'steuer_id', 'steuerklasse', 'kinderfreibetraege', 'konfession', 'krankenkasse', 'iban', 'bic', 'eintrittsdatum', 'austrittsdatum', 'beschaeftigungsart', 'taetigkeit', 'notiz'] as const;
const inputCls = 'w-full rounded-lg bg-[#f5f5f7] border border-black/10 px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#86868b] focus:border-[#e8590c] focus:outline-none';
const leereForm = (): Form => Object.fromEntries([['first_name', ''], ['last_name', ''], ['phone', ''], ['weekly_hours', ''], ['license_expires', ''], ...FELDER.map(f => [f, ''])]) as Form;

export default function PersonalStamm() {
  const [liste, setListe] = useState<MaListe[]>([]);
  const [auswahl, setAuswahl] = useState<string>(''); // '' = nichts, 'neu' = neuer Mitarbeiter
  const [form, setForm] = useState<Form>(leereForm());
  const [klassen, setKlassen] = useState<string[]>([]);
  const [verboten, setVerboten] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const ladeListe = useCallback(async () => {
    const res = await fetch('/api/mitarbeiter-stamm', { cache: 'no-store' });
    if (res.status === 403) { setVerboten(true); return; }
    const j = await res.json().catch(() => ({}));
    if (j.success) setListe(j.mitarbeiter || []);
    else setMeldung({ ok: false, text: j.error || 'Mitarbeiter konnten nicht geladen werden.' });
  }, []);
  useEffect(() => { ladeListe(); }, [ladeListe]);

  useEffect(() => {
    setMeldung(null);
    if (!auswahl) return;
    if (auswahl === 'neu') { setForm(leereForm()); setKlassen([]); return; }
    (async () => {
      const res = await fetch(`/api/mitarbeiter-stamm?employee_id=${auswahl}`, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!j.success) { setMeldung({ ok: false, text: j.error || 'Laden fehlgeschlagen' }); return; }
      const m = j.mitarbeiter, p = j.personal || {};
      const f = leereForm();
      f.first_name = m.first_name || ''; f.last_name = m.last_name || ''; f.phone = m.phone || '';
      f.weekly_hours = m.weekly_hours != null ? String(m.weekly_hours) : ''; f.license_expires = m.license_expires || '';
      for (const k of FELDER) f[k] = p[k] != null ? String(p[k]) : '';
      setForm(f); setKlassen(Array.isArray(m.fuehrerschein_klassen) ? m.fuehrerschein_klassen : []);
    })();
  }, [auswahl]);

  const set = (k: string) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }));
  const feld = (k: string, label: string, opt: { type?: string; ph?: string; testid?: string } = {}) => (
    <div>
      <label className="block text-xs text-[#86868b] mb-1">{label}</label>
      <input type={opt.type || 'text'} value={form[k] ?? ''} onChange={set(k)} placeholder={opt.ph} className={inputCls} data-testid={opt.testid || `stamm-${k}`} />
    </div>
  );

  async function speichern() {
    setLaeuft(true); setMeldung(null);
    try {
      const body = { ...form, employee_id: auswahl === 'neu' ? undefined : auswahl, fuehrerschein_klassen: klassen, license_expires: form.license_expires || null };
      const res = await fetch('/api/mitarbeiter-stamm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) { setMeldung({ ok: false, text: j.error || 'Speichern fehlgeschlagen' }); return; }
      await ladeListe();
      if (auswahl === 'neu') setAuswahl(j.employee_id);
      setMeldung({ ok: true, text: 'Mitarbeiter gespeichert.' });
    } catch (e: any) { setMeldung({ ok: false, text: e?.message || 'Fehler beim Speichern' }); }
    finally { setLaeuft(false); }
  }

  if (verboten) {
    return <section data-testid="stamm-gesperrt" className="bg-white border border-black/5 rounded-2xl p-5 text-sm text-[#86868b]">Der Personalstamm enthält Sozialversicherungs-, Steuer- und Bankdaten und ist nur für den Chef sichtbar.</section>;
  }

  const sek = (titel: string, kinder: React.ReactNode, testid?: string) => (
    <fieldset className="space-y-3" data-testid={testid}>
      <legend className="text-sm font-semibold text-[#424245] mb-1">{titel}</legend>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{kinder}</div>
    </fieldset>
  );

  return (
    <div className="space-y-6" data-testid="personal-stamm">
      <section className="bg-white border border-black/5 rounded-2xl p-5 space-y-3">
        <h2 className="text-lg font-semibold">👤 Mitarbeiter</h2>
        <div className="flex flex-wrap gap-2">
          <select value={auswahl} onChange={e => setAuswahl(e.target.value)} className={inputCls + ' md:max-w-sm'} data-testid="stamm-auswahl">
            <option value="">– Mitarbeiter wählen –</option>
            <option value="neu">＋ Neuen Mitarbeiter anlegen</option>
            {liste.map(m => <option key={m.id} value={m.id}>{m.last_name}, {m.first_name}{m.status !== 'active' ? ' (inaktiv)' : ''}</option>)}
          </select>
        </div>
      </section>

      {auswahl && (
        <section className="bg-white border border-black/5 rounded-2xl p-5 space-y-6" data-testid="stamm-formular">
          {sek('Person', <>
            {feld('first_name', 'Vorname *', { testid: 'stamm-vorname' })}{feld('last_name', 'Nachname *', { testid: 'stamm-nachname' })}{feld('geburtsname', 'Geburtsname')}
            {feld('geburtsdatum', 'Geburtsdatum', { type: 'date' })}{feld('geburtsort', 'Geburtsort')}{feld('staatsangehoerigkeit', 'Staatsangehörigkeit')}
          </>)}
          {sek('Adresse und Kontakt', <>
            {feld('strasse', 'Straße und Hausnummer')}{feld('plz', 'PLZ')}{feld('ort', 'Ort')}
            {feld('phone', 'Telefon (Arbeit/Mobil)', { testid: 'stamm-telefon' })}{feld('telefon_privat', 'Telefon privat')}<span />
            {feld('notfall_name', 'Notfallkontakt: Name')}{feld('notfall_telefon', 'Notfallkontakt: Telefon')}
          </>)}
          {sek('Lohn, Steuer und Sozialversicherung', <>
            {feld('sv_nummer', 'Sozialversicherungsnummer', { ph: '12 010190 A 123' })}
            {feld('steuer_id', 'Steuer-ID (11 Ziffern)', { ph: 'Steuer-Identifikationsnummer' })}
            <div>
              <label className="block text-xs text-[#86868b] mb-1">Steuerklasse</label>
              <select value={form.steuerklasse} onChange={set('steuerklasse')} className={inputCls} data-testid="stamm-steuerklasse">
                <option value="">–</option>{[1, 2, 3, 4, 5, 6].map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            {feld('kinderfreibetraege', 'Kinderfreibeträge', { ph: 'z. B. 0 oder 1,5' })}
            <div>
              <label className="block text-xs text-[#86868b] mb-1">Religion / Konfession (Kirchensteuer)</label>
              <select value={form.konfession} onChange={set('konfession')} className={inputCls} data-testid="stamm-konfession">
                <option value="">–</option>{KONFESSIONEN.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
            {feld('krankenkasse', 'Krankenkasse')}
            {feld('iban', 'IBAN (Lohnüberweisung)')}{feld('bic', 'BIC')}<span />
          </>)}
          {sek('Beschäftigung', <>
            {feld('eintrittsdatum', 'Eintritt', { type: 'date' })}{feld('austrittsdatum', 'Austritt', { type: 'date' })}
            <div>
              <label className="block text-xs text-[#86868b] mb-1">Beschäftigungsart</label>
              <select value={form.beschaeftigungsart} onChange={set('beschaeftigungsart')} className={inputCls}>
                <option value="">–</option>{BESCHAEFTIGUNGSARTEN.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            {feld('taetigkeit', 'Tätigkeit / Funktion', { ph: 'z. B. Gerüstbauer, Vorarbeiter' })}{feld('weekly_hours', 'Wochenstunden (vertraglich)', { ph: '40' })}
          </>)}
          <fieldset className="space-y-3" data-testid="stamm-fuehrerschein">
            <legend className="text-sm font-semibold text-[#424245] mb-1">Führerschein</legend>
            <div className="flex flex-wrap gap-3 items-end">
              {FUEHRERSCHEIN_KLASSEN.map(k => (
                <label key={k} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={klassen.includes(k)} onChange={e => setKlassen(e.target.checked ? [...klassen, k] : klassen.filter(x => x !== k))} data-testid={`stamm-klasse-${k}`} /> {k}
                </label>
              ))}
              <div className="w-44">{feld('license_expires', 'Führerschein „gültig bis“', { type: 'date' })}</div>
            </div>
            <p className="text-xs text-[#86868b]">Kranschein, Staplerschein und weitere Bescheinigungen mit Ablaufdatum bitte im Reiter „Dokumente“ eintragen.</p>
          </fieldset>
          <div>
            <label className="block text-xs text-[#86868b] mb-1">Notiz</label>
            <textarea value={form.notiz} onChange={set('notiz')} rows={2} className={inputCls} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={speichern} disabled={laeuft} data-testid="stamm-speichern" className="rounded-xl bg-[#e8590c] hover:bg-[#d9480f] text-white disabled:opacity-50 px-5 py-2.5 font-semibold transition">
              {laeuft ? '⏳ Speichere…' : 'Speichern'}
            </button>
            {meldung && <span data-testid="stamm-meldung" className={`text-sm ${meldung.ok ? 'text-emerald-700' : 'text-red-700'}`}>{meldung.text}</span>}
          </div>
        </section>
      )}
      {!auswahl && meldung && <div className="text-sm text-red-700">{meldung.text}</div>}
    </div>
  );
}
