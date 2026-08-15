'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Truck, Package, CheckCircle, ArrowRight, ArrowLeft, Sparkles, Loader2 } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Onboarding-Assistent (Phase 16)
// Führt neue Admins in 3 Schritten durch die Ersteinrichtung:
//   1. Firmenprofil   (Pflichtangaben für Rechnungen, Depot)
//   2. Stammdaten     (erstes Fahrzeug, erster Fahrer – optional)
//   3. Demo-Daten     (Beispiel-Daten laden oder leer starten)
// Abschluss setzt onboarding_done = true im Firmenprofil.
// ============================================================

type Firm = {
  company_name: string; street: string; zip: string; city: string;
  phone: string; email: string; steuer_nr: string; ust_id: string;
  bank_name: string; iban: string; bic: string; depot_address: string;
};

const LEER: Firm = {
  company_name: '', street: '', zip: '', city: '', phone: '', email: '',
  steuer_nr: '', ust_id: '', bank_name: '', iban: '', bic: '', depot_address: '',
};

const FIRMEN_FELDER: { key: keyof Firm; label: string; pflicht?: boolean; hint?: string }[] = [
  { key: 'company_name', label: 'Firmenname', pflicht: true, hint: 'Genau wie im Handelsregister / auf dem Briefkopf' },
  { key: 'street', label: 'Straße und Hausnummer', pflicht: true },
  { key: 'zip', label: 'PLZ', pflicht: true },
  { key: 'city', label: 'Ort', pflicht: true },
  { key: 'phone', label: 'Telefon' },
  { key: 'email', label: 'E-Mail (erscheint auf Rechnungen)', pflicht: true },
  { key: 'steuer_nr', label: 'Steuernummer', hint: 'Entweder Steuernummer ODER USt-IdNr. ist Pflicht auf Rechnungen' },
  { key: 'ust_id', label: 'USt-IdNr.', hint: 'z. B. DE123456789' },
  { key: 'bank_name', label: 'Bank' },
  { key: 'iban', label: 'IBAN' },
  { key: 'bic', label: 'BIC' },
  { key: 'depot_address', label: 'Lager / Depot (Startpunkt der Tourenplanung)', hint: 'Komplette Adresse, z. B. Industriestr. 5, 60311 Frankfurt' },
];

const inputCls = 'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500';

