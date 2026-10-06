'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';

// Eignungs-Umfrage. Die Antworten gehen per E-Mail an AI Integration (/api/umfrage),
// es wird nichts in der Datenbank gespeichert.

const MITARBEITER = ['1–5', '6–10', '11–20', '21–50', 'mehr als 50'];
const FEHLT_OFT = ['Ja, häufig', 'Manchmal', 'Selten', 'Nie'];
const LAENDER = ['Deutschland', 'Österreich', 'Schweiz', 'Anderes Land'];
const WECHSEL = ['Ja, bald', 'Vielleicht, wenn es passt', 'Eher nicht', 'Wir nutzen aktuell keine Software'];

const inputCls =
  'w-full bg-white border border-black/10 rounded-lg px-4 py-2.5 text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#e8590c] transition-colors';

type Werte = Record<string, string>;

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-[#1d1d1f] mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export default function EignungsCheckFormular() {
  const [w, setW] = useState<Werte>({});
  const [einwilligung, setEinwilligung] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [laden, setLaden] = useState(false);
  const [fertig, setFertig] = useState(false);
  const [fehler, setFehler] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setW((v) => ({ ...v, [k]: e.target.value }));
  const text = (k: string, ph?: string) => (
    <input className={inputCls} value={w[k] || ''} onChange={set(k)} placeholder={ph} maxLength={300} />
  );
  const area = (k: string, ph?: string) => (
    <textarea className={inputCls} rows={3} value={w[k] || ''} onChange={set(k)} placeholder={ph} maxLength={1500} />
  );

  async function absenden(e: React.FormEvent) {
    e.preventDefault();
    setFehler('');
    setLaden(true);
    try {
      const res = await fetch('/api/umfrage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...w, einwilligung, website: honeypot }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) setFehler(json.error || 'Senden fehlgeschlagen – bitte später erneut versuchen.');
      else setFertig(true);
    } catch {
      setFehler('Keine Verbindung – bitte später erneut versuchen.');
    } finally {
      setLaden(false);
    }
  }

  if (fertig) {
    return (
      <div className="mt-10 rounded-2xl border border-black/5 bg-white p-8 text-center">
        <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Vielen Dank{w.name ? `, ${w.name.split(' ')[0]}` : ''}!</h2>
        <p className="text-[#6e6e73] mb-6">
          Wir lesen Ihre Antworten durch.
          {w.kontakt ? ' Wir melden uns in der Regel innerhalb von 2 Werktagen bei Ihnen.' : ' Da Sie keine Kontaktdaten angegeben haben, melden wir uns nicht von uns aus.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/anfrage?art=demo" className="bg-[#e8590c] hover:bg-[#d9480f] text-white font-medium px-6 py-2.5 rounded-full transition-colors">Demo anfordern</Link>
          <Link href="/" className="border border-black/10 hover:bg-black/5 font-medium px-6 py-2.5 rounded-full transition-colors">Zur Startseite</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={absenden} className="mt-10 space-y-8">
      {/* Honeypot: für Menschen unsichtbar */}
      <div className="hidden" aria-hidden="true">
        <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} name="website" />
      </div>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold mb-1">Zu Ihnen</legend>
        <Feld label="Name *"><input className={inputCls} required value={w.name || ''} onChange={set('name')} maxLength={100} autoComplete="name" /></Feld>
        <Feld label="In welchem Land sitzt Ihr Betrieb?">
          <select className={inputCls} value={w.land || ''} onChange={set('land')}>
            <option value="">Bitte wählen</option>
            {LAENDER.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Feld>
        <Feld label="Wie viele Mitarbeiter hat Ihr Betrieb?">
          <select className={inputCls} value={w.mitarbeiter || ''} onChange={set('mitarbeiter')}>
            <option value="">Bitte wählen</option>
            {MITARBEITER.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Feld>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold mb-1">Aufmaß und Material</legend>
        <Feld label="Wie machen Sie das Aufmaß?">{area('aufmassWie', 'z. B. Zollstock und Zettel, Foto, Laser, Drohne …')}</Feld>
        <Feld label="Wie lange dauert das?">{text('aufmassDauer', 'z. B. 1 Stunde pro Objekt')}</Feld>
        <Feld label="Wie wird das Material berechnet?">{area('materialWie')}</Feld>
        <Feld label="Wie führen Sie Ihr Lager?">{area('lagerWie', 'z. B. Excel, Zettel, Software, gar nicht')}</Feld>
        <Feld label="Fehlt oft etwas auf den Baustellen?">
          <select className={inputCls} value={w.fehltOft || ''} onChange={set('fehltOft')}>
            <option value="">Bitte wählen</option>
            {FEHLT_OFT.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Feld>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold mb-1">Angebot und Rechnung</legend>
        <Feld label="Wie entstehen bei Ihnen Kalkulation und Angebote?">{area('angebotWie')}</Feld>
        <Feld label="Wie lange dauert das?">{text('angebotDauer')}</Feld>
        <Feld label="Wie wird aus der geleisteten Arbeit eine Rechnung?">{area('rechnungWie')}</Feld>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold mb-1">Zum Schluss</legend>
        <Feld label="Welches Thema nervt Sie im Alltag am meisten?">{area('nervt')}</Feld>
        <Feld label="Welche Software nutzen Sie aktuell?">{text('software', 'z. B. Excel, Lexware, eigene Branchenlösung …')}</Feld>
        <Feld label="Was stört Sie an Ihrer aktuellen Lösung?">{area('softwareProblem')}</Feld>
        <Feld label="Würden Sie zu einer neuen Software wechseln?">
          <select className={inputCls} value={w.wechsel || ''} onChange={set('wechsel')}>
            <option value="">Bitte wählen</option>
            {WECHSEL.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Feld>
        <Feld label="Was müsste dafür stimmen?">{area('wechselBedingung', 'z. B. Preis, Datenübernahme, Einarbeitung …')}</Feld>
      </fieldset>

      <fieldset className="space-y-3 rounded-2xl bg-white border border-black/5 p-5">
        <legend className="text-lg font-semibold px-1">Möchten Sie, dass wir uns melden? (freiwillig)</legend>
        <Feld label="E-Mail oder Telefonnummer">
          <input className={inputCls} value={w.kontakt || ''} onChange={set('kontakt')} maxLength={150} autoComplete="email" />
        </Feld>
        <label className="flex gap-3 text-sm text-[#424245]">
          <input type="checkbox" className="mt-1 accent-[#e8590c]" checked={einwilligung} onChange={(e) => setEinwilligung(e.target.checked)} />
          <span>
            Ich bin einverstanden, dass AI Integration mich mit diesen Angaben zu SCAFFOLD OS kontaktiert.
            Die Antworten werden per E-Mail an uns übermittelt. Mehr dazu in der{' '}
            <Link href="/datenschutz" className="underline">Datenschutzerklärung</Link>.
          </span>
        </label>
      </fieldset>

      {fehler && <p className="text-sm text-red-600" role="alert">{fehler}</p>}
      <button
        type="submit"
        disabled={laden}
        className="inline-flex items-center gap-2 bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-60 text-white font-medium px-8 py-3 rounded-full transition-colors"
      >
        <Send className="w-4 h-4" /> {laden ? 'Wird gesendet …' : 'Antworten senden'}
      </button>
    </form>
  );
}
