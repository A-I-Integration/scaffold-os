'use client';

import { useState, useCallback, useEffect } from 'react';
import { Upload, Check, AlertTriangle, FileText } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Zahlungsabgleich per Kontoauszug (Phase 26)
//
// Löst die Lücke "Zahlungseingang ist reiner Handschalter": statt
// jede Rechnung einzeln von Hand auf "bezahlt" zu setzen, kann hier
// ein CSV-Export des Kontos hochgeladen werden. Offene Rechnungen
// werden automatisch vorgeschlagen (Rechnungsnummer und/oder Betrag
// im Kontoauszug gefunden) – BESTÄTIGT wird aber bewusst manuell,
// bevor irgendetwas als bezahlt markiert wird. Kein automatischer
// Bankzugriff (PSD2/Kontoschnittstelle) – das wäre ein größeres,
// separates Vorhaben mit eigener Bank-Freigabe.
//
// CSV-Format: möglichst flexibel gehalten (deutsche Bank-Exporte
// nutzen oft ";" als Trenner, Beträge mit Komma). Jede Zeile wird
// als Ganzes nach Rechnungsnummer und Betrag durchsucht, statt feste
// Spalten vorauszusetzen – funktioniert mit den meisten gängigen
// Exportformaten (z.B. "Buchungstext"/"Verwendungszweck"-Spalte).
// ============================================================

interface Invoice {
  id: string; invoice_number: string; customer_name: string; gross_amount: number;
  status: string; due_date: string | null; invoice_type?: string; paid_amount?: number;
}
interface Zeile { text: string; betraege: number[] }
interface Vorschlag {
  invoice: Invoice; zeile: Zeile;
  nummerGefunden: boolean; betragGefunden: boolean;
  // NEU (Phase 38): falls die Rechnungsnummer gefunden wurde, aber der
  // Betrag nicht zum vollen offenen Betrag passt – möglicher Teilbetrag,
  // aus der Kontozeile übernommen, statt den Treffer zu verwerfen.
  teilBetrag?: number;
}

function parseCsv(text: string): string[][] {
  const trenner = text.includes(';') ? ';' : ',';
  return text.split(/\r?\n/).filter(z => z.trim()).map(z => z.split(trenner).map(f => f.trim().replace(/^"|"$/g, '')));
}

function findeBetraege(felder: string[]): number[] {
  const treffer: number[] = [];
  for (const f of felder) {
    const bereinigt = f.replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
    const n = parseFloat(bereinigt);
    if (!isNaN(n) && Math.abs(n) >= 1 && Math.abs(n) < 1000000) treffer.push(Math.abs(n));
  }
  return treffer;
}

