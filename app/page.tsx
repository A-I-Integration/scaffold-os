import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight, Ruler, FileText, Route, Timer, Warehouse, ShieldCheck, Check,
  Users, Package, Clock, Camera, QrCode, PenLine, MapPin, CalendarCheck,
  Sparkles, Globe, HardHat,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import LandingHeader from '@/components/LandingHeader';

// Aufmaß-Demo wird als eigener JS-Chunk nachgeladen (Code-Splitting) –
// entlastet die mobile Startladephase, HTML bleibt server-seitig gerendert.
const AufmassDemo = dynamic(() => import('@/components/AufmassDemo'));

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
  metadataBase: new URL('https://scaffoldos.de'),
  title: 'Gerüstbau Software: KI-Aufmaß, Lager & Angebote | SCAFFOLD OS',
  description:
    'Die All-in-One Software für Gerüstbauer. KI-Aufmaß, Angebote in Minuten, Touren-GPS & GoBD-Rechnung. Jetzt 3 Tage kostenlos auf Handy & PC testen!',
  keywords: [
    'Gerüstbau Software', 'Gerüstbau Aufmaß', 'Aufmaß Software Gerüstbau',
    'Gerüst Kalkulation', 'Gerüstbau Disposition', 'Lagerverwaltung Gerüstbau',
    'Zeiterfassung Gerüstbau', 'Gerüstbau App', 'DIN 12811', 'Gerüst Angebot erstellen',
  ],
  alternates: { canonical: 'https://scaffoldos.de' },
  openGraph: {
    title: 'Gerüstbau Software: KI-Aufmaß, Lager & Angebote | SCAFFOLD OS',
    description:
      'Die All-in-One Software für Gerüstbauer. KI-Aufmaß, Angebote in Minuten, Touren-GPS & GoBD-Rechnung. Jetzt 3 Tage kostenlos auf Handy & PC testen!',
    url: 'https://scaffoldos.de',
    siteName: 'SCAFFOLD OS',
    locale: 'de_DE',
    type: 'website',
    images: [
      {
        url: '/og-share.png',
        width: 1200,
        height: 630,
        alt: 'SCAFFOLD OS – Die Software für Gerüstbau-Betriebe',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gerüstbau Software: KI-Aufmaß, Lager & Angebote | SCAFFOLD OS',
    description:
      'Die All-in-One Software für Gerüstbauer. KI-Aufmaß, Angebote in Minuten, Touren-GPS & GoBD-Rechnung. Jetzt 3 Tage kostenlos testen!',
    images: ['/og-share.png'],
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
      'Hersteller-Systeme mit echten Maßen: Layher, MJ, Plettac, Alfix u. a.',
      'KI rechnet Materialliste und Kalkulation, DIN-12811-Check inklusive',
      'Angebots-PDF mit QR-Code und Unterschrift – direkt per Mail an den Kunden',
    ],
  },
  {
    icon: Users,
    titel: 'Mitarbeiter',
    claim: 'Jeder Kollege hat seinen Zugang – und du hast den Überblick.',
    punkte: [
      'Zugänge mit Rollen: Admin, Disponent, Bauleiter, Mitarbeiter, Lager',
      'Zeiterfassung per Handy: stempeln, Pausen laufen automatisch',
      'Krank und Urlaub landen direkt in der Tagesplanung',
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
      'Baustellenbestand im Blick: Was ist verbaut, was kommt zurück?',
      'Platz für 10.000, 20.000 oder unbegrenzt viele Teile – je nach Paket',
    ],
  },
];

