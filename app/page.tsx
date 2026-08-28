import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight, Ruler, FileText, Route, Timer, Warehouse, ShieldCheck, Check,
  Users, Package, Clock, Camera, QrCode, PenLine, MapPin, CalendarCheck,
  Sparkles, Globe, HardHat,
} from 'lucide-react';
import LandingHeader from '@/components/LandingHeader';
import AufmassDemo from '@/components/AufmassDemo';

// ============================================================
// SCAFFOLD OS – Startseite (Design v2 „Apple", erweitert)
// Hell, ruhig, großzügig. Marke: Sicherheits-Orange (#E8590C).
//
// Inhalt (Stand: Paket-Relaunch):
//  Hero mit Produkt-Aufklärung + Login-Link
//  „Was ist SCAFFOLD OS?" + Prozesskette (7 Schritte)
//  Zeitersparnis (≥ 2 Stunden/Tag)
//  3 Kernbereiche: Aufmaß, Mitarbeiter, Lager
//  Alle Funktionen im Überblick
//  3 Pakete: Starter 249 € / Priority 495 € / Enterprise 749 €
//  FAQ (SEO/GEO) + strukturierte Daten (JSON-LD)
// ============================================================

export const metadata: Metadata = {
  title: 'SCAFFOLD OS – Gerüstbau-Software: Aufmaß, Mitarbeiter, Lager & Rechnung in einem System',
  description:
    'SCAFFOLD OS ist die komplette Software für Gerüstbau-Betriebe: KI-Aufmaß mit Foto & Drohne, Angebot in Minuten, Disposition, Lager mit Prognose, Touren mit GPS, Zeiterfassung und GoBD-konforme Rechnung. 3 Tage kostenlos testen – ab 249 €/Monat.',
  keywords: [
    'Gerüstbau Software', 'Gerüstbau Aufmaß', 'Aufmaß Software Gerüstbau',
    'Gerüst Kalkulation', 'Gerüstbau Disposition', 'Lagerverwaltung Gerüstbau',
    'Zeiterfassung Gerüstbau', 'Gerüstbau App', 'DIN 12811', 'Gerüst Angebot erstellen',
  ],
  alternates: { canonical: 'https://scaffoldos.de' },
  openGraph: {
    title: 'SCAFFOLD OS – Die Software für Gerüstbau-Betriebe',
    description:
      'Vom Kundenanruf bis zur Rechnung: Aufmaß mit KI, Mitarbeiter & Zeiterfassung, Lager mit Prognose. 3 Tage kostenlos testen.',
    url: 'https://scaffoldos.de',
    siteName: 'SCAFFOLD OS',
    locale: 'de_DE',
    type: 'website',
  },
};

const PROZESS = [
  'Aufmaß', 'Angebot', 'Disposition', 'Lager', 'Touren', 'Zeiterfassung', 'Rechnung',
];

const KERNBEREICHE = [
  {
    icon: Ruler,
    titel: 'Aufmaß',
    claim: 'Vom Foto zum fertigen Angebot – in Minuten statt Stunden.',
    punkte: [
      'Baustelle in 6 geführten Schritten erfassen – am Handy, direkt vor Ort',
      'Fotos, Drohnen-Upload und GPS-Position automatisch verknüpft',
      'Punktwolken-Auswertung (3D-Scans) für exakte Maße ohne Nachmessen',
      'Hersteller-Systeme hinterlegt: Layher, MJ, Plettac, Alfix, Hünnebeck, Rux u. a. – mit echten Systemmaßen',
      'KI berechnet Materialliste und Kalkulation, DIN-12811-Check inklusive',
      'Fertiges Angebots-PDF mit QR-Code und digitaler Unterschrift – direkt per E-Mail an den Kunden',
    ],
  },
  {
    icon: Users,
    titel: 'Mitarbeiter',
    claim: 'Jeder Kollege hat seinen Zugang – und du hast den Überblick.',
    punkte: [
      'Zugänge mit Rollen: Admin, Disponent, Bauleiter, Mitarbeiter, Lager',
      'Zeiterfassung per Handy: Kommen/Gehen stempeln, Pausen automatisch nach Arbeitszeitgesetz',
      'Krank- und Urlaubsmeldungen fließen direkt in die Tagesplanung ein',
      'Soll-Ist-Vergleich und Überstunden auf einen Blick',
      'Jeder Monteur sieht nur seine Touren – der Chef sieht alles',
      'Onboarding-Assistent: Neuer Mitarbeiter ist in 2 Minuten angelegt',
    ],
  },
  {
    icon: Package,
    titel: 'Lager',
    claim: 'Du weißt immer, was wo liegt – bevor Material fehlt.',
    punkte: [
      'Alle Bestände digital erfasst – vom Rahmen bis zur Klemme',
      'Automatische Stückliste aus jedem Aufmaß: Was muss auf den Lkw?',
      'Reservierung pro Baustelle – kein Material wird doppelt verplant',
      'Prognose-KI warnt, bevor Bestände knapp werden',
      'Baustellenbestand (site_stock): Was ist beim Kunden verbaut, was kommt zurück?',
      'Funktioniert mit bis zu 10.000 / 20.000 / unbegrenzt vielen Teilen – je nach Paket',
    ],
  },
];

