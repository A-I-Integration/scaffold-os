'use client';

import { useState, ReactNode } from 'react';
import { HelpCircle, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Hilfe-Bereich (Prio-2-Sprint)
//
// Das Benutzerhandbuch direkt in der App – für alle Rollen.
// Inhalt spiegelt public/handbuch.pdf (beim Erweitern beide
// Stellen pflegen). Aufklappbare Abschnitte, suchtauglich.
// ============================================================

interface HilfeAbschnitt {
  titel: string;
  inhalt: ReactNode;
}

const ABSCHNITTE: HilfeAbschnitt[] = [
  {
    titel: 'Erste Schritte nach dem Kauf',
    inhalt: (
      <ol className="list-decimal list-inside space-y-1">
        <li>Willkommens-E-Mail öffnen – dort stehen Ihre Adresse und Ihre Admin-Zugangsdaten.</li>
        <li>Auf Ihrer Firmen-Adresse (z. B. ihr-name.scaffoldos.de) einloggen.</li>
        <li><b>Einstellungen</b> öffnen und das Firmenprofil ausfüllen (Pflicht für Rechnungen).</li>
        <li>Unter <b>Zugänge</b> Ihre Mitarbeiter anlegen und Rollen vergeben.</li>
        <li>Unter <b>Datenpflege</b> Fahrzeuge, Fahrer und Lagerbestand eintragen.</li>
      </ol>
    ),
  },
  {
    titel: 'Aufmaß und Angebot erstellen (Schritt 1–6)',
    inhalt: (
      <ol className="list-decimal list-inside space-y-1">
        <li>Menü <b>Aufmaß</b> → Projekt anlegen (Kunde, Adresse, Fotos möglich).</li>
        <li>Schritte 2–5 ausfüllen: Maße, Gerüst, Umgebung, Zusammenfassung.</li>
        <li>Schritt 6: <b>„KI Planung starten"</b> → Materialliste, Preis und Risiko prüfen.</li>
        <li>Bei Bedarf Skonto, Mietverlängerung, Nachtrag oder Rabatt anpassen.</li>
        <li><b>Projekt speichern</b>, dann Angebot als PDF oder direkt per E-Mail an den Kunden.</li>
        <li>Vor Ort: Kunde kann direkt <b>digital unterschreiben</b> → Status „Angenommen".</li>
        <li>Projekte lassen sich später über das <b>Dashboard</b> wieder öffnen – alle Daten inklusive KI-Ergebnis bleiben gespeichert.</li>
      </ol>
    ),
  },
  {
    titel: 'Rechnungen schreiben',
    inhalt: (
      <ol className="list-decimal list-inside space-y-1">
        <li>Menü <b>Rechnungen</b> → „Neue Rechnung" – oder aus einem angenommenen Angebot per Klick auf „Rechnung erstellen" (Positionen werden übernommen).</li>
        <li>Typ wählen: Vollrechnung, Abschlags- oder Schlussrechnung.</li>
        <li>Positionen eintragen, USt-Satz wählen, Zahlungsziel prüfen (automatisch +14 Tage).</li>
        <li>Anlegen – die Nummer (RE-JAHR-0001 …) wird automatisch vergeben.</li>
        <li>PDF herunterladen oder direkt per <b>E-Mail an den Kunden</b> senden (Briefumschlag-Symbol).</li>
        <li>Status pflegen: offen → bezahlt / überfällig / storniert.</li>
      </ol>
    ),
  },
  {
    titel: 'Mahnungen erstellen',
    inhalt: (
      <ol className="list-decimal list-inside space-y-1">
        <li>Überfällige Rechnungen zeigen ein <b>Warn-Symbol</b> (gelbes Dreieck).</li>
        <li>Klick darauf erstellt die <b>1. Mahnung</b> als PDF, optional direkt per E-Mail.</li>
        <li>Bleibt die Rechnung offen: Klick erzeugt die <b>2. Mahnung</b> (mit Hinweis auf Verzugszinsen).</li>
        <li>Die Mahnstufe wird in der Liste angezeigt (Badge „1. Mahnung" / „2. Mahnung").</li>
      </ol>
    ),
  },
  {
    titel: 'Touren, Routen-KI und Disposition',
    inhalt: (
      <ol className="list-decimal list-inside space-y-1">
        <li>Depot-Adresse einmalig unter <b>Einstellungen</b> hinterlegen – sie ist in der Routen-KI vorbefüllt.</li>
        <li>Morgens <b>Routen-KI</b> öffnen, Datum wählen, optimale Touren generieren und übernehmen.</li>
        <li>Im <b>Touren</b>-Cockpit Status und GPS der Fahrzeuge verfolgen.</li>
        <li>Bei kurzfristigen Änderungen: <b>Umdisposition</b> in der Routen-KI.</li>
      </ol>
    ),
  },
  {
    titel: 'Zeiterfassung und DATEV',
    inhalt: (
      <ol className="list-decimal list-inside space-y-1">
        <li>Mitarbeiter tragen Zeiten über <b>Meine Touren</b> (Handy) ein.</li>
        <li>Admin/Disposition prüft in der <b>Zeiterfassung</b>: Soll/Ist, Pausen, Überstunden; Korrekturen direkt dort.</li>
        <li>Exporte: <b>CSV</b> für Excel, <b>DATEV Lohn</b> für die Lohnabrechnung, <b>DATEV-Buchungsstapel</b> (im Rechnungsmodul) für die Buchhaltung.</li>
        <li>Vor dem ersten DATEV-Import: Personalnummern, Kontenrahmen und Berater-/Mandantennummer mit dem Steuerberater abstimmen.</li>
      </ol>
    ),
  },
  {
    titel: 'Rollen und Rechte',
    inhalt: (
      <ul className="list-disc list-inside space-y-1">
        <li><b>Admin:</b> alles, inkl. Datenpflege und Einstellungen.</li>
        <li><b>Disponent:</b> Büro-Arbeit – Planung, Touren, Rechnungen, Zugänge.</li>
        <li><b>Bauleiter:</b> Aufmaß, Planung, Lager, Zeiterfassung.</li>
        <li><b>Mitarbeiter:</b> nur „Meine Touren" (Einsätze, Zeiten, Fotos).</li>
        <li><b>Lager:</b> Lager und Prognose.</li>
      </ul>
    ),
  },
  {
    titel: 'Künstliche Intelligenz in SCAFFOLD OS',
    inhalt: (
      <div className="space-y-2">
        <p>SCAFFOLD OS nutzt KI (Mistral, EU-Anbieter) an fünf Stellen – jeweils mit dem Hinweis „KI-gestützt":</p>
        <ul className="list-disc list-inside space-y-1">
          <li><b>KI-Materialberechnung</b> (Aufmaß Schritt 6): Stückliste, Preis, Risiko als <b>Vorschlag</b>.</li>
          <li><b>Foto- und Grundriss-Analyse</b> (Schritt 1): erkannte Maße/Merkmale vorbefüllen das Aufmaß.</li>
          <li><b>Routen-KI</b>: schlägt optimale Touren vor – die Disposition entscheidet.</li>
          <li><b>Lager-Prognose</b>: Einschätzung, was wann knapp wird.</li>
        </ul>
        <p><b>Grundsatz:</b> Die KI macht Vorschläge, die fachliche Entscheidung trifft immer ein Mensch. Prüfen Sie KI-Ergebnisse, bevor Angebote rausgehen oder bestellt wird. Die KI analysiert Gebäude und Material – keine Personen, keine Bewertungen von Mitarbeitern.</p>
      </div>
    ),
  },
  {
    titel: 'Häufige Probleme',
    inhalt: (
      <ul className="list-disc list-inside space-y-1">
        <li><b>„Länge und Höhe fehlen":</b> Projekt über das Dashboard öffnen (Daten werden geladen), dann KI-Berechnung erneut starten.</li>
        <li><b>Rechnung ohne Bankdaten/Steuernummer:</b> Firmenprofil unter Einstellungen ausfüllen, Rechnung neu erstellen (alte Rechnungen bleiben bewusst unverändert – GoBD).</li>
        <li><b>Menüpunkt fehlt:</b> Rolle prüfen – Admin kann sie unter „Zugänge" anpassen.</li>
        <li><b>Passwort vergessen:</b> Auf der Login-Seite „Passwort vergessen" nutzen.</li>
      </ul>
    ),
  },
];

export default function HilfePage() {
  const [open, setOpen] = useState<number | null>(0);
  const [suche, setSuche] = useState('');

  const gefiltert = ABSCHNITTE.filter(
    (a) =>
      !suche ||
      a.titel.toLowerCase().includes(suche.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#fbfbfd] p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <HelpCircle className="h-8 w-8 text-[#e8590c]" />
          <div>
            <h1 className="text-2xl font-bold text-[#1d1d1f]">Hilfe</h1>
            <p className="text-sm text-[#86868b]">Anleitungen zu allen Funktionen – direkt in der App</p>
          </div>
        </div>

        <input
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Thema suchen (z. B. Rechnung, Mahnung, DATEV …)"
          className="w-full px-4 py-3 bg-[#f5f5f7] border border-black/10 rounded-xl text-sm text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#e8590c]"
        />

        <div className="space-y-2">
          {gefiltert.length === 0 && (
            <p className="text-[#86868b] text-sm">Nichts gefunden – versuchen Sie einen anderen Begriff oder schreiben Sie an info@scaffoldos.de.</p>
          )}
          {gefiltert.map((a) => {
            const idx = ABSCHNITTE.indexOf(a);
            const offen = open === idx;
            return (
              <div key={a.titel} className="bg-[#f5f5f7] rounded-xl border border-blue-500/20 overflow-hidden">
                <button
                  onClick={() => setOpen(offen ? null : idx)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <span className="font-semibold text-[#1d1d1f] text-sm">{a.titel}</span>
                  {offen
                    ? <ChevronDown className="h-4 w-4 text-[#e8590c] shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-[#86868b] shrink-0" />}
                </button>
                {offen && (
                  <div className="px-5 pb-4 text-sm text-[#424245]">
                    {a.inhalt}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-[#f5f5f7] rounded-xl border border-blue-500/20 p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-[#424245]">
            <b className="text-[#1d1d1f]">Weiterführend:</b> Das komplette Handbuch als PDF – oder direkt Support anfragen.
          </div>
          <div className="flex gap-2">
            <a
              href="/handbuch.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-black/10 hover:bg-black/15 px-4 py-2 text-sm font-semibold text-[#1d1d1f] transition-colors"
            >
              <BookOpen className="h-4 w-4" /> Handbuch (PDF)
            </a>
            <a
              href="mailto:info@scaffoldos.de"
              className="rounded-xl bg-[#e8590c] hover:bg-[#d9480f] px-4 py-2 text-sm font-bold text-white transition-colors"
            >
              Support: info@scaffoldos.de
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
