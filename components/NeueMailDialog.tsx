'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Send, Paperclip } from 'lucide-react';
import { holePdfBase64FuerVersand, type Invoice } from '@/lib/invoice-pdf';
import { istGueltigeEmail } from '@/lib/email-verlauf';
import { empfaengerListe } from '@/lib/email-kunde';

// ============================================================
// SCAFFOLD OS – "Neue Mail" beim Kunden (E-Mails-Reiter)
//
// Empfänger: Liste (Kunden-Adresse, Ansprechpartner, früher verwendet)
// ODER freie Eingabe. Optional eine Rechnung dieses Kunden als PDF
// anhängen. Gesendet wird über /api/kunden/[id]/mail – die Mail wird
// dort fest diesem Kunden zugeordnet.
// ============================================================

const TYP: Record<string, string> = { standard: 'Rechnung', abschlag: 'Abschlag', schluss: 'Schlussrechnung', gutschrift: 'Gutschrift' };
const FREI = '__frei__';
const INPUT = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]';

interface Props {
  kunde: { id: string; name: string; email?: string | null };
  rechnungen: Invoice[];
  bisherigeAdressen: string[];
  fruehereAngebote?: { id: string; subject: string; sent_at: string; attachment_name?: string | null }[];
  onClose: () => void;
  onSent: () => void;
}