const ALLE_FUNKTIONEN = [
  { icon: Ruler, titel: 'Aufmaß & KI-Angebot', text: 'Baustelle in 6 Schritten erfassen – die KI liefert Materialliste, Kalkulation und Angebots-PDF.' },
  { icon: Camera, titel: 'Foto, Drohne & 3D-Scan', text: 'Fotos am Handy, Drohnen-Upload bis 20 MB, Punktwolken-Auswertung für Großscans.' },
  { icon: QrCode, titel: 'QR & Unterschrift', text: 'Angebot mit QR-Code und digitaler Unterschrift – der Kunde unterschreibt auf dem Handy.' },
  { icon: Route, titel: 'Touren & Disposition', text: 'Routen-KI plant den Tag, GPS zeigt die Fahrzeuge, Umdisposition bei Krankheit oder Wetter.' },
  { icon: MapPin, titel: 'Fahrer-Navigation & GPS', text: 'Fahrer navigieren direkt aus der App, die Zentrale sieht jede Position live.' },
  { icon: Timer, titel: 'Zeiterfassung', text: 'Stempeln am Handy, Pausen-Automatik, Soll-Ist-Vergleich, Überstunden – ohne Zettelwirtschaft.' },
  { icon: CalendarCheck, titel: 'Planung & Abwesenheiten', text: 'Krank und Urlaub direkt im Plan – Konflikte werden sofort sichtbar.' },
  { icon: Warehouse, titel: 'Lager & Prognose', text: 'Bestände im Blick, automatische Stückliste, KI warnt, bevor Material knapp wird.' },
  { icon: FileText, titel: 'Rechnungen & DATEV', text: 'GoBD-konforme Rechnungen mit Mahnwesen – Buchungsstapel und Lohndaten direkt für den Steuerberater.' },
  { icon: Sparkles, titel: 'KI überall', text: 'Materialberechnung, Routen-Vorschläge, Sprachnotizen, Foto-Analyse – die KI arbeitet im Hintergrund mit.' },
  { icon: PenLine, titel: 'Digitaler Zwilling', text: 'Jede Baustelle als digitales Modell – Änderungen am Gerüst bleiben dokumentiert.' },
  { icon: ShieldCheck, titel: 'Datenschutz aus Frankfurt', text: 'Eigene Datenbank pro Betrieb, EU-Hosting, DSGVO- und EU-AI-Act-konform.' },
];

const PAKETE = [
  {
    id: 'starter',
    name: 'Starter',
    preis: '249 €',
    zielgruppe: 'Für kleine Betriebe, die digital starten wollen.',
    features: [
      '1 Admin-/CEO-Zugang',
      '2 Dispo-Zugänge',
      'Bis zu 5 Mitarbeiter',
      'Lager bis 10.000 Teile',
      'Aufmaß mit KI-Angebot & PDF',
      'Zeiterfassung & Touren',
    ],
    hervorgehoben: false,
  },
  {
    id: 'priority',
    name: 'Priority',
    preis: '495 €',
    zielgruppe: 'Für wachsende Betriebe mit mehreren Kolonnen.',
    features: [
      'CEO-, Dispo-, Bauleiter- & Lager-Zugänge',
      'Bis zu 20 Mitarbeiter',
      'Lager bis 20.000 Teile',
      'Alle Starter-Funktionen',
      'Routen-KI & GPS-Tracking',
      'Lager-Prognose & Reservierung',
    ],
    hervorgehoben: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    preis: '749 €',
    zielgruppe: 'Für große Betriebe – alles ohne Limits.',
    features: [
      'Alle Rollen & Zugänge unbegrenzt',
      'Mitarbeiter unbegrenzt',
      'Lager unbegrenzt',
      'Alle Priority-Funktionen',
      'Punktwolken-Großscans bis 500 MB',
      'Persönlicher Ansprechpartner',
    ],
    hervorgehoben: false,
  },
];

