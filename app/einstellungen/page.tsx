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
  // Kalkulations-Grundlagen (als String im Formular, Komma erlaubt)
  calc_hourly_rate: string;
  calc_hours_per_sqm: string;
  calc_transport_per_kg: string;
  calc_transport_min: string;
  calc_trip_flat: string;
  calc_permit_low: string;
  calc_permit_high: string;
  calc_crane_day: string;
}

const EMPTY: Company = {
  company_name: '', street: '', zip: '', city: '', phone: '', email: '',
  website: '', steuer_nr: '', ust_id: '', bank_name: '', iban: '', bic: '',
  depot_address: '',
  calc_hourly_rate: '', calc_hours_per_sqm: '', calc_transport_per_kg: '',
  calc_transport_min: '', calc_trip_flat: '', calc_permit_low: '',
  calc_permit_high: '', calc_crane_day: '',
};

// Kalkulations-Grundlagen: Diese Werte nutzt die Angebots-Kalkulation.
// Leer lassen = Standardwert (steht jeweils im Hinweis).
const KALK_FIELDS: { key: keyof Company; label: string; hint: string }[] = [
  { key: 'calc_hourly_rate', label: 'Stundensatz (€/h)', hint: 'Standard: 65 – ein Mitarbeiter-Stundensatz (Planung) hat Vorrang' },
  { key: 'calc_hours_per_sqm', label: 'Montagestunden pro m²', hint: 'Standard: 2 – Auf- und Abbau zusammen' },
  { key: 'calc_transport_per_kg', label: 'Transport (€ pro kg)', hint: 'Standard: 0,80 – Grundlage ist das Materialgewicht' },
  { key: 'calc_transport_min', label: 'Transport-Mindestpauschale (€)', hint: 'Standard: 250 – gilt, wenn die kg-Rechnung darunter bleibt' },
  { key: 'calc_trip_flat', label: 'Fahrtkosten-Pauschale (€ pro Baustelle)', hint: 'Standard: 0 = aus – deckt Sprit und Fuhrpark-Nutzung ab' },
  { key: 'calc_permit_low', label: 'Genehmigung bis 12 m Höhe (€)', hint: 'Standard: 250' },
  { key: 'calc_permit_high', label: 'Genehmigung über 12 m Höhe (€)', hint: 'Standard: 450' },
  { key: 'calc_crane_day', label: 'Kran-Tagessatz (€)', hint: 'Standard: 850 – wird berechnet, wenn im Aufmaß „Kran nötig" gewählt ist' },
];

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
            const v = json.company[k];
            c[k] = v === null || v === undefined ? '' : String(v);
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
      // Kalkulations-Felder: deutsches Komma in Punkt umwandeln ("0,8" → "0.8"),
      // damit die numeric-Spalten den Wert sauber speichern.
      const payload = { ...company };
      for (const f of KALK_FIELDS) {
        payload[f.key] = payload[f.key].replace(',', '.').trim();
      }
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    <div className="min-h-screen bg-[#fbfbfd] p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-[#e8590c]" />
          <div>
            <h1 className="text-2xl font-bold text-[#1d1d1f]">Einstellungen</h1>
            <p className="text-sm text-[#86868b]">Firmenprofil – wird auf Rechnungen und bei der Routenplanung benutzt</p>
          </div>
        </div>

        <div className="bg-[#f5f5f7] rounded-xl p-6 border border-blue-500/20 space-y-4">
          {loading ? (
            <p className="text-[#86868b]">Lade Firmenprofil…</p>
          ) : error ? (
            <p className="text-red-600">Fehler: {error}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FIELDS.map((f) => (
                  <div key={f.key} className={f.span ? 'md:col-span-2' : ''}>
                    <label className="block text-xs text-[#86868b] mb-1">{f.label}</label>
                    <input
                      value={company[f.key]}
                      onChange={(e) => setCompany({ ...company, [f.key]: e.target.value })}
                      className="w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                    />
                    {f.hint && <p className="text-[11px] text-[#86868b] mt-1">{f.hint}</p>}
                  </div>
                ))}
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-xl bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 py-3 font-bold text-white transition-colors flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Speichert…' : 'Firmenprofil speichern'}
              </button>

              <p className="text-xs text-[#86868b]">
                Nur Admin kann diese Daten ändern. Bereits erstellte Rechnungen behalten ihre damaligen
                Firmendaten (gesetzlich vorgeschrieben, GoBD) – neue Rechnungen nutzen automatisch die
                aktuellen Daten.
              </p>
            </>
          )}
        </div>

        {/* ─── Kalkulations-Grundlagen (Angebots-Kalkulation) ─── */}
        {!loading && !error && (
          <div className="bg-[#f5f5f7] rounded-xl p-6 border border-[#e8590c]/30 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-[#1d1d1f]">Kalkulations-Grundlagen</h2>
              <p className="text-sm text-[#86868b]">
                Diese Werte nutzt die Kalkulation im Aufmaß für Lohn, Transport, Fahrtkosten,
                Genehmigung und Kran. Leere Felder = Standardwert. Materialpreise kommen aus
                dem Lager (Stückpreis und Gewicht pro Artikel).
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {KALK_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs text-[#86868b] mb-1">{f.label}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={company[f.key]}
                    onChange={(e) => setCompany({ ...company, [f.key]: e.target.value })}
                    className="w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]"
                  />
                  <p className="text-[11px] text-[#86868b] mt-1">{f.hint}</p>
                </div>
              ))}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-xl bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 py-3 font-bold text-white transition-colors flex items-center justify-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Speichert…' : 'Alles speichern'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
