'use client';

import { useState } from 'react';
import { X, Paperclip, Send } from 'lucide-react';
import { entferneTrackingPixel, istGueltigeEmail } from '@/lib/email-verlauf';

// ============================================================
// SCAFFOLD OS – E-Mail-Verlauf: versendete Mail ansehen + erneut senden
// Inhalt/Anhang gibt es nur für Mails ab Phase 97 (ältere: nur Kopfdaten).
// ============================================================

export interface EmailVerlaufEintrag {
  id: string;
  type: string;
  to_email: string;
  subject: string;
  invoice_number: string | null;
  sent_at: string;
  body_html?: string | null;
  attachment_path?: string | null;
  attachment_name?: string | null;
}

export default function EmailVerlaufDialog({ mail, onClose, onResent }: { mail: EmailVerlaufEintrag; onClose: () => void; onResent?: () => void }) {
  const [to, setTo] = useState(mail.to_email);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const hatInhalt = !!mail.body_html;
  const anhangUrl = mail.attachment_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/project-media/${mail.attachment_path}`
    : null;

  async function erneutSenden() {
    if (!istGueltigeEmail(to)) { setMeldung({ ok: false, text: 'Bitte eine gültige E-Mail-Adresse eingeben.' }); return; }
    if (!window.confirm(`Mail „${mail.subject}“ jetzt erneut an ${to.trim()} senden?`)) return;
    setLaeuft(true); setMeldung(null);
    try {
      const res = await fetch('/api/email-log/resend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mail.id, to: to.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Senden fehlgeschlagen');
      setMeldung({ ok: true, text: `Erneut gesendet an ${to.trim()}.` });
      onResent?.();
    } catch (e: any) {
      setMeldung({ ok: false, text: e?.message || 'Senden fehlgeschlagen' });
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#1d1d1f] break-words">{mail.subject}</h3>
            <p className="text-[11px] text-[#86868b]">Gesendet am {new Date(mail.sent_at).toLocaleString('de-DE')} an {mail.to_email}</p>
          </div>
          <button onClick={onClose} aria-label="Schließen" className="p-1 rounded-lg hover:bg-black/5"><X className="h-4 w-4" /></button>
        </div>

        {hatInhalt ? (
          <iframe title="Mail-Vorschau" sandbox="" srcDoc={entferneTrackingPixel(mail.body_html || '')} className="w-full h-72 rounded-lg border border-black/10 bg-white" />
        ) : (
          <p className="rounded-lg bg-[#f5f5f7] p-3 text-xs text-[#86868b]">
            Bei dieser Mail wurden Inhalt und Anhang nicht gespeichert (sie wurde vor dieser Funktion versendet). Erneutes Senden ist hier nicht möglich – bitte das Angebot bzw. die Rechnung neu versenden.
          </p>
        )}

        {anhangUrl && (
          <a href={anhangUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-xs font-semibold text-[#1d1d1f] hover:bg-black/5">
            <Paperclip className="h-3.5 w-3.5" /> {mail.attachment_name || 'Anhang (PDF)'} öffnen
          </a>
        )}

        {hatInhalt && (
          <div className="space-y-2 border-t border-black/5 pt-3">
            <label className="block text-xs text-[#86868b]">Empfänger für erneuten Versand</label>
            <div className="flex gap-2">
              <input type="email" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm" />
              <button onClick={erneutSenden} disabled={laeuft} className="inline-flex items-center gap-1.5 rounded-lg bg-[#e8590c] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
                <Send className="h-3.5 w-3.5" /> {laeuft ? 'Sendet …' : 'Erneut senden'}
              </button>
            </div>
          </div>
        )}
        {meldung && <p className={`text-xs ${meldung.ok ? 'text-emerald-600' : 'text-red-600'}`}>{meldung.text}</p>}
      </div>
    </div>
  );
}