// Vorauszahlung: 36 Monate auf einmal → 5 % Erlass (Abwicklung per Rechnung/Überweisung)
const VORAUSZAHLUNG = [
  { name: 'Starter', monat: 249, gesamt: '8.964 €', rabatt: '8.515,80 €', ersparnis: '448,20 €' },
  { name: 'Priority', monat: 495, gesamt: '17.820 €', rabatt: '16.929 €', ersparnis: '891 €' },
  { name: 'Enterprise', monat: 749, gesamt: '26.964 €', rabatt: '25.615,80 €', ersparnis: '1.348,20 €' },
];

const FAQ = [
  {
    frage: 'Was ist SCAFFOLD OS?',
    antwort:
      'SCAFFOLD OS ist eine Software speziell für Gerüstbau-Betriebe. Sie bildet den kompletten Arbeitsablauf in einem System ab: Aufmaß auf der Baustelle, Angebotserstellung mit KI, Disposition der Monteure, Lagerverwaltung, Tourenplanung mit GPS, Zeiterfassung per Handy und GoBD-konforme Rechnungsstellung. Ohne Installation – die App läuft im Browser auf Handy, Tablet und PC.',
  },
  {
    frage: 'Wie funktioniert das Aufmaß mit SCAFFOLD OS?',
    antwort:
      'Der Bauleiter erfasst die Baustelle in 6 geführten Schritten direkt am Handy: Fotos oder Drohnenaufnahmen hochladen, GPS-Position automatisch erfassen, Maße eingeben, Gerüsttyp und Hersteller-System wählen (z. B. Layher, MJ, Plettac – mit echten Systemmaßen), Sicherheitsanforderungen und Extras festlegen. Die KI berechnet daraus Materialliste und Kalkulation und erstellt ein fertiges Angebots-PDF mit DIN-12811-Check, QR-Code und digitaler Unterschrift.',
  },
  {
    frage: 'Was kostet SCAFFOLD OS?',
    antwort:
      'Es gibt drei Pakete: Starter für 249 €/Monat (1 Admin, 2 Dispo, bis zu 5 Mitarbeiter, Lager bis 10.000 Teile), Priority für 495 €/Monat (alle Rollen, bis zu 20 Mitarbeiter, Lager bis 20.000 Teile) und Enterprise für 749 €/Monat (alles unbegrenzt). Alle Pakete starten mit 3 kostenlosen Testtagen.',
  },
  {
    frage: 'Kann ich SCAFFOLD OS kostenlos testen?',
    antwort:
      'Ja. Jedes Paket beginnt mit einer 3-tägigen Testphase. Du legst Firma, Name und E-Mail fest, hinterlegst eine Zahlungsart (SEPA-Lastschrift oder Kreditkarte über Stripe) und bekommst sofort dein eigenes System unter einer eigenen Adresse (firma.scaffoldos.de). Die erste Abbuchung erfolgt erst nach den 3 Testtagen.',
  },
  {
    frage: 'Wie viel Zeit spare ich mit SCAFFOLD OS?',
    antwort:
      'Mindestens 2 Stunden pro Tag. Ein Aufmaß mit Angebot dauert statt 2–3 Stunden nur noch etwa 15 Minuten, weil KI Materialliste, Kalkulation und PDF automatisch erstellen. Hinzu kommen eingesparte Zeiten bei Zettelwirtschaft, Telefonaten zur Tourenabstimmung und handschriftlicher Zeiterfassung.',
  },
  {
    frage: 'Brauche ich IT-Kenntnisse oder eine Installation?',
    antwort:
      'Nein. SCAFFOLD OS läuft komplett im Browser – auf dem Handy des Monteurs genauso wie am PC im Büro. Es gibt nichts zu installieren und nichts zu warten. Wer ein Foto per WhatsApp verschicken kann, kann SCAFFOLD OS bedienen. Ein Onboarding-Assistent führt dich in 3 Schritten durch die Einrichtung.',
  },
  {
    frage: 'Wo werden meine Daten gespeichert?',
    antwort:
      'Jeder Betrieb bekommt eine eigene, komplett getrennte Datenbank in einem Rechenzentrum in Frankfurt am Main. Das System ist DSGVO- und EU-AI-Act-konform. Deine Daten gehören dir und werden nicht mit anderen Betrieben gemischt.',
  },
  {
    frage: 'Wie kann ich kündigen?',
    antwort:
      'Die Mindestvertragslaufzeit beträgt 24 Monate, danach ist das Abo monatlich kündbar. Bei einer Kündigung wird deine Instanz pausiert – deine Daten bleiben erhalten und gehen nicht verloren.',
  },
];