export default function OnboardingPage() {
  const router = useRouter();
  const [schritt, setSchritt] = useState(1);
  const [firm, setFirm] = useState<Firm>(LEER);
  const [fahrzeug, setFahrzeug] = useState('');
  const [kennzeichen, setKennzeichen] = useState('');
  const [fahrer, setFahrer] = useState('');
  const [saving, setSaving] = useState(false);
  const [fehler, setFehler] = useState('');
  const [demoGeladen, setDemoGeladen] = useState(false);
  const [demoInfo, setDemoInfo] = useState('');

  function setF(k: keyof Firm, v: string) { setFirm((f) => ({ ...f, [k]: v })); }

  // ── Schritt 1: Firmenprofil speichern ──
  async function speichernFirma() {
    setFehler('');
    if (!firm.company_name.trim() || !firm.street.trim() || !firm.zip.trim() || !firm.city.trim() || !firm.email.trim()) {
      setFehler('Bitte mindestens Firmenname, Adresse und E-Mail ausfüllen.');
      return;
    }
    if (!firm.steuer_nr.trim() && !firm.ust_id.trim()) {
      setFehler('Steuernummer oder USt-IdNr. fehlt – eine der beiden ist Pflicht auf Rechnungen.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(firm),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setSchritt(2);
    } catch (e: any) {
      setFehler(e.message);
    } finally { setSaving(false); }
  }

  // ── Schritt 2: Stammdaten (optional) ──
  async function speichernStammdaten() {
    setFehler('');
    setSaving(true);
    try {
      if (fahrzeug.trim()) {
        const res = await fetch('/api/vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: fahrzeug.trim(), license_plate: kennzeichen.trim() || null, status: 'verfuegbar' }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
      }
      if (fahrer.trim()) {
        const res = await fetch('/api/drivers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: fahrer.trim() }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
      }
      setSchritt(3);
    } catch (e: any) {
      setFehler(e.message);
    } finally { setSaving(false); }
  }

  // ── Schritt 3: Demo-Daten laden ──
  async function ladeDemo() {
    setFehler('');
    setSaving(true);
    try {
      const res = await fetch('/api/onboarding/demo', { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setDemoGeladen(true);
      setDemoInfo(json.schonVorhanden
        ? 'Demo-Daten waren bereits vorhanden.'
        : `Angelegt: ${json.angelegt.join(', ')}`);
    } catch (e: any) {
      setFehler(e.message);
    } finally { setSaving(false); }
  }

  // ── Abschluss: Onboarding als erledigt markieren ──
  async function abschliessen() {
    setSaving(true);
    try {
      await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_done: true }),
      });
    } catch { /* Banner verschwindet sonst beim nächsten Speichern */ }
    router.push('/dashboard');
  }

  const schrittTitel = ['', 'Firmenprofil', 'Stammdaten', 'Demo-Daten'];

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-2xl">

        {/* Kopf + Fortschritt */}
        <div className="text-center mb-8">
          <div className="text-blue-400 text-sm font-semibold tracking-widest mb-2">SCAFFOLD OS</div>
          <h1 className="text-3xl font-bold">Willkommen! Richten wir Ihr System ein.</h1>
          <p className="text-slate-400 mt-2">Drei kurze Schritte – danach ist alles einsatzbereit.</p>
          <div className="flex justify-center gap-2 mt-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`h-2 w-16 rounded-full ${s <= schritt ? 'bg-blue-500' : 'bg-slate-700'}`} />
            ))}
          </div>
          <div className="text-slate-400 text-sm mt-2">Schritt {schritt} von 3: {schrittTitel[schritt]}</div>
        </div>

        {fehler && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/40 border border-red-700 text-red-200 text-sm">{fehler}</div>
        )}

        {/* ── SCHRITT 1: Firmenprofil ── */}
        {schritt === 1 && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-1">
              <Building2 className="text-blue-400" size={22} />
              <h2 className="text-xl font-semibold">Ihr Firmenprofil</h2>
            </div>
            <p className="text-slate-400 text-sm mb-5">
              Diese Angaben stehen auf Ihren Rechnungen (Pflicht nach § 14 UStG) und steuern die Routenplanung.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FIRMEN_FELDER.map((f) => (
                <div key={f.key} className={f.key === 'depot_address' || f.key === 'company_name' ? 'sm:col-span-2' : ''}>
                  <label className="block text-sm text-slate-300 mb-1">
                    {f.label} {f.pflicht && <span className="text-blue-400">*</span>}
                  </label>
                  <input className={inputCls} value={firm[f.key]} onChange={(e) => setF(f.key, e.target.value)} />
                  {f.hint && <p className="text-xs text-slate-500 mt-1">{f.hint}</p>}
                </div>
              ))}
            </div>
            <button onClick={speichernFirma} disabled={saving}
              className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold disabled:opacity-50">
              {saving ? <Loader2 className="animate-spin" size={18} /> : <>Speichern und weiter <ArrowRight size={18} /></>}
            </button>
          </div>
        )}

        {/* ── SCHRITT 2: Stammdaten ── */}
        {schritt === 2 && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-1">
              <Truck className="text-blue-400" size={22} />
              <h2 className="text-xl font-semibold">Erste Stammdaten</h2>
            </div>
            <p className="text-slate-400 text-sm mb-5">
              Optional: Legen Sie gleich Ihr erstes Fahrzeug und Ihren ersten Fahrer an. Alles Weitere später unter „Datenpflege".
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Fahrzeug (z. B. Mercedes Sprinter)</label>
                  <input className={inputCls} value={fahrzeug} onChange={(e) => setFahrzeug(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Kennzeichen (für GPS)</label>
                  <input className={inputCls} value={kennzeichen} onChange={(e) => setKennzeichen(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Fahrer (Name)</label>
                <input className={inputCls} value={fahrer} onChange={(e) => setFahrer(e.target.value)} />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setSchritt(1)}
                className="flex items-center gap-2 px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600">
                <ArrowLeft size={18} /> Zurück
              </button>
              <button onClick={speichernStammdaten} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={18} /> : <>{fahrzeug || fahrer ? 'Anlegen und weiter' : 'Überspringen'} <ArrowRight size={18} /></>}
              </button>
            </div>
          </div>
        )}

        {/* ── SCHRITT 3: Demo-Daten ── */}
        {schritt === 3 && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-1">
              <Sparkles className="text-blue-400" size={22} />
              <h2 className="text-xl font-semibold">Mit Beispielen starten?</h2>
            </div>
            <p className="text-slate-400 text-sm mb-5">
              Auf Wunsch laden wir Demo-Daten: ein Fahrzeug, einen Fahrer, vier Lagerartikel und ein Beispiel-Projekt.
              Alle Demo-Einträge erkennen Sie am Präfix <b>DEMO</b> und können sie jederzeit löschen.
            </p>

            {demoGeladen ? (
              <div className="mb-5 px-4 py-3 rounded-lg bg-green-900/40 border border-green-700 text-green-200 text-sm flex items-center gap-2">
                <CheckCircle size={18} /> {demoInfo}
              </div>
            ) : (
              <button onClick={ladeDemo} disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={18} /> : <><Package size={18} /> Demo-Daten laden</>}
              </button>
            )}

            <div className="mt-6 flex gap-3">
              <button onClick={() => setSchritt(2)}
                className="flex items-center gap-2 px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600">
                <ArrowLeft size={18} /> Zurück
              </button>
              <button onClick={abschliessen} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-green-600 hover:bg-green-500 font-semibold disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={18} /> : <>Einrichtung abschließen <CheckCircle size={18} /></>}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-slate-500 text-sm mt-6">
          Alles lässt sich später ändern: Firmenprofil unter „Einstellungen", Stammdaten unter „Datenpflege".
        </p>
      </div>
    </div>
  );
}