const ALLE_FUNKTIONEN = [
  { icon: Ruler, titel: 'Aufmaß & KI-Angebot', text: (<>Baustelle in 6 Schritten erfassen – die <strong>KI</strong> liefert Materialliste, Kalkulation und Angebots-PDF.</>) },
  { icon: Camera, titel: 'Foto, Drohne & 3D-Scan', text: 'Fotos am Handy, Drohnen-Upload bis 20 MB, Punktwolken-Auswertung für Großscans.' },
  { icon: QrCode, titel: 'QR & Unterschrift', text: 'Angebot mit QR-Code und digitaler Unterschrift – der Kunde unterschreibt auf dem Handy.' },
  { icon: Route, titel: 'Touren & Disposition', text: 'Routen-KI plant den Tag, GPS zeigt die Fahrzeuge, Umdisposition bei Krankheit oder Wetter.' },
  { icon: MapPin, titel: 'Fahrer-Navigation & GPS', text: 'Fahrer navigieren direkt aus der App, die Zentrale sieht jede Position live.' },
  { icon: Timer, titel: 'Zeiterfassung', text: 'Stempeln am Handy, Pausen-Automatik, Soll-Ist-Vergleich, Überstunden – ohne Zettelwirtschaft.' },
  { icon: CalendarCheck, titel: 'Planung & Abwesenheiten', text: 'Krank und Urlaub direkt im Plan – Konflikte werden sofort sichtbar.' },
  { icon: Warehouse, titel: 'Lager & Prognose', text: 'Bestände im Blick, automatische Stückliste, KI warnt, bevor Material knapp wird.' },
  { icon: FileText, titel: 'Rechnungen & DATEV', text: (<><strong>GoBD-konforme Rechnungen</strong> mit Mahnwesen – Buchungsstapel und Lohndaten direkt für den Steuerberater.</>) },
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

const FAQ = [
  {
    frage: 'Was ist SCAFFOLD OS?',
    antwort:
      'SCAFFOLD OS ist die Software für Gerüstbau-Betriebe. Sie bildet den kompletten Ablauf ab: Aufmaß, Angebot, Disposition, Lager, Touren, Zeiterfassung und Rechnung. Ohne Installation. Die App läuft im Browser – auf Handy, Tablet und PC.',
  },
  {
    frage: 'Wie funktioniert das Aufmaß mit SCAFFOLD OS?',
    antwort:
      'Der Bauleiter erfasst die Baustelle direkt am Handy. Sechs geführte Schritte: Fotos hochladen, Maße eingeben, Gerüsttyp wählen. Fertig. Die KI rechnet daraus Material und Preis. Am Ende steht ein fertiges Angebots-PDF – mit QR-Code und Unterschrift auf dem Handy.',
  },
  {
    frage: 'Was kostet SCAFFOLD OS?',
    antwort:
      'Drei Pakete: Starter für 249 € im Monat, Priority für 495 €, Enterprise für 749 €. Starter reicht für bis zu 5 Mitarbeiter, Priority für 20. Enterprise hebt alle Limits auf. Jedes Paket startet mit 3 kostenlosen Testtagen.',
  },
  {
    frage: 'Kann ich SCAFFOLD OS kostenlos testen?',
    antwort:
      'Ja. Jedes Paket startet mit 3 Testtagen. Du gibst Firma, Name und E-Mail an. Dann hinterlegst du eine Zahlungsart und bekommst sofort dein eigenes System: firma.scaffoldos.de. Die erste Abbuchung kommt erst nach den 3 Tagen.',
  },
  {
    frage: 'Wie viel Zeit spare ich mit SCAFFOLD OS?',
    antwort:
      'Mindestens 2 Stunden pro Tag. Ein Aufmaß mit Angebot dauert etwa 15 Minuten statt 2 bis 3 Stunden. Auch Zettel, Abstimmungs-Anrufe und handschriftliche Zeiterfassung fallen weg.',
  },
  {
    frage: 'Brauche ich IT-Kenntnisse oder eine Installation?',
    antwort:
      'Nein. SCAFFOLD OS läuft komplett im Browser – auf dem Handy des Monteurs genauso wie am PC im Büro. Es gibt nichts zu installieren und nichts zu warten. Wer ein Foto per WhatsApp verschicken kann, kann SCAFFOLD OS bedienen. Ein Onboarding-Assistent führt dich in 3 Schritten durch die Einrichtung.',
  },
  {
    frage: 'Wo werden meine Daten gespeichert?',
    antwort:
      'Jeder Betrieb bekommt eine eigene Datenbank in Frankfurt am Main. Komplett getrennt von anderen. DSGVO-konform, EU-AI-Act-konform. Deine Daten gehören dir.',
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
      '@type': 'Organization',
      '@id': 'https://scaffoldos.de/#organization',
      name: 'AI Integration',
      url: 'https://scaffoldos.de',
      logo: 'https://scaffoldos.de/icon-512.png',
      email: 'info@scaffoldos.de',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Ölbachstr. 48',
        postalCode: '48691',
        addressLocality: 'Vreden',
        addressCountry: 'DE',
      },
    },
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
      provider: { '@id': 'https://scaffoldos.de/#organization' },
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
    text: 'Das Dashboard zeigt dir jeden Morgen, was zählt. Ganz ohne Berichte.',
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
    text: 'Das Aufmaß führt dich Schritt für Schritt durch die Baustelle. Direkt vor Ort, ohne Zettel.',
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
    text: 'Aus deinen Maßen wird eine Materialliste. Mit Gewicht, Stunden und Preis. Prüfhinweise inklusive.',
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
    text: 'Rabatt, Nachtrag oder längere Miete? Ein Klick genügt. Der Endpreis aktualisiert sich sofort.',
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
    text: 'Das Lager warnt, bevor Material fehlt. Und sagt dir, welcher Nachkauf sich lohnt.',
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
    text: 'Monteure sehen ihre Touren, stempeln die Zeit, melden sich krank. Alles am Handy.',
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
      <img src={src} alt={alt} width={1440} height={819} loading="lazy" className="w-full h-auto block" />
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
          Die Gerüstbau-Software
          <span className="text-[#86868b]"> vom Aufmaß bis zur Rechnung.</span>
        </h1>
        <p className="mt-5 text-xl md:text-2xl font-medium text-[#424245] tracking-tight">
          Vom Kundenanruf bis zur Rechnung. Ein System.
        </p>
        <p className="mt-6 text-lg md:text-xl text-[#6e6e73] max-w-2xl mx-auto leading-relaxed">
          SCAFFOLD OS ersetzt Zettel, Excel und Telefonkette. Ein System für alles:
          <strong> Aufmaß mit KI</strong>, Angebot in Minuten, Touren mit GPS,
          Zeiterfassung und <strong>GoBD-Rechnung</strong>. Alles läuft im Browser –
          auf Handy, Tablet und PC.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/anfrage"
            className="inline-flex items-center gap-2 bg-[#e8590c] hover:bg-[#d9480f] text-white font-medium text-lg px-8 py-3.5 rounded-full transition-all hover:scale-[1.02] shadow-lg shadow-orange-600/20"
          >
            Angebot anfragen
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
            So fühlt sich SCAFFOLD OS an: Klick dich durch ein echtes
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
            <strong>Gerüstbau</strong> bedeutet Büroarbeit. Aufmaß per Hand. Angebot in Word.
            Stundenzettel auf Papier. SCAFFOLD OS macht Schluss damit. Du erfasst
            jede Info <strong>nur einmal</strong> – und hast sie überall: auf der Baustelle,
            im Büro, unterwegs.
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
            <p className="mt-4 text-2xl md:text-3xl font-semibold tracking-tight">
              Mindestens 2 Stunden gespart. Jeden Tag.
            </p>
            <p className="mt-4 text-white/70 leading-relaxed max-w-2xl mx-auto">
              Ein Aufmaß mit fertigem Angebot dauert bei uns etwa <strong>15 Minuten</strong>.
              Früher waren es 2 bis 3 Stunden. Zettel, Telefonate und doppelte
              Eingaben fallen weg. Das spart über <strong>40 Stunden im Monat</strong>.
              Dein Team arbeitet auf der Baustelle – nicht im Büro.
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
                <p className="mt-4 text-xl font-semibold tracking-tight">{bereich.titel}</p>
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
            Jedes Paket startet mit 3 kostenlosen Testtagen. Du zahlst per
            SEPA-Lastschrift oder Kreditkarte. Nach 24 Monaten kannst du monatlich kündigen.
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
                <p className="text-xl font-semibold tracking-tight">{paket.name}</p>
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
              Wähl Datum und Uhrzeit. Wir zeigen dir SCAFFOLD OS live, beantworten
              deine Fragen und rechnen gemeinsam deinen Fall durch.
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
              Die Buchung läuft über Microsoft Bookings – du bekommst sofort eine Bestätigung per E-Mail.
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
                <p className="font-semibold text-lg tracking-tight">{f.titel}</p>
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
            firma.scaffoldos.de. 3 Tage kostenlos. Die erste Abbuchung kommt erst
            nach der Testphase.
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