export default function ZahlungsabgleichPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [vorschlaege, setVorschlaege] = useState<Vorschlag[]>([]);
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());
  const [verbuchen, setVerbuchen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const lade = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/invoices');
      const json = await res.json();
      if (json.success) {
        setInvoices((json.invoices || []).filter((i: Invoice) => i.status === 'offen' || i.status === 'ueberfaellig'));
      }
    } catch { /* still */ }
    setLoading(false);
  }, []);
  useEffect(() => { lade(); }, [lade]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result || ''));
      const parsedZeilen: Zeile[] = rows.map(felder => ({ text: felder.join(' '), betraege: findeBetraege(felder) }));
      setZeilen(parsedZeilen);
      abgleichen(parsedZeilen);
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  function abgleichen(parsedZeilen: Zeile[]) {
    const treffer: Vorschlag[] = [];
    for (const inv of invoices) {
      const offenerBetrag = Math.round((Number(inv.gross_amount) - Number(inv.paid_amount || 0)) * 100) / 100;
      for (const zeile of parsedZeilen) {
        const nummerGefunden = zeile.text.toUpperCase().includes(inv.invoice_number.toUpperCase());
        const betragGefunden = zeile.betraege.some(b => Math.abs(b - offenerBetrag) < 0.01);
        // NEU (Phase 38): Rechnungsnummer gefunden, aber Betrag passt nicht
        // zum vollen offenen Betrag → möglicher Teilbetrag statt Verwerfen.
        const teilBetrag = !betragGefunden
          ? zeile.betraege.find(b => b > 0 && b < offenerBetrag)
          : undefined;
        if (nummerGefunden || betragGefunden) {
          treffer.push({ invoice: inv, zeile, nummerGefunden, betragGefunden, teilBetrag });
          break; // pro Rechnung nur der erste Treffer
        }
      }
    }
    setVorschlaege(treffer);
    // Nur eindeutige Treffer (Nummer UND voller Betrag) vorab anhaken – alles
    // andere (inkl. mögliche Teilzahlungen) bewusst zur Prüfung.
    setAusgewaehlt(new Set(treffer.filter(t => t.nummerGefunden && t.betragGefunden).map(t => t.invoice.id)));
    setMsg(null);
  }

  function toggle(id: string) {
    setAusgewaehlt(prev => {
      const neu = new Set(prev);
      neu.has(id) ? neu.delete(id) : neu.add(id);
      return neu;
    });
  }

  async function verbuchenJetzt() {
    if (ausgewaehlt.size === 0) return;
    setVerbuchen(true);
    setMsg(null);
    let ok = 0, fehler = 0;
    for (const id of ausgewaehlt) {
      const treffer = vorschlaege.find(v => v.invoice.id === id);
      try {
        if (treffer?.teilBetrag) {
          // NEU (Phase 38): Teilbetrag über die Zahlungs-API buchen, statt
          // die Rechnung fälschlich komplett auf "bezahlt" zu setzen.
          const res = await fetch('/api/invoice-payments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoice_id: id, amount: treffer.teilBetrag }),
          });
          const json = await res.json();
          if (json.success) ok++; else fehler++;
        } else {
          const res = await fetch('/api/invoices', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: 'bezahlt', paid_amount: treffer ? Number(treffer.invoice.gross_amount) : undefined }),
          });
          const json = await res.json();
          if (json.success) ok++; else fehler++;
        }
      } catch { fehler++; }
    }
    setMsg({ ok: fehler === 0, text: `✅ ${ok} Rechnung(en) verbucht.${fehler ? ` ❌ ${fehler} fehlgeschlagen.` : ''}` });
    setVerbuchen(false);
    setVorschlaege([]); setZeilen([]); setAusgewaehlt(new Set());
    lade();
  }

  return (
    <div className="min-h-screen bg-[#fbfbfd] p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold text-[#1d1d1f]">💳 Zahlungsabgleich</h1>
          <p className="text-[#86868b] mt-1">Kontoauszug (CSV) hochladen – passende offene Rechnungen werden vorgeschlagen, du bestätigst vor dem Buchen.</p>
        </header>

        <section className="bg-white border border-black/5 rounded-2xl p-5">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-black/10 rounded-xl py-8 cursor-pointer hover:border-[#e8590c] transition">
            <Upload className="h-8 w-8 text-[#86868b]" />
            <span className="text-sm text-[#1d1d1f] font-medium">Kontoauszug (CSV) auswählen</span>
            <span className="text-xs text-[#86868b]">z.B. Export aus dem Online-Banking, Trennzeichen ; oder ,</span>
            <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
          </label>
          {zeilen.length > 0 && <p className="text-xs text-[#86868b] mt-3">{zeilen.length} Zeilen eingelesen, {invoices.length} offene Rechnungen geprüft.</p>}
        </section>

        {loading ? (
          <p className="text-sm text-[#86868b]">Lade offene Rechnungen…</p>
        ) : vorschlaege.length > 0 ? (
          <section className="bg-white border border-black/5 rounded-2xl p-5 space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-1.5"><FileText className="h-4 w-4 text-[#e8590c]" /> Vorschläge ({vorschlaege.length})</h2>
            <ul className="space-y-2">
              {vorschlaege.map(v => (
                <li key={v.invoice.id} className="flex items-start gap-3 border border-black/10 rounded-xl p-3">
                  <input type="checkbox" checked={ausgewaehlt.has(v.invoice.id)} onChange={() => toggle(v.invoice.id)} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[#1d1d1f]">{v.invoice.invoice_number}</span>
                      <span className="text-[#86868b]">{v.invoice.customer_name}</span>
                      <span className="font-bold ml-auto">{Number(v.invoice.gross_amount).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span>
                    </div>
                    <p className="text-xs text-[#86868b] truncate mt-0.5">Zeile: {v.zeile.text}</p>
                    <div className="flex gap-1.5 mt-1">
                      {v.nummerGefunden && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Rechnungsnr. gefunden</span>}
                      {v.betragGefunden && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Betrag stimmt</span>}
                      {v.teilBetrag && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Teilzahlung: {v.teilBetrag.toFixed(2)} € (Rest bleibt offen)</span>}
                      {!v.nummerGefunden && !v.betragGefunden && !v.teilBetrag && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Unsicher – bitte prüfen</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <button
              onClick={verbuchenJetzt}
              disabled={verbuchen || ausgewaehlt.size === 0}
              className="w-full rounded-xl bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 text-white py-3 font-semibold flex items-center justify-center gap-2"
            >
              <Check className="h-4 w-4" /> {verbuchen ? 'Bucht…' : `${ausgewaehlt.size} ausgewählte Rechnung(en) als bezahlt buchen`}
            </button>
          </section>
        ) : zeilen.length > 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-700 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Keine Übereinstimmungen zu offenen Rechnungen gefunden.
          </div>
        ) : null}

        {msg && (
          <div className={`rounded-xl p-4 ${msg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