const JSONLD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'SCAFFOLD OS',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web (Browser, Handy, Tablet, PC)',
      url: 'https://scaffoldos.de',
      description:
        'Komplette Software für Gerüstbau-Betriebe: KI-Aufmaß, Angebot, Disposition, Lager, Touren, Zeiterfassung und Rechnung in einem System.',
      inLanguage: 'de',
      offers: [
        { '@type': 'Offer', name: 'Starter', price: '249', priceCurrency: 'EUR' },
        { '@type': 'Offer', name: 'Priority', price: '495', priceCurrency: 'EUR' },
        { '@type': 'Offer', name: 'Enterprise', price: '749', priceCurrency: 'EUR' },
      ],
      provider: {
        '@type': 'Organization',
        name: 'AI Integration',
        url: 'https://scaffoldos.de',
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({
        '@type': 'Question',
        name: f.frage,
        acceptedAnswer: { '@type': 'Answer', text: f.antwort },
      })),
    },
  ],
};

// ─── Ein Blick ins System: echte Screenshots aus dem laufenden Betrieb ───
// Bilder liegen in public/screenshots/ (WebP). Persönliche Daten sind unkenntlich gemacht.
const BLICKE = [
  {
    titel: 'Der Betrieb auf einen Blick',
    text: 'Das Dashboard zeigt jeden Morgen, was zählt – ohne dass Sie erst Berichte bauen müssen.',
    punkte: [
      'Finanzen: aktive Projekte, offene Posten, Gesamtumsatz',
      'Betrieb heute: Touren, unterwegs, geplante Einsätze',
      'Team & Lager: aktive Mitarbeiter, Lagerwert in Echtzeit',
      'Handlungsbedarf sofort sichtbar – z. B. offene Urlaubsanträge',
    ],
    bilder: [
      { src: '/screenshots/dashboard.webp', alt: 'SCAFFOLD OS Dashboard mit Finanzen, Betrieb heute und Team & Lager' },
    ],
  },
  {
    titel: 'Aufmaß am Handy – in 6 geführten Schritten',
    text: 'Vom Kunden bis zum Termin: Das Aufmaß führt Schritt für Schritt durch die Baustellenerfassung – direkt vor Ort, ohne Zettel.',
    punkte: [
      'Projekt, Maße und Gerüsttyp strukturiert erfassen',
      'Fotos, LiDAR-/3D-Scan und GPS-Position direkt verknüpft',
      'Automatische Vorschläge statt leerer Formulare',
    ],
    bilder: [
      { src: '/screenshots/aufmass-projekt.webp', alt: 'Aufmaß Schritt 1: Projekt anlegen mit Kunde, Adresse und Terminen' },
      { src: '/screenshots/aufmass-erfassung.webp', alt: 'Aufmaß Schritt 2: digitale Maßerfassung mit Foto und 3D-Scan' },
    ],
  },
  {
    titel: 'KI-Planung rechnet Material & Kalkulation',
    text: 'Aus den Maßen wird automatisch eine Materialliste mit Gewicht, Stunden und Preis – inklusive Prüfhinweisen.',
    punkte: [
      'Materialberechnung mit Gerüstklasse, Gewicht und Stundensatz',
      'DIN-12811-Hinweise und Sicherheitschecks integriert',
      'Alle Vorschläge prüfbar und jederzeit anpassbar',
    ],
    bilder: [
      { src: '/screenshots/ki-planung.webp', alt: 'Zusammenfassung und KI-Planung mit Materialberechnung' },
    ],
  },
  {
    titel: 'Angebot in Minuten statt Stunden',
    text: 'Rabatt, Nachtrag oder längere Miete? Alles per Schalter – der Endpreis aktualisiert sich sofort.',
    punkte: [
      'Anpassungen ohne Taschenrechner: Optionen einfach aktivieren',
      'Basispreis und Endpreis transparent nachvollziehbar',
      'KI-Disposition und digitaler Zwilling direkt im Angebot',
    ],
    bilder: [
      { src: '/screenshots/angebot.webp', alt: 'Angebot anpassen mit Optionen, Endpreis und KI-Disposition' },
    ],
  },
  {
    titel: 'Lager mit KI-Prognose',
    text: 'Das Lager warnt, bevor Material fehlt – und sagt, was sich nicht lohnt nachzukaufen.',
    punkte: [
      'Bestände mit Reservierungen und Verfügbarkeit in Echtzeit',
      'KI-Analyse: Gesamtlage, dringendste Maßnahmen, Kapitalbindung',
      'Prognose auf Basis der aktuellen Disposition',
    ],
    bilder: [
      { src: '/screenshots/lager-prognose.webp', alt: 'Lager-Prognose mit KI-Analyse und Materialliste' },
    ],
  },
  {
    titel: 'Die Mitarbeiter-App für die Baustelle',
    text: 'Monteure sehen ihre Touren, stempeln die Zeit und melden sich krank – alles am Handy.',
    punkte: [
      'Meine Touren mit Baustellen-Infos und Anfahrt',
      'Zeiterfassung per Knopfdruck – ohne Stundenzettel',
      'Krank- und Urlaubsmeldung direkt an die Disposition',
    ],
    bilder: [
      { src: '/screenshots/mitarbeiter-app.webp', alt: 'Mitarbeiter-App mit Touren, Zeiterfassung und Krankmeldung' },
    ],
  },
];

