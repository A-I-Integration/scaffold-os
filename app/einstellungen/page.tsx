'use client';

import { useState, useEffect } from 'react';
import { Settings, Save } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Einstellungen: Firmenprofil (Phase 14)
//
// Hier richtet JEDES Unternehmen (jede Instanz) seine eigenen
// Daten ein – sie werden überall in der Software benutzt:
//   • Rechnungs-PDF (§ 14 UStG Fußzeile)
//   • Routenoptimierung (Depot = Startpunkt der Touren)
//
// Schreiben: nur Admin (wird in /api/company erzwungen).
// ============================================================

interface Company {
  company_name: string;
  street: string;
  zip: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  steuer_nr: string;
  ust_id: string;
  bank_name: string;
  iban: string;
  bic: string;
  depot_address: string;
}

const EMPTY: Company = {
  company_name: '', street: '', zip: '', city: '', phone: '', email: '',
  website: '', steuer_nr: '', ust_id: '', bank_name: '', iban: '', bic: '',
  depot_address: '',
};

const FIELDS: { key: keyof Company; label: string; hint?: string; span?: boolean }[] = [
  { key: 'company_name', label: 'Firmenname *', hint: 'Genau wie im Handelsregister / auf Briefpapier' },
  { key: 'street', label: 'Straße und Hausnummer' },
  { key: 'zip', label: 'PLZ' },
  { key: 'city', label: 'Ort' },
  { key: 'phone', label: 'Telefon' },
  { key: 'email', label: 'E-Mail (auf der Rechnung)' },
  { key: 'website', label: 'Webseite' },
  { key: 'steuer_nr', label: 'Steuernummer', hint: 'Vom Finanzamt – Pflicht auf Rechnungen (§ 14 UStG)' },
  { key: 'ust_id', label: 'USt-IdNr.', hint: 'Alternativ zur Steuernummer (DE…)' },
  { key: 'bank_name', label: 'Bank' },
  { key: 'iban', label: 'IBAN', hint: 'Für den Zahlungshinweis auf Rechnungen' },
  { key: 'bic', label: 'BIC' },
  { key: 'depot_address', label: 'Lager / Depot (Startpunkt der Touren)', hint: 'Wird in der Routenoptimierung als Startadresse voreingestellt', span: true },
];

export default function EinstellungenPage() {
  const [company, setCompany] = useState<Company>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/company');
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Laden fehlgeschlagen');
        if (json.company) {
          const c = { ...EMPTY };
          for (const k of Object.keys(EMPTY) as (keyof Company)[]) {
            c[k] = json.company[k] || '';
          }
          setCompany(c);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    if (!company.company_name.trim()) { alert('Bitte mindestens den Firmennamen eintragen!'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(company),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Speichern fehlgeschlagen');
      alert('✅ Firmenprofil gespeichert! Es wird ab sofort auf Rechnungen und bei der Routenplanung benutzt.');
    } catch (err: any) {
      alert('❌ ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f172a] p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Einstellungen</h1>
            <p className="text-sm text-slate-400">Firmenprofil – wird auf Rechnungen und bei der Routenplanung benutzt</p>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-blue-500/20 space-y-4">
          {loading ? (
            <p className="text-slate-400">Lade Firmenprofil…</p>
          ) : error ? (
            <p className="text-red-400">Fehler: {error}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FIELDS.map((f) => (
                  <div key={f.key} className={f.span ? 'md:col-span-2' : ''}>
                    <label className="block text-xs text-slate-400 mb-1">{f.label}</label>
                    <input
                      value={company[f.key]}
                      onChange={(e) => setCompany({ ...company, [f.key]: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                    {f.hint && <p className="text-[11px] text-slate-500 mt-1">{f.hint}</p>}
                  </div>
                ))}
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 py-3 font-bold text-slate-900 transition-colors flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Speichert…' : 'Firmenprofil speichern'}
              </button>

              <p className="text-xs text-slate-500">
                Nur Admin kann diese Daten ändern. Bereits erstellte Rechnungen behalten ihre damaligen
                Firmendaten (gesetzlich vorgeschrieben, GoBD) – neue Rechnungen nutzen automatisch die
                aktuellen Daten.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
