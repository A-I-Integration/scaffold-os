'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck, ChevronLeft, ChevronRight, Loader2, Phone, Video,
} from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Terminbuchung (Startseite, nur Master)
// Mini-Kalender + Uhrzeit-Slots + Kontaktformular.
// Buchen läuft über /api/lead/termin (Slot wird in der
// Master-DB reserviert, Doppelbuchungen sind ausgeschlossen).
// ============================================================

const SLOTS = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];
const MAX_TAGE_VORAUS = 60;
const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function zuIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${t}`;
}

function plusTage(d: Date, tage: number): Date {
  const kopie = new Date(d);
  kopie.setDate(kopie.getDate() + tage);
  return kopie;
}

function datumLangDe(iso: string): string {
  const [j, m, t] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(j, m - 1, t));
}

const inputCls =
  'w-full rounded-xl border border-black/10 bg-[#fbfbfd] px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-[#e8590c]/40 focus:border-[#e8590c] transition';

export default function TerminBuchung() {
  const heute = useMemo(() => new Date(), []);
  const heuteIso = zuIso(heute);
  const maxIso = zuIso(plusTage(heute, MAX_TAGE_VORAUS));

  const [monat, setMonat] = useState(() => new Date(heute.getFullYear(), heute.getMonth(), 1));
  const [datum, setDatum] = useState<string | null>(null);
  const [uhrzeit, setUhrzeit] = useState<string | null>(null);
  const [belegt, setBelegt] = useState<Set<string>>(new Set());

  const [art, setArt] = useState<'telefon' | 'videocall'>('videocall');
  const [name, setName] = useState('');
  const [firma, setFirma] = useState('');
  const [email, setEmail] = useState('');
  const [telefon, setTelefon] = useState('');
  const [nachricht, setNachricht] = useState('');
  const [dsgvo, setDsgvo] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  const [status, setStatus] = useState<'idle' | 'laden' | 'gesendet' | 'fehler'>('idle');
  const [fehlerText, setFehlerText] = useState('');

  // Belegte Slots laden
  async function ladeBelegt() {
    try {
      const res = await fetch('/api/lead/termin', { cache: 'no-store' });
      if (!res.ok) return;
      const daten = (await res.json()) as { belegt?: { datum: string; uhrzeit: string }[] };
      setBelegt(new Set((daten.belegt || []).map((b) => `${b.datum}|${b.uhrzeit}`)));
    } catch {
      // Kalender bleibt nutzbar; der Server prüft beim Buchen nochmal
    }
  }
  useEffect(() => {
    ladeBelegt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kalender-Tage des angezeigten Monats
  const kalender = useMemo(() => {
    const jahr = monat.getFullYear();
    const m = monat.getMonth();
    const anzahlTage = new Date(jahr, m + 1, 0).getDate();
    const startOffset = (new Date(jahr, m, 1).getDay() + 6) % 7; // Montag = 0
    const zellen: ({ iso: string; tag: number; deaktiviert: boolean; voll: boolean } | null)[] = [];
    for (let i = 0; i < startOffset; i++) zellen.push(null);
    for (let tag = 1; tag <= anzahlTage; tag++) {
      const d = new Date(jahr, m, tag);
      const iso = zuIso(d);
      const wochenende = d.getDay() === 0 || d.getDay() === 6;
      const vergangen = iso <= heuteIso;
      const zuWeit = iso > maxIso;
      const voll = SLOTS.every((s) => belegt.has(`${iso}|${s}`));
      zellen.push({ iso, tag, deaktiviert: wochenende || vergangen || zuWeit || voll, voll });
    }
    return zellen;
  }, [monat, belegt, heuteIso, maxIso]);

  const monatTitel = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(monat);
  const vorMonatDeaktiviert = monat <= new Date(heute.getFullYear(), heute.getMonth(), 1);
  const naechsterMonatDeaktiviert =
    new Date(monat.getFullYear(), monat.getMonth() + 1, 1) > plusTage(heute, MAX_TAGE_VORAUS);

  async function buchen(e: React.FormEvent) {
    e.preventDefault();
    if (!datum || !uhrzeit) {
      setFehlerText('Bitte wählen Sie links ein Datum und eine Uhrzeit.');
      setStatus('fehler');
      return;
    }
    setStatus('laden');
    setFehlerText('');
    try {
      const res = await fetch('/api/lead/termin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datum, uhrzeit, art, name, firma, email, telefon, nachricht, dsgvo, website: honeypot,
        }),
      });
      const daten = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        setFehlerText(daten.error || 'Dieser Termin wurde soeben vergeben.');
        setStatus('fehler');
        setUhrzeit(null);
        ladeBelegt();
        return;
      }
      if (!res.ok) {
        setFehlerText(daten.error || 'Buchung fehlgeschlagen. Bitte versuchen Sie es erneut.');
        setStatus('fehler');
        return;
      }
      setStatus('gesendet');
    } catch {
      setFehlerText('Verbindungsfehler. Bitte prüfen Sie Ihre Internetverbindung.');
      setStatus('fehler');
    }
  }

  // ─── Erfolgsansicht ───
  if (status === 'gesendet' && datum && uhrzeit) {
    return (
      <div className="rounded-3xl bg-white border border-black/5 shadow-xl shadow-black/5 p-10 md:p-14 text-center">
        <CalendarCheck className="w-12 h-12 text-[#e8590c] mx-auto" strokeWidth={1.5} />
        <h3 className="mt-5 text-2xl font-semibold tracking-tight">Termin gebucht!</h3>
        <p className="mt-3 text-[#6e6e73] leading-relaxed max-w-md mx-auto">
          <strong className="text-[#1d1d1f]">{datumLangDe(datum)}, {uhrzeit} Uhr</strong>
          {' '}({art === 'telefon' ? 'Telefonat' : 'Videocall'})
        </p>
        <p className="mt-4 text-[#6e6e73] leading-relaxed max-w-md mx-auto">
          Die Bestätigung ist unterwegs an <strong className="text-[#1d1d1f]">{email}</strong>.
          Wir freuen uns auf das Gespräch!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white border border-black/5 shadow-xl shadow-black/5 p-6 md:p-10">
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">

        {/* ─── Links: Kalender + Uhrzeiten ─── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setMonat(new Date(monat.getFullYear(), monat.getMonth() - 1, 1))}
              disabled={vorMonatDeaktiviert}
              aria-label="Vorheriger Monat"
              className="p-2 rounded-full hover:bg-black/5 disabled:opacity-20 disabled:hover:bg-transparent transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <p className="font-semibold tracking-tight">{monatTitel}</p>
            <button
              type="button"
              onClick={() => setMonat(new Date(monat.getFullYear(), monat.getMonth() + 1, 1))}
              disabled={naechsterMonatDeaktiviert}
              aria-label="Nächster Monat"
              className="p-2 rounded-full hover:bg-black/5 disabled:opacity-20 disabled:hover:bg-transparent transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-[#86868b] mb-1">
            {WOCHENTAGE.map((w) => <span key={w} className="py-1">{w}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {kalender.map((zelle, i) =>
              zelle === null ? (
                <span key={`leer-${i}`} />
              ) : (
                <button
                  key={zelle.iso}
                  type="button"
                  disabled={zelle.deaktiviert}
                  onClick={() => { setDatum(zelle.iso); setUhrzeit(null); setStatus('idle'); }}
                  className={`aspect-square rounded-full text-sm font-medium transition
                    ${datum === zelle.iso
                      ? 'bg-[#e8590c] text-white shadow-md shadow-[#e8590c]/30'
                      : zelle.deaktiviert
                        ? 'text-black/20 cursor-not-allowed'
                        : 'hover:bg-[#e8590c]/10 text-[#1d1d1f]'}`}
                >
                  {zelle.tag}
                </button>
              )
            )}
          </div>

          {/* Uhrzeiten */}
          {datum && (
            <div className="mt-6">
              <p className="text-sm font-semibold mb-3">
                Uhrzeit am {datumLangDe(datum)}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {SLOTS.map((slot) => {
                  const vergeben = belegt.has(`${datum}|${slot}`);
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={vergeben}
                      onClick={() => { setUhrzeit(slot); setStatus('idle'); }}
                      className={`rounded-xl px-2 py-2.5 text-sm font-medium border transition
                        ${uhrzeit === slot
                          ? 'bg-[#e8590c] text-white border-[#e8590c] shadow-md shadow-[#e8590c]/30'
                          : vergeben
                            ? 'border-black/5 text-black/25 line-through cursor-not-allowed bg-black/[0.02]'
                            : 'border-black/10 hover:border-[#e8590c] hover:text-[#e8590c]'}`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ─── Rechts: Formular ─── */}
        <form onSubmit={buchen} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setArt('videocall')}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition
                ${art === 'videocall' ? 'border-[#e8590c] ring-2 ring-[#e8590c]/30 text-[#e8590c]' : 'border-black/10 text-[#6e6e73] hover:border-black/25'}`}
            >
              <Video className="w-4 h-4" /> Videocall
            </button>
            <button
              type="button"
              onClick={() => setArt('telefon')}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition
                ${art === 'telefon' ? 'border-[#e8590c] ring-2 ring-[#e8590c]/30 text-[#e8590c]' : 'border-black/10 text-[#6e6e73] hover:border-black/25'}`}
            >
              <Phone className="w-4 h-4" /> Telefon
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <input required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ihr Name*" className={inputCls} maxLength={100} />
            <input required value={firma} onChange={(e) => setFirma(e.target.value)}
              placeholder="Firma*" className={inputCls} maxLength={200} />
          </div>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="E-Mail-Adresse*" className={inputCls} maxLength={200} />
          {art === 'telefon' && (
            <input required value={telefon} onChange={(e) => setTelefon(e.target.value)}
              placeholder="Telefonnummer*" className={inputCls} maxLength={50} />
          )}
          <textarea value={nachricht} onChange={(e) => setNachricht(e.target.value)}
            placeholder="Worum geht es? (optional)" rows={3} className={inputCls} maxLength={2000} />

          {/* Honeypot gegen Spam-Bots – für Menschen unsichtbar */}
          <input
            type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1} autoComplete="off" aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />

          <label className="flex items-start gap-3 text-[13px] text-[#6e6e73] leading-relaxed cursor-pointer">
            <input
              type="checkbox" checked={dsgvo} onChange={(e) => setDsgvo(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#e8590c]"
            />
            <span>
              Ich habe die <a href="/datenschutz" target="_blank" className="text-[#e8590c] underline underline-offset-2">Datenschutzerklärung</a> gelesen
              und bin mit der Verarbeitung meiner Angaben zur Terminabstimmung einverstanden.*
            </span>
          </label>

          {status === 'fehler' && fehlerText && (
            <p className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {fehlerText}
            </p>
          )}

          <button
            type="submit"
            disabled={status === 'laden'}
            className="w-full rounded-full bg-[#e8590c] hover:bg-[#d14e06] disabled:opacity-60 text-white font-semibold py-3.5 text-[15px] transition shadow-lg shadow-[#e8590c]/25 flex items-center justify-center gap-2"
          >
            {status === 'laden' && <Loader2 className="w-4 h-4 animate-spin" />}
            {datum && uhrzeit
              ? `Termin buchen: ${datumLangDe(datum)}, ${uhrzeit} Uhr`
              : 'Bitte Datum & Uhrzeit wählen'}
          </button>
          <p className="text-center text-xs text-[#86868b]">
            60 Minuten, kostenlos & unverbindlich – wir zeigen Ihnen SCAFFOLD OS live.
          </p>
        </form>
      </div>
    </div>
  );
}
