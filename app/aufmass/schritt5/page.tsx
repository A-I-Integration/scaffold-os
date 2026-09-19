'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sollFrischGeladenWerden, leseMarkierung, setzeMarkierung } from '@/lib/aufmass-projekt-session';

const LEERES_FORM_S5 = {
  arbeitsbuehnen: '',
  rahmen: '',
  diagonale: '',
  spindeltreppe: '',
  gelander: '',
  anker: '',
  liefertermin: '',
  abholtermin: '',
};

function Schritt5Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id');
  const [step1Data, setStep1Data] = useState<any>(null);
  const [step2Data, setStep2Data] = useState<any>(null);
  const [step4Data, setStep4Data] = useState<any>(null);

  const [form, setForm] = useState({ ...LEERES_FORM_S5 });

  useEffect(() => {
    if (sollFrischGeladenWerden(projectId, leseMarkierung())) {
        setzeMarkierung(projectId!);
        setForm({ ...LEERES_FORM_S5 });
        (async () => {
          try {
            const res = await fetch('/api/projects?id=' + projectId);
            const json = await res.json();
            const d = json.project?.data;
            if (json.success && d?.step1) { localStorage.setItem('scaffold_step1', JSON.stringify(d.step1)); setStep1Data(d.step1); }
            if (json.success && d?.step2) { localStorage.setItem('scaffold_step2', JSON.stringify(d.step2)); setStep2Data(d.step2); }
            if (json.success && d?.step4) { localStorage.setItem('scaffold_step4', JSON.stringify(d.step4)); setStep4Data(d.step4); }
            if (json.success && d?.step5) { localStorage.setItem('scaffold_step5', JSON.stringify(d.step5)); }
            // FIX: mit Schritt 1 (Termine), Schritt 4 (KI-Mengen) und
            // Schritt 2 (Schätzung) verknüpfen – nur leere Felder füllen.
            if (json.success && d) setForm(mitVorschlaegen(d.step5 || null, d.step1 || null, d.step2 || null, d.step4 || null));
          } catch { /* ignore */ }
        })();
        return;
      }
    const s1 = localStorage.getItem('scaffold_step1');
    const s2 = localStorage.getItem('scaffold_step2');
    const s4 = localStorage.getItem('scaffold_step4');
    if (s1) setStep1Data(JSON.parse(s1));
    if (s2) setStep2Data(JSON.parse(s2));
    if (s4) setStep4Data(JSON.parse(s4));
    const s5 = localStorage.getItem('scaffold_step5');
    // FIX: auch aus dem Zwischenspeicher mit Vorschlägen verknüpfen
    try { setForm(mitVorschlaegen(s5 ? JSON.parse(s5) : null, s1 ? JSON.parse(s1) : null, s2 ? JSON.parse(s2) : null, s4 ? JSON.parse(s4) : null)); } catch { }
  }, [projectId]);

  function handleWeiter() {
    localStorage.setItem('scaffold_step5', JSON.stringify(form));
    router.push(projectId ? `/aufmass/schritt6?id=${projectId}` : '/aufmass/schritt6');
  }

  function zurueck() {
    router.push(projectId ? `/aufmass/schritt4?id=${projectId}` : '/aufmass/schritt4');
  }

  // Automatische Schätzung basierend auf Schritt 2
  const geschLaenge = step2Data?.laenge ? parseFloat(step2Data.laenge) : 0;
  const geschHoehe = step2Data?.hoehe ? parseFloat(step2Data.hoehe) : 0;

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f] p-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={zurueck} className="text-[#86868b] hover:text-[#1d1d1f] text-sm mb-2">← Zurück</button>
        <h1 className="text-3xl font-bold mb-2">📦 Material & Termine</h1>
        <p className="text-[#86868b] mb-2">Baustelle: Schritt 5 von 6</p>
        {step1Data && (
          <div className="bg-black/5 rounded-xl p-3 mb-6 text-sm text-[#86868b]">
            <span className="text-[#424245] font-medium">{step1Data.name}</span> · {step1Data.adresse}
          </div>
        )}

        {/* Automatische Schätzung */}
        {geschLaenge > 0 && geschHoehe > 0 && (
          <div className="bg-blue-50 border border-blue-500/50 rounded-xl p-4 mb-6">
            <div className="text-blue-600 font-semibold text-sm mb-1">💡 Automatische Schätzung</div>
            <div className="text-blue-700 text-sm">
              Bei {geschLaenge} m Länge × {geschHoehe} m Höhe ca. <strong>{Math.ceil(geschLaenge * geschHoehe / 3)} Felder</strong> erforderlich
            </div>
          </div>
        )}

        <div className="bg-[#f5f5f7] rounded-xl p-6 space-y-4">

          {[
            { key: 'arbeitsbuehnen', label: 'Arbeitsbühnen (Stk)', placeholder: 'z.B. 12' },
            { key: 'rahmen', label: 'Rahmen (Stk)', placeholder: 'z.B. 24' },
            { key: 'diagonale', label: 'Diagonalen (Stk)', placeholder: 'z.B. 16' },
            { key: 'spindeltreppe', label: 'Spindeltreppen (Stk)', placeholder: 'z.B. 2' },
            { key: 'gelander', label: 'Geländer (Stk)', placeholder: 'z.B. 8' },
            { key: 'anker', label: 'Anker / Verbindungen (Stk)', placeholder: 'z.B. 20' },
          ].map((field: any) => (
            <div key={field.key}>
              <label className="block text-sm font-medium mb-2 text-[#424245]">{field.label}</label>
              <input type="number" value={(form as any)[field.key]}
                onChange={e => setForm({...form, [field.key]: e.target.value})}
                className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f]"
                placeholder={field.placeholder} />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-sm font-medium mb-2 text-[#424245]">Liefertermin</label>
              <input type="date" value={form.liefertermin}
                onChange={e => setForm({...form, liefertermin: e.target.value})}
                className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f]" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[#424245]">Abholtermin</label>
              <input type="date" value={form.abholtermin}
                onChange={e => setForm({...form, abholtermin: e.target.value})}
                className="w-full bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-[#1d1d1f]" />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={zurueck} className="flex-1 bg-black/10 hover:bg-black/15 text-[#1d1d1f] font-semibold py-3 px-4 rounded-xl">← Zurück</button>
            <button onClick={handleWeiter} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-4 rounded-xl">Weiter →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
// useSearchParams braucht in Next eine Suspense-Grenze (Prerendering)
// Verbindet Schritt 5 mit den vorherigen Schritten:
// - Liefer-/Abholtermin aus Schritt 1 (projektbeginn/projektende)
// - Mengen aus der KI-Materialliste (Schritt 4, kiResult.materialList)
// - Fallback: grobe Schätzung aus Länge × Höhe (Schritt 2, gleiche
//   Formel wie die „Automatische Schätzung"-Box: ceil(L×H/3) Felder)
// Es werden NUR leere Felder befüllt – eigene Eingaben werden nie
// überschrieben. Datums-Strings werden normalisiert (ISO → YYYY-MM-DD).
const normDatum = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 10) : '');
const alsZahl = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
function mitVorschlaegen(s5: any, s1: any, s2: any, s4: any) {
  const form: any = { ...LEERES_FORM_S5, ...(s5 || {}) };
  if (!form.liefertermin) form.liefertermin = normDatum(s1?.projektbeginn);
  if (!form.abholtermin) form.abholtermin = normDatum(s1?.projektende);
  // 1) Mengen aus der KI-Materialliste (Schritt 4)
  const liste: any[] = s4?.kiResult?.materialList || s4?.ki_result?.materialList || [];
  const lo = (x: unknown) => String(x ?? '').toLowerCase();
  const such = (keys: string[]) => liste.find((m) => keys.some((k) => lo(m?.name).includes(k) || lo(m?.category).includes(k)));
  const menge = (m: any) => (m && typeof m.quantity === 'number' ? String(m.quantity) : '');
  if (!form.arbeitsbuehnen) form.arbeitsbuehnen = menge(such(['bühne', 'buehne', 'plattform']));
  if (!form.rahmen) form.rahmen = menge(such(['rahmen']));
  if (!form.diagonale) form.diagonale = menge(such(['diagonal']));
  if (!form.spindeltreppe) form.spindeltreppe = menge(such(['treppe']));
  if (!form.gelander) form.gelander = menge(such(['geländ', 'gelaend', 'handlauf']));
  if (!form.anker) form.anker = menge(such(['anker', 'verbindung', 'kupplung']));
  // 2) Fallback: Schätzung aus Schritt 2 (nur was die KI nicht lieferte)
  const L = alsZahl(s2?.laenge), H = alsZahl(s2?.hoehe);
  if (L > 0 && H > 0) {
    const felder = Math.ceil((L * H) / 3);
    if (!form.rahmen) form.rahmen = String(felder + 1);
    if (!form.diagonale) form.diagonale = String(Math.max(2, Math.ceil((felder * 2) / 3)));
    if (!form.gelander) form.gelander = String(felder + 1);
    if (!form.arbeitsbuehnen) form.arbeitsbuehnen = String(Math.max(1, Math.ceil(L / 3)));
    if (!form.spindeltreppe) form.spindeltreppe = String(Math.max(1, Math.ceil(L / 6)));
    if (!form.anker) form.anker = String(Math.ceil(felder / 2));
  }
  return form;
}

export default function Schritt5Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white p-8 text-[#86868b]">Lädt…</div>}>
      <Schritt5Content />
    </Suspense>
  );
}
