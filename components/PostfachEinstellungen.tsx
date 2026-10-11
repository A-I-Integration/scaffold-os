'use client';

import { useEffect, useState } from 'react';
import { Mail, Plug, Unplug } from 'lucide-react';
import { ANBIETER, anbieterById, anbieterAusAdresse, type AnbieterId } from '@/lib/mail-provider';

// ============================================================
// SCAFFOLD OS – "Mein E-Mail-Postfach" (je eingeloggtem Nutzer)
//
// Verbindet das eigene Postfach per IMAP/SMTP mit (App-)Passwort.
// Gespeichert wird erst nach einem ECHTEN Verbindungstest
// (/api/email-accounts). Das Passwort wird serverseitig verschlüsselt
// und nie wieder angezeigt.
// ============================================================

interface Konto {
  id: string;
  email_address: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
}

const INPUT = 'w-full px-3 py-2 bg-black/10 border border-black/10 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]';

export default function PostfachEinstellungen() {
  const [eigenes, setEigenes] = useState<Konto | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const [anbieterId, setAnbieterId] = useState<AnbieterId>('andere');
  const [adresse, setAdresse] = useState('');
  const [passwort, setPasswort] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [imapSecure, setImapSecure] = useState(true);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [manuell, setManuell] = useState(false);

  async function ladeKonto() {
    try {
      const res = await fetch('/api/email-accounts');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Laden fehlgeschlagen');
      setEigenes(json.eigenes || null);
    } catch (e: any) {
      setFehler(e.message);
    } finally {
      setLaden(false);
    }
  }
  useEffect(() => { ladeKonto(); }, []);

  function waehleAnbieter(id: AnbieterId) {
    setAnbieterId(id);
    const a = anbieterById(id);
    setImapHost(a.imap_host); setImapPort(String(a.imap_port)); setImapSecure(a.imap_secure);
    setSmtpHost(a.smtp_host); setSmtpPort(String(a.smtp_port)); setSmtpSecure(a.smtp_secure);
    setManuell(id === 'andere');
  }

  function adresseGeaendert(v: string) {
    setAdresse(v);
    // Nur vorschlagen, solange noch kein Anbieter bewusst gewählt wurde.
    if (anbieterId === 'andere') {
      const erkannt = anbieterAusAdresse(v);
      if (erkannt) waehleAnbieter(erkannt);
    }
  }

  const anbieter = anbieterById(anbieterId);

  async function verbinden() {
    setFehler(null); setMeldung(null);
    if (anbieter.nurOAuth) { setFehler(anbieter.hinweis); return; }
    if (!adresse.trim() || !passwort || !imapHost.trim() || !smtpHost.trim()) {
      setFehler('Bitte Adresse, Passwort sowie IMAP- und SMTP-Server ausfüllen.');
      return;
    }
    setArbeitet(true);
    try {
      const res = await fetch('/api/email-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_address: adresse.trim(), password: passwort,
          imap_host: imapHost.trim(), imap_port: Number(imapPort), imap_secure: imapSecure,
          smtp_host: smtpHost.trim(), smtp_port: Number(smtpPort), smtp_secure: smtpSecure,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Verbinden fehlgeschlagen');
      setPasswort('');
      setMeldung('Postfach verbunden. Die Verbindung wurde getestet.');
      await ladeKonto();
    } catch (e: any) {
      setFehler(e.message);
    } finally {
      setArbeitet(false);
    }
  }

  async function trennen() {
    if (!confirm('Postfach wirklich trennen? Bereits archivierte Mails bleiben erhalten.')) return;
    setFehler(null); setMeldung(null); setArbeitet(true);
    try {
      const res = await fetch('/api/email-accounts', { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Trennen fehlgeschlagen');
      setMeldung('Postfach getrennt.');
      await ladeKonto();
    } catch (e: any) {
      setFehler(e.message);
    } finally {
      setArbeitet(false);
    }
  }

  return (
    <div className="bg-[#f5f5f7] rounded-xl p-6 border border-sky-500/30 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[#1d1d1f] flex items-center gap-2">
          <Mail className="h-5 w-5" /> Mein E-Mail-Postfach
        </h2>
        <p className="text-sm text-[#86868b]">
          Verbinde dein eigenes Postfach, damit Mails von dir selbst gesendet und beim Kunden
          angezeigt werden können. Jeder Nutzer verbindet sein eigenes Postfach.
        </p>
      </div>

      {laden ? (
        <p className="text-sm text-[#86868b]">Lädt…</p>
      ) : eigenes ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-black/5 p-3 text-sm text-[#1d1d1f]">
            <div className="font-semibold">{eigenes.email_address}</div>
            <div className="text-xs text-[#86868b]">
              Empfang: {eigenes.imap_host}:{eigenes.imap_port} · Versand: {eigenes.smtp_host}:{eigenes.smtp_port}
            </div>
          </div>
          <button
            onClick={trennen}
            disabled={arbeitet}
            className="rounded-xl border border-red-500/40 text-red-600 hover:bg-red-500/10 disabled:opacity-50 px-4 py-2 text-sm font-semibold flex items-center gap-2"
          >
            <Unplug className="h-4 w-4" /> Postfach trennen
          </button>
          <p className="text-xs text-[#86868b]">Zum Ändern einfach unten neu verbinden – das ersetzt die bisherige Verbindung.</p>
        </div>
      ) : (
        <p className="text-sm text-[#86868b]">Noch kein Postfach verbunden.</p>
      )}

      {!laden && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#86868b] mb-1">Anbieter</label>
            <select value={anbieterId} onChange={(e) => waehleAnbieter(e.target.value as AnbieterId)} className={INPUT}>
              {ANBIETER.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <p className="text-[11px] text-[#86868b] mt-1">{anbieter.hinweis}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#86868b] mb-1">E-Mail-Adresse</label>
              <input type="email" value={adresse} onChange={(e) => adresseGeaendert(e.target.value)} className={INPUT} autoComplete="off" />
            </div>
            <div>
              <label className="block text-xs text-[#86868b] mb-1">Passwort bzw. App-Passwort</label>
              <input type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} className={INPUT} autoComplete="new-password" />
            </div>
          </div>

          {!anbieter.nurOAuth && (
            <>
              <button type="button" onClick={() => setManuell(!manuell)} className="text-xs text-[#e8590c] underline">
                {manuell ? 'Servereinstellungen ausblenden' : 'Servereinstellungen anzeigen / ändern'}
              </button>
              {manuell && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-[#86868b] mb-1">IMAP-Server (Empfang)</label>
                    <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#86868b] mb-1">Port</label>
                    <input value={imapPort} onChange={(e) => setImapPort(e.target.value)} className={INPUT} inputMode="numeric" />
                  </div>
                  <label className="flex items-end gap-2 text-xs text-[#1d1d1f] pb-2">
                    <input type="checkbox" checked={imapSecure} onChange={(e) => setImapSecure(e.target.checked)} /> SSL/TLS
                  </label>
                  <div className="col-span-2">
                    <label className="block text-xs text-[#86868b] mb-1">SMTP-Server (Versand)</label>
                    <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#86868b] mb-1">Port</label>
                    <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className={INPUT} inputMode="numeric" />
                  </div>
                  <label className="flex items-end gap-2 text-xs text-[#1d1d1f] pb-2">
                    <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} /> SSL/TLS (465)
                  </label>
                </div>
              )}
            </>
          )}

          {fehler && <p className="text-sm text-red-600">{fehler}</p>}
          {meldung && <p className="text-sm text-green-700">{meldung}</p>}

          <button
            onClick={verbinden}
            disabled={arbeitet || anbieter.nurOAuth}
            className="w-full rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 py-3 font-bold text-white transition-colors flex items-center justify-center gap-2"
          >
            <Plug className="h-4 w-4" />
            {arbeitet ? 'Testet Verbindung…' : 'Verbindung testen und speichern'}
          </button>
          <p className="text-[11px] text-[#86868b]">
            Das Passwort wird verschlüsselt gespeichert und nie wieder angezeigt. Es wird erst gespeichert,
            wenn die Verbindung wirklich klappt.
          </p>
        </div>
      )}
    </div>
  );
}
