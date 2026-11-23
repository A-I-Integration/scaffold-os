'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { X, Send, Eye, Paperclip, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { WIN } from '@/components/win/Win';
import { generateInvoicePDF, fmtDate, fmtEur, type Invoice } from '@/lib/invoice-pdf';
import { versendeRechnung, istGueltigeEmailAdresse, belegBezeichnung, type VersandErgebnis } from '@/lib/rechnung-versand-dienst';

// ============================================================
// SCAFFOLD OS – ein Versand-Dialog für Rechnungen (Faktura F3)
// Ersetzt die Abfragefenster („prompt“) an allen Stellen: Empfänger prüfen, Anhang sehen, Vorschau, Versand, Ergebnis.
// ============================================================

export function RechnungVersendenDialog({ rechnung, vorschlag, onClose, onVersendet }: {
  rechnung: Invoice; vorschlag: string; onClose: () => void; onVersendet?: (ergebnis: VersandErgebnis) => void;
}) {
  const [an, setAn] = useState(vorschlag);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<VersandErgebnis | null>(null);
  const art = belegBezeichnung(rechnung.invoice_type);
  const gueltig = istGueltigeEmailAdresse(an);

  function vorschau() {
    try { window.open(generateInvoicePDF(rechnung).output('bloburl') as unknown as string, '_blank'); }
    catch { setFehler('Die Vorschau konnte nicht erzeugt werden.'); }
  }

  async function senden() {
    if (!gueltig || laeuft) return;
    setLaeuft(true); setFehler(null);
    try {
      const erg = await versendeRechnung(rechnung, an);
      setErgebnis(erg);
      onVersendet?.(erg);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Versand fehlgeschlagen');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${art} versenden`}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ color: WIN.text }}>{art} per E-Mail senden</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5" aria-label="Schließen"><X className="h-4 w-4" /></button>
        </div>

        <div className="rounded-lg border p-3 text-[13px] grid grid-cols-2 gap-x-4 gap-y-1" style={{ borderColor: WIN.randHell }}>
          <span style={{ color: WIN.textGedaempft }}>Nummer</span><span className="font-medium">{rechnung.invoice_number}</span>
          <span style={{ color: WIN.textGedaempft }}>Kunde</span><span className="truncate">{rechnung.customer_name}</span>
          <span style={{ color: WIN.textGedaempft }}>Brutto</span><span className="font-medium tabular-nums">{fmtEur(Number(rechnung.gross_amount))} €</span>
          <span style={{ color: WIN.textGedaempft }}>Fällig</span><span>{rechnung.due_date ? fmtDate(rechnung.due_date) : '–'}</span>
        </div>

        {ergebnis ? (
          <div className="space-y-3" data-testid="versand-erfolg">
            <p className="flex items-start gap-2 rounded-lg p-3 text-[13px]" style={{ background: ergebnis.istZugferd ? '#e7f6ec' : '#fff4e5', color: ergebnis.istZugferd ? '#1a7f37' : '#a65300' }}>
              {ergebnis.istZugferd ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span>{art} {rechnung.invoice_number} wurde an <strong>{ergebnis.an}</strong> gesendet{ergebnis.istZugferd ? ' – mit E-Rechnung (ZUGFeRD).' : '.'}{ergebnis.hinweis ? <><br />{ergebnis.hinweis}</> : null}</span>
            </p>
            <button onClick={onClose} className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: WIN.akzent }}>Schließen</button>
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="versand-an" className="block text-xs mb-1" style={{ color: WIN.textGedaempft }}>Empfänger</label>
              <input id="versand-an" type="email" value={an} onChange={(e) => setAn(e.target.value)} placeholder="name@firma.de" autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') void senden(); }}
                className="w-full px-3 py-2 bg-white border rounded-lg text-sm focus:outline-none" style={{ borderColor: an && !gueltig ? '#b42318' : WIN.rand }} />
              {an && !gueltig && <p className="mt-1 text-[12px]" style={{ color: '#b42318' }}>Bitte eine gültige E-Mail-Adresse eingeben.</p>}
            </div>

            <div className="rounded-lg border p-3 text-[13px] space-y-1" style={{ borderColor: WIN.randHell }}>
              <p className="flex items-center gap-1.5 font-medium"><Paperclip className="h-3.5 w-3.5" /> Anhang</p>
              <p>{art} {rechnung.invoice_number} als PDF, wenn möglich mit eingebetteten E-Rechnung-Daten (ZUGFeRD).</p>
              <p style={{ color: WIN.textGedaempft }}>Lassen sich die E-Rechnung-Daten nicht erzeugen, geht die normale PDF raus – das siehst du nach dem Versand ausdrücklich.</p>
            </div>

            {fehler && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700" role="alert">❌ {fehler}</p>}

            <div className="flex gap-2">
              <button onClick={vorschau} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold" style={{ borderColor: WIN.rand }}><Eye className="h-4 w-4" /> Vorschau</button>
              <button onClick={senden} disabled={!gueltig || laeuft} className="ml-auto flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: WIN.akzent }}>
                {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {laeuft ? 'Wird gesendet …' : 'Jetzt senden'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Für die Oberflächen: `starten(rechnung, vorschlag)` öffnet den Dialog, `dialog` gehört einmal ins Markup. */
export function useRechnungVersenden(onVersendet?: (rechnung: Invoice, ergebnis: VersandErgebnis) => void): { starten: (rechnung: Invoice, vorschlag?: string) => void; dialog: ReactNode } {
  const [offen, setOffen] = useState<{ rechnung: Invoice; vorschlag: string } | null>(null);
  const starten = useCallback((rechnung: Invoice, vorschlag = '') => setOffen({ rechnung, vorschlag }), []);
  const dialog = offen ? (
    <RechnungVersendenDialog rechnung={offen.rechnung} vorschlag={offen.vorschlag} onClose={() => setOffen(null)}
      onVersendet={(erg) => onVersendet?.(offen.rechnung, erg)} />
  ) : null;
  return { starten, dialog };
}