function ScreenshotRahmen({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white shadow-xl shadow-black/5 overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-black/5 bg-[#f5f5f7]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" className="w-full h-auto block" />
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] flex flex-col">

      {/* Strukturierte Daten für Google & KI-Suchmaschinen (SEO/GEO) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }}
      />

      {/* ─── Navigation (ausgeblendet, sobald eingeloggt – Sidebar hat das Logo) ─── */}
      <LandingHeader />

      {/* ─── Hero ─── */}
      <section className="px-6 pt-20 pb-16 md:pt-28 md:pb-24 text-center">
        <p className="text-sm font-semibold tracking-widest text-[#e8590c] uppercase mb-4">
          Software für Gerüstbau-Betriebe
        </p>
        <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.08] max-w-3xl mx-auto">
          Vom Kundenanruf bis zur Rechnung.
          <span className="text-[#86868b]"> Ein System.</span>
        </h1>
        <p className="mt-6 text-lg md:text-xl text-[#6e6e73] max-w-2xl mx-auto leading-relaxed">
          SCAFFOLD OS ersetzt Zettel, Excel und Telefonkette durch einen durchgehenden
          digitalen Prozess: Aufmaß mit KI, Angebot in Minuten, Disposition, Lager,
          Touren mit GPS, Zeiterfassung am Handy und GoBD-konforme Rechnung.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/kaufen"
            className="inline-flex items-center gap-2 bg-[#e8590c] hover:bg-[#d9480f] text-white font-medium text-lg px-8 py-3.5 rounded-full transition-all hover:scale-[1.02] shadow-lg shadow-orange-600/20"
          >
            3 Tage kostenlos testen
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-[#1d1d1f] font-medium text-lg px-8 py-3.5 rounded-full border border-black/10 hover:bg-black/5 transition-colors"
          >
            Zum Login
          </Link>
        </div>
        <p className="mt-6 text-sm text-[#86868b]">
          Keine Installation · Läuft auf Handy, Tablet & PC · Daten in Frankfurt am Main
        </p>
      </section>

      {/* ─── Aufmaß-Demo zum Durchklicken ─── */}
      <section className="px-6 pb-24">
        <div className="max-w-4xl mx-auto text-center mb-10">
          <p className="text-sm font-semibold tracking-widest text-[#e8590c] uppercase mb-3">
            Ausprobieren ohne Login
          </p>
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight">
            Das Aufmaß zum Durchklicken
          </h2>
          <p className="mt-4 text-lg text-[#6e6e73] leading-relaxed max-w-2xl mx-auto">
            So fühlt sich SCAFFOLD OS an: Klicken Sie sich durch ein echtes
            Beispiel-Aufmaß – vom Projekt bis zum fertigen Angebot.
          </p>
        </div>
        <AufmassDemo />
      </section>

      {/* ─── Ein Blick ins System (echte Screenshots) ─── */}
      <section className="px-6 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mx-auto text-center mb-14">
            <p className="text-sm font-semibold tracking-widest text-[#e8590c] uppercase mb-3">
              Ein Blick ins System
            </p>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight">
              Echt statt Hochglanz.{' '}
              <span className="text-[#86868b]">So sieht SCAFFOLD OS im Alltag aus.</span>
            </h2>
            <p className="mt-4 text-lg text-[#6e6e73] leading-relaxed">
              Keine Mock-ups, keine leeren Versprechen – echte Bildschirme aus dem
              laufenden Betrieb, Feature für Feature.
            </p>
          </div>

          <div className="space-y-16 md:space-y-24">
            {BLICKE.map((blick, i) => (
              <div key={blick.titel} className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
                <div className={i % 2 === 1 ? 'md:order-2' : ''}>
                  <h3 className="text-xl md:text-2xl font-semibold tracking-tight">
                    {blick.titel}
                  </h3>
                  <p className="mt-3 text-[#6e6e73] leading-relaxed">{blick.text}</p>
                  <ul className="mt-5 space-y-2.5">
                    {blick.punkte.map((punkt) => (
                      <li key={punkt} className="flex items-start gap-2.5 text-[15px] leading-relaxed">
                        <Check className="w-4 h-4 mt-1 text-[#e8590c] shrink-0" />
                        <span>{punkt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={i % 2 === 1 ? 'md:order-1' : ''}>
                  {blick.bilder.length === 1 ? (
                    <ScreenshotRahmen src={blick.bilder[0].src} alt={blick.bilder[0].alt} />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {blick.bilder.map((bild) => (
                        <ScreenshotRahmen key={bild.src} src={bild.src} alt={bild.alt} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Was ist SCAFFOLD OS? (Aufklärung) ─── */}
      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-center">
            Was ist SCAFFOLD OS?
          </h2>
          <p className="mt-6 text-lg text-[#6e6e73] leading-relaxed text-center max-w-3xl mx-auto">
            In den meisten Gerüstbau-Betrieben kostet jede Baustelle Stunden an Büroarbeit:
            Aufmaß per Hand, Angebot in Word, Materialplanung im Kopf, Stundenzettel auf Papier.
            SCAFFOLD OS verbindet alle Schritte zu einem durchgehenden Prozess –
            jede Information wird einmal erfasst und steht überall zur Verfügung:
          </p>

          {/* Prozesskette */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {PROZESS.map((schritt, i) => (
              <span key={schritt} className="flex items-center gap-2">
                <span className="bg-white border border-black/10 rounded-full px-4 py-2 text-sm font-medium shadow-sm">
                  {schritt}
                </span>
                {i < PROZESS.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-[#e8590c]" />
                )}
              </span>
            ))}
          </div>

          {/* Zeitersparnis */}
          <div className="mt-12 rounded-3xl bg-[#1d1d1f] text-white px-8 py-10 md:px-14 text-center shadow-2xl shadow-black/10">
            <Clock className="w-8 h-8 text-[#ff922b] mx-auto" strokeWidth={1.5} />
            <h3 className="mt-4 text-2xl md:text-3xl font-semibold tracking-tight">
              Mindestens 2 Stunden gespart. Jeden Tag.
            </h3>
            <p className="mt-4 text-white/70 leading-relaxed max-w-2xl mx-auto">
              Ein Aufmaß mit fertigem Angebot dauert statt 2–3 Stunden nur noch etwa
              15 Minuten. Dazu entfallen Zettelwirtschaft, Abstimmungs-Telefonate und
              doppelte Dateneingabe. Bei 20 Arbeitstagen im Monat sind das über
              40 Stunden – eine halbe Arbeitswoche, die dein Team auf der Baustelle
              statt im Büro verbringt.
            </p>
          </div>
        </div>
      </section>

      {/* ─── 3 Kernbereiche im Detail ─── */}
      <section className="px-6 pb-24">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-center">
            Die drei Säulen.{' '}
            <span className="text-[#86868b]">Aufmaß, Mitarbeiter, Lager.</span>
          </h2>
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {KERNBEREICHE.map((bereich) => (
              <div
                key={bereich.titel}
                className="bg-white rounded-3xl border border-black/5 p-8 shadow-sm"
              >
                <bereich.icon className="w-8 h-8 text-[#e8590c]" strokeWidth={1.5} />
                <h3 className="mt-4 text-xl font-semibold tracking-tight">{bereich.titel}</h3>
                <p className="mt-2 text-[#6e6e73] text-[15px] leading-relaxed">{bereich.claim}</p>
                <ul className="mt-5 space-y-2.5">
                  {bereich.punkte.map((punkt) => (
                    <li key={punkt} className="flex gap-2.5 text-sm text-[#424245] leading-relaxed">
                      <Check className="w-4 h-4 text-[#e8590c] shrink-0 mt-0.5" />
                      {punkt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pakete ─── */}
      <section className="px-6 pb-24" id="pakete">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-center">
            Drei Pakete. <span className="text-[#86868b]">Ein klarer Preis pro Monat.</span>
          </h2>
          <p className="mt-4 text-center text-[#6e6e73] max-w-2xl mx-auto">
            Jedes Paket startet mit 3 kostenlosen Testtagen. Zahlung per SEPA-Lastschrift
            oder Kreditkarte. Mindestvertragslaufzeit 24 Monate, danach monatlich kündbar.
          </p>
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {PAKETE.map((paket) => (
              <div
                key={paket.id}
                className={`rounded-3xl p-8 flex flex-col ${
                  paket.hervorgehoben
                    ? 'bg-[#1d1d1f] text-white shadow-2xl shadow-black/15 md:-translate-y-2'
                    : 'bg-white border border-black/5 shadow-sm'
                }`}
              >
                {paket.hervorgehoben && (
                  <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#ff922b] mb-3">
                    Meistgewählt
                  </p>
                )}
                <h3 className="text-xl font-semibold tracking-tight">{paket.name}</h3>
                <p className="mt-4 text-4xl font-semibold tracking-tight">
                  {paket.preis}
                  <span className={`text-base font-normal ${paket.hervorgehoben ? 'text-white/60' : 'text-[#86868b]'}`}>
                    /Monat
                  </span>
                </p>
                <p className={`mt-2 text-sm ${paket.hervorgehoben ? 'text-white/60' : 'text-[#86868b]'}`}>
                  {paket.zielgruppe}
                </p>
                <ul className="mt-6 space-y-2.5 flex-1">
                  {paket.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5 text-sm leading-relaxed">
                      <Check className={`w-4 h-4 shrink-0 mt-0.5 ${paket.hervorgehoben ? 'text-[#ff922b]' : 'text-[#e8590c]'}`} />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/kaufen?plan=${paket.id}`}
                  className={`mt-8 inline-flex items-center justify-center gap-2 font-semibold px-6 py-3 rounded-full transition-all hover:scale-[1.02] ${
                    paket.hervorgehoben
                      ? 'bg-[#e8590c] hover:bg-[#d9480f] text-white'
                      : 'bg-black/5 hover:bg-black/10 text-[#1d1d1f]'
                  }`}
                >
                  3 Tage kostenlos testen
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>

          {/* Vorauszahlungs-Angebot: 36 Monate auf einmal → 5 % Erlass */}
          <div className="mt-12 rounded-3xl border border-[#e8590c]/30 bg-[#fff4ec] p-8">
            <p className="text-center text-xs font-bold tracking-[0.2em] uppercase text-[#e8590c]">
              Spar-Tipp für Entscheider
            </p>
            <h3 className="mt-2 text-center text-xl md:text-2xl font-semibold tracking-tight text-[#1d1d1f]">
              36 Monate im Voraus zahlen – <span className="text-[#e8590c]">5 % sparen</span>
            </h3>
            <p className="mt-2 text-center text-sm text-[#6e6e73] max-w-2xl mx-auto">
              Wer den Vertrag für 36 Monate abschließt und den Gesamtbetrag auf einmal per Rechnung
              zahlt, erhält 5 % Erlass auf die gesamte Laufzeit.
            </p>
            <div className="mt-8 grid md:grid-cols-3 gap-4">
              {VORAUSZAHLUNG.map((v) => (
                <div key={v.name} className="rounded-2xl bg-white border border-black/5 p-6 text-center shadow-sm">
                  <p className="font-semibold text-[#1d1d1f]">{v.name}</p>
                  <p className="mt-2 text-sm text-[#86868b] line-through">{v.gesamt}</p>
                  <p className="text-2xl font-semibold tracking-tight text-[#1d1d1f]">{v.rabatt}</p>
                  <p className="mt-1 text-xs font-semibold text-[#e8590c]">Du sparst {v.ersparnis}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-sm text-[#6e6e73]">
              Abwicklung bequem per Rechnung und Überweisung –{' '}
              <Link href="/anfrage" className="text-[#e8590c] hover:underline font-semibold">
                jetzt Angebot anfordern
              </Link>
            </p>
          </div>

          <p className="mt-8 text-center text-sm text-[#86868b]">
            Alle Preise zzgl. MwSt. · Fragen zu den Paketen?{' '}
            <Link href="/anfrage" className="text-[#e8590c] hover:underline">Kontakt aufnehmen</Link>
          </p>
        </div>
      </section>

      {/* ─── Terminbuchung über Microsoft Bookings (nur Master, per NEXT_PUBLIC_TERMIN_BUCHUNG=1) ─── */}
      {process.env.NEXT_PUBLIC_TERMIN_BUCHUNG === '1' && (
        <section className="px-6 pb-24" id="termin">
          <div className="max-w-4xl mx-auto text-center mb-10">
            <p className="text-sm font-semibold tracking-widest text-[#e8590c] uppercase mb-3">
              Persönliche Beratung
            </p>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight">
              Fragen? Termin machen.{' '}
              <span className="text-[#86868b]">Direkt im Kalender.</span>
            </h2>
            <p className="mt-4 text-lg text-[#6e6e73] leading-relaxed max-w-2xl mx-auto">
              Wählen Sie Datum und Uhrzeit – wir zeigen Ihnen SCAFFOLD OS live,
              beantworten Ihre Fragen und rechnen gemeinsam Ihren Fall durch.
            </p>
          </div>
          <div className="max-w-2xl mx-auto text-center bg-[#f5f5f7] rounded-3xl border border-black/5 px-8 py-12">
            <CalendarCheck className="h-12 w-12 text-[#e8590c] mx-auto mb-5" />
            <p className="text-lg font-semibold text-[#1d1d1f] mb-1">Kostenlose Erstberatung</p>
            <p className="text-sm text-[#86868b] mb-8">30 Minuten · Telefon oder Videocall · unverbindlich</p>
            <a
              href="https://bookings.cloud.microsoft/book/G6a479b91191146b89ae2cc4218c926ab@scaffoldos.de/?ismsaljsauthenabled=true"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#e8590c] hover:bg-[#d9480f] px-8 py-4 text-lg font-bold text-white transition-colors"
            >
              Kostenlosen Termin buchen <ArrowRight className="h-5 w-5" />
            </a>
            <p className="mt-6 text-xs text-[#86868b]">
              Die Buchung läuft über Microsoft Bookings – Sie bekommen sofort eine Bestätigung per E-Mail.
            </p>
          </div>
        </section>
      )}

      {/* ─── Alle Funktionen im Überblick ─── */}
      <section className="px-6 pb-24">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-center">
            Alles drin. <span className="text-[#86868b]">Nichts doppelt.</span>
          </h2>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12">
            {ALLE_FUNKTIONEN.map((f) => (
              <div key={f.titel}>
                <f.icon className="w-7 h-7 text-[#e8590c] mb-4" strokeWidth={1.5} />
                <h3 className="font-semibold text-lg tracking-tight">{f.titel}</h3>
                <p className="mt-2 text-[#6e6e73] leading-relaxed text-[15px]">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ (SEO/GEO) ─── */}
      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-center">
            Häufige Fragen
          </h2>
          <div className="mt-10 space-y-4">
            {FAQ.map((eintrag) => (
              <details
                key={eintrag.frage}
                className="bg-white rounded-2xl border border-black/5 px-6 py-5 shadow-sm group"
              >
                <summary className="font-semibold tracking-tight cursor-pointer list-none flex items-center justify-between gap-4">
                  {eintrag.frage}
                  <span className="text-[#e8590c] text-xl leading-none transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-[#6e6e73] leading-relaxed text-[15px]">{eintrag.antwort}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Abschluss-CTA ─── */}
      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto text-center">
          <HardHat className="w-8 h-8 text-[#e8590c] mx-auto" strokeWidth={1.5} />
          <h2 className="mt-4 text-2xl md:text-4xl font-semibold tracking-tight">
            In 3 Minuten startklar.
          </h2>
          <p className="mt-4 text-lg text-[#6e6e73] leading-relaxed">
            Paket wählen, Firma eintragen, loslegen. Dein eigenes System unter
            firma.scaffoldos.de – 3 Tage kostenlos, erste Abbuchung erst nach der Testphase.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/kaufen"
              className="inline-flex items-center gap-2 bg-[#e8590c] hover:bg-[#d9480f] text-white font-medium text-lg px-8 py-3.5 rounded-full transition-all hover:scale-[1.02] shadow-lg shadow-orange-600/20"
            >
              Jetzt 3 Tage kostenlos testen
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-[#6e6e73] hover:text-[#1d1d1f] font-medium transition-colors"
            >
              <Globe className="w-4 h-4" />
              Bereits Kunde? Zum Login
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="mt-auto border-t border-black/5 pt-10 pb-16 text-center text-sm text-[#86868b]">
        <div className="flex items-center justify-center gap-3 mb-4 text-[13px]">
          <Link href="/wechseln" className="hover:text-[#1d1d1f] transition-colors">Softwarewechsel</Link>
          <span className="text-black/10">·</span>
          <Link href="/impressum" className="hover:text-[#1d1d1f] transition-colors">Impressum</Link>
          <span className="text-black/10">·</span>
          <Link href="/datenschutz" className="hover:text-[#1d1d1f] transition-colors">Datenschutz</Link>
          <span className="text-black/10">·</span>
          <Link href="/agb" className="hover:text-[#1d1d1f] transition-colors">AGB</Link>
        </div>
        powered by <span className="font-semibold text-[#6e6e73]">AI Integration</span>
      </footer>
    </div>
  );
}