export default function NeueMailDialog({ kunde, rechnungen, bisherigeAdressen, fruehereAngebote = [], onClose, onSent }: Props) {
  const [kontakte, setKontakte] = useState<{ name: string; email: string | null; bezeichnung: string | null }[]>([]);
  const [auswahl, setAuswahl] = useState<string>('');
  const [frei, setFrei] = useState('');
  const [rechnungNr, setRechnungNr] = useState('');
  const [angebotMailId, setAngebotMailId] = useState('');
  const [betreff, setBetreff] = useState('');
  const [text, setText] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let aktiv = true;
    fetch(`/api/kunden-kontakte?customer_id=${kunde.id}`)
      .then((r) => r.json())
      .then((j) => { if (aktiv && j?.success) setKontakte(j.contacts || []); })
      .catch(() => { /* Ansprechpartner optional */ });
    return () => { aktiv = false; };
  }, [kunde.id]);

  const liste = useMemo(
    () => empfaengerListe({ kundenEmail: kunde.email, kundenName: kunde.name, kontakte, bisherige: bisherigeAdressen }),
    [kunde.email, kunde.name, kontakte, bisherigeAdressen]
  );

  // Erste Adresse der Liste vorauswählen, sobald sie da ist
  useEffect(() => {
    if (auswahl === '') setAuswahl(liste[0]?.email || FREI);
  }, [liste, auswahl]);

  const empfaenger = (auswahl === FREI ? frei : auswahl).trim();
  const inv = rechnungen.find((r) => r.invoice_number === rechnungNr) || null;

  function waehleAngebot(mailId: string) {
    setAngebotMailId(mailId);
    setRechnungNr('');
    const a = fruehereAngebote.find((x) => x.id === mailId);
    if (a) {
      if (!betreff.trim()) setBetreff(a.subject);
      if (!text.trim()) setText('Guten Tag,\n\nanbei erhalten Sie unser Angebot.\n\nBei Fragen melden Sie sich gerne.\n\nMit freundlichen Grüßen');
    }
  }

  function waehleRechnung(nr: string) {
    setRechnungNr(nr);
    if (nr) setAngebotMailId('');
    const r = rechnungen.find((x) => x.invoice_number === nr);
    if (r) {
      const art = TYP[r.invoice_type || 'standard'] || 'Rechnung';
      if (!betreff.trim()) setBetreff(`${art} ${r.invoice_number}`);
      if (!text.trim()) setText(`Guten Tag,\n\nanbei erhalten Sie ${art === 'Rechnung' ? 'die Rechnung' : `die ${art}`} ${r.invoice_number}.\n\nBei Fragen melden Sie sich gerne.\n\nMit freundlichen Grüßen`);
    }
  }

  async function senden() {
    if (!istGueltigeEmail(empfaenger)) { setMeldung({ ok: false, text: 'Bitte eine gültige Empfänger-Adresse wählen oder eingeben.' }); return; }
    if (!betreff.trim()) { setMeldung({ ok: false, text: 'Bitte einen Betreff eingeben.' }); return; }
    if (!text.trim()) { setMeldung({ ok: false, text: 'Bitte eine Nachricht eingeben.' }); return; }
    if (!window.confirm(`Mail „${betreff.trim()}“ jetzt an ${empfaenger} senden?`)) return;
    setLaeuft(true); setMeldung(null);
    try {
      let pdfBase64: string | undefined;
      let pdfName: string | undefined;
      if (inv) {
        const r = await holePdfBase64FuerVersand(inv);
        pdfBase64 = r.pdfBase64;
        pdfName = `${TYP[inv.invoice_type || 'standard'] || 'Rechnung'}_${inv.invoice_number}.pdf`;
      }
      const res = await fetch(`/api/kunden/${kunde.id}/mail`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: empfaenger, subject: betreff.trim(), text, invoiceNumber: inv?.invoice_number, pdfBase64, pdfName, anhangMailId: angebotMailId || undefined }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Senden fehlgeschlagen');
      setMeldung({
        ok: true,
        text: json.protokolliert === false
          ? `Mail an ${empfaenger} wurde gesendet, konnte aber nicht im Verlauf gespeichert werden.`
          : `Mail an ${empfaenger} gesendet.`,
      });
      onSent();
    } catch (e: any) {
      setMeldung({ ok: false, text: e.message });
    } finally {
      setLaeuft(false);
    }
  }

  const gesendet = meldung?.ok === true;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#1d1d1f]">Neue Mail an {kunde.name}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5" aria-label="Schließen"><X className="h-4 w-4" /></button>
        </div>

        <div>
          <label className="block text-xs text-[#86868b] mb-1">Empfänger</label>
          <select value={auswahl} onChange={(e) => setAuswahl(e.target.value)} className={INPUT}>
            {liste.map((l) => <option key={l.email} value={l.email}>{l.email} – {l.label}</option>)}
            <option value={FREI}>Andere Adresse eingeben …</option>
          </select>
          {auswahl === FREI && (
            <input type="email" value={frei} onChange={(e) => setFrei(e.target.value)} placeholder="name@firma.de" className={`${INPUT} mt-2`} autoFocus />
          )}
        </div>

        <div>
          <label className="block text-xs text-[#86868b] mb-1 flex items-center gap-1"><Paperclip className="h-3 w-3" /> Rechnung anhängen (optional)</label>
          <select value={rechnungNr} onChange={(e) => waehleRechnung(e.target.value)} className={INPUT}>
            <option value="">Keine – freie Mail</option>
            {rechnungen.map((r) => (
              <option key={r.id} value={r.invoice_number}>
                {TYP[r.invoice_type || 'standard'] || 'Rechnung'} {r.invoice_number} · {Number(r.gross_amount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </option>
            ))}
          </select>
        </div>

        {fruehereAngebote.length > 0 && (
          <div>
            <label className="block text-xs text-[#86868b] mb-1 flex items-center gap-1"><Paperclip className="h-3 w-3" /> Früher versendetes Angebot (PDF) anhängen (optional)</label>
            <select value={angebotMailId} onChange={(e) => waehleAngebot(e.target.value)} className={INPUT}>
              <option value="">Kein Angebot</option>
              {fruehereAngebote.map((a) => (
                <option key={a.id} value={a.id}>{a.subject} · {new Date(a.sent_at).toLocaleDateString('de-DE')}{a.attachment_name ? ` · ${a.attachment_name}` : ''}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs text-[#86868b] mb-1">Betreff</label>
          <input value={betreff} onChange={(e) => setBetreff(e.target.value)} maxLength={200} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs text-[#86868b] mb-1">Nachricht</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className={INPUT} />
        </div>

        {meldung && <p className={`text-sm ${meldung.ok ? 'text-green-700' : 'text-red-600'}`}>{meldung.text}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-2 rounded-lg bg-black/5 hover:bg-black/10 text-sm">{gesendet ? 'Schließen' : 'Abbrechen'}</button>
          {!gesendet && (
            <button onClick={senden} disabled={laeuft} className="px-4 py-2 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
              <Send className="h-4 w-4" /> {laeuft ? 'Sendet …' : 'Senden'}
            </button>
          )}
        </div>
        <p className="text-[11px] text-[#86868b]">Die Mail wird mit diesem Kunden gespeichert und erscheint nur in seinem Verlauf. Absender: SCAFFOLD OS.</p>
      </div>
    </div>
  );
}
