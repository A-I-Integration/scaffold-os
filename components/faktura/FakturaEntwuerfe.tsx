'use client';

import { WIN } from '@/components/win/Win';
import { ENTWURF_ART_LABEL } from '@/lib/rechnung-entwurf';
import { type FakturaDaten, type EntwurfKurz, eur } from './daten';
import { knopf, kopfZeile } from './ui';

// Entwürfe: gespeichert ohne Rechnungsnummer. „Bearbeiten“ öffnet den Entwurf im Rechnungsformular (im Kundenordner, ohne die Seite zu verlassen).
export default function FakturaEntwuerfe({ daten, onOeffnen }: { daten: FakturaDaten; onOeffnen: (id: string) => void }) {
  const { entwuerfe, setEntwuerfe, entwurfFehler, setEntwurfFehler } = daten;

  async function entwurfLoeschen(e: EntwurfKurz) {
    if (!window.confirm(`Entwurf${e.customer_name ? ` für ${e.customer_name}` : ''} wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    try {
      const res = await fetch('/api/invoice-drafts?id=' + e.id, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Löschen fehlgeschlagen');
      setEntwuerfe((l) => l.filter((x) => x.id !== e.id));
    } catch (err) {
      setEntwurfFehler(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
  }

  return (
        <div className="px-3 pb-4" data-testid="entwuerfe-bereich">
      {entwurfFehler && <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">⚠️ {entwurfFehler}</p>}
          <p className="mb-2 text-[13px]" style={{ color: WIN.textGedaempft }}>Entwürfe haben noch keine Rechnungsnummer. Die Nummer wird erst beim Anlegen der Rechnung vergeben; Rechnungsdatum und Fälligkeit gelten ab diesem Zeitpunkt.</p>
          {entwuerfe.length === 0 ? (
            <p className="py-3 text-sm" style={{ color: WIN.textGedaempft }} data-testid="entwuerfe-leer">Keine Entwürfe. Im Formular „Neue Rechnung“ gibt es den Knopf „Als Entwurf speichern“.</p>
          ) : (
            <table className="w-full text-[13.5px]" data-testid="entwuerfe-liste">
              <thead>
                <tr className={kopfZeile} style={{ color: WIN.textGedaempft, borderColor: WIN.randHell, background: '#fafafa' }}>
                  <th className="px-3 py-2">Kunde</th><th className="px-3 py-2">Art</th><th className="px-3 py-2 text-right">Netto (Vorschau)</th><th className="px-3 py-2">Zuletzt geändert</th><th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {entwuerfe.map((e) => (
                  <tr key={e.id} className="border-b" style={{ borderColor: WIN.randHell }}>
                    <td className="px-3 py-2.5">{e.customer_name || <span style={{ color: WIN.textGedaempft }}>ohne Kunde</span>}</td>
                    <td className="px-3 py-2.5">{ENTWURF_ART_LABEL[e.invoice_type] || 'Rechnung'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{eur(Number(e.netto_vorschau))}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{new Date(e.updated_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => onOeffnen(e.id)} className={`${knopf} mr-1`} style={{ borderColor: WIN.rand }}>Bearbeiten</button>
                      <button onClick={() => entwurfLoeschen(e)} className={knopf} style={{ borderColor: WIN.rand, color: '#b42318' }} aria-label="Entwurf löschen">Löschen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
  );
}
