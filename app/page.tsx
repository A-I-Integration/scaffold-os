import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Check, CalendarCheck, Globe, HardHat } from 'lucide-react';
import dynamic from 'next/dynamic';
import LandingHeader from '@/components/LandingHeader';
import StartFilm from '@/components/landing/StartFilm';

// Aufmaß-Demo wird als eigener JS-Chunk nachgeladen (Code-Splitting) –
// entlastet die mobile Startladephase, HTML bleibt server-seitig gerendert.
const AufmassDemo = dynamic(() => import('@/components/AufmassDemo'));

// ─── Terminbuchung über Google Kalender ───
// Eigener Appointment-Link (Google Kalender → Terminplanung →
// Buchungsseite → Link kopieren) als Env-Var in Vercel hinterlegen:
//   NEXT_PUBLIC_TERMIN_URL=https://calendar.google.com/calendar/appointments/...
// Fallback bis dahin: Demo-Anfrage-Formular.
const TERMIN_URL = process.env.NEXT_PUBLIC_TERMIN_URL || '/anfrage?art=demo';

// ============================================================
// SCAFFOLD OS – Startseite (Design v2 „Apple", erweitert)
// Hell, ruhig, großzügig. Marke: Sicherheits-Orange (#E8590C).
//
// Inhalt (Stand: Paket-Relaunch):
//  Hero mit Produkt-Aufklärung + Login-Link
//  „Was ist SCAFFOLD OS?" + Prozesskette (7 Schritte)
//  Zeitersparnis (Richtwert, eigene Einschätzung)
//  3 Kernbereiche: Aufmaß, Mitarbeiter, Lager
//  Alle Funktionen im Überblick
//  3 Pakete: Starter / Priority / Enterprise – alle Preise auf Anfrage
//  FAQ (SEO/GEO) + strukturierte Daten (JSON-LD)
// ============================================================

export const metadata: Metadata = {
  metadataBase: new URL('https://scaffoldos.de'),
  title: 'Gerüstbausoftware: KI-Aufmaß, CAD-Planung & Disposition | SCAFFOLD OS',
  description:
    'Gerüstbausoftware: KI-Aufmaß, Angebot, Disposition, Lager, Zeiterfassung & GoBD-Rechnung. Browserbasiert, DSGVO-konform, EU-Hosting. Jetzt Demo anfordern!',
  alternates: { canonical: 'https://scaffoldos.de' },
  openGraph: {
    title: 'Gerüstbausoftware: KI-Aufmaß, CAD-Planung & Disposition | SCAFFOLD OS',
    description:
      'Gerüstbausoftware: KI-Aufmaß, Angebot, Disposition, Lager, Zeiterfassung & GoBD-Rechnung. Browserbasiert, DSGVO-konform, EU-Hosting. Jetzt Demo anfordern!',
    url: 'https://scaffoldos.de',
    siteName: 'SCAFFOLD OS',
    locale: 'de_DE',
    type: 'website',
    images: [
      {
        url: '/og-share.png',
        width: 1200,
        height: 630,
        alt: 'SCAFFOLD OS – Die Gerüstbausoftware für Aufmaß, CAD & Disposition',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gerüstbausoftware: KI-Aufmaß, CAD-Planung & Disposition | SCAFFOLD OS',
    description:
      'Die All-in-One Software für Gerüstbauer. KI-Aufmaß, Angebote in Minuten, Touren-GPS & GoBD-Rechnung. Jetzt Demo-Zugang anfordern!',
    images: ['/og-share.png'],
  },
};

const PAKETE = [
  {
    id: 'starter',
    name: 'Starter',
    preis: 'Auf Anfrage',
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
    preis: 'Auf Anfrage',
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
    preis: 'Auf Anfrage',
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
    frage: 'Kann SCAFFOLD OS CAD-Grundrisse einlesen?',
    antwort:
      'Ja. Grundrisse und Fassadenmessung funktionieren per Foto, Drohnen-Upload oder Punktwolke – die CAD-Auswertung prüft Regelausführungs-Grenzen für ausgewählte Systeme (derzeit Layher Allround und PERI UP Flex) und erzeugt daraus automatisch die Materialliste.',
  },
  {
    frage: 'Was kostet SCAFFOLD OS?',
    antwort:
      'Drei Pakete: Starter, Priority und Enterprise. Die Preise nennen wir Ihnen auf Anfrage und erstellen Ihnen gerne ein individuelles Angebot passend zu Betriebsgröße und Modulen (Mindestvertragslaufzeit 36 Monate). Optional buchbar: Onboarding, erweitert mit Lagereinrichtung und Schulung der Mitarbeiter. Auf Anfrage richten wir Ihnen vorab einen persönlichen Demo-Zugang ein.',
  },
  {
    frage: 'Kann ich SCAFFOLD OS kostenlos testen?',
    antwort:
      'Ja, über einen kostenlosen und unverbindlichen Demo-Zugang. Fordern Sie ihn über den Button „Jetzt Demo anfordern" an – kurz Ihre Daten eintragen, wir richten Ihnen persönlich einen Zugang ein und schicken Ihnen die Zugangsdaten zu. Eine kostenlose Testphase nach Vertragsabschluss gibt es nicht.',
  },
  {
    frage: 'Wie viel Zeit spare ich mit SCAFFOLD OS?',
    antwort:
      'Das hängt vom Betrieb ab. Als Richtwert nach unserer eigenen Einschätzung (keine Kundenstudie): Ein Aufmaß mit Angebot dauert etwa 15 Minuten statt oft 2 bis 3 Stunden. Auch Zettel, Abstimmungs-Anrufe und handschriftliche Zeiterfassung fallen weg.',
  },
  {
    frage: 'Brauche ich IT-Kenntnisse oder eine Installation?',
    antwort:
      'Nein. SCAFFOLD OS läuft komplett im Browser – auf dem Handy des Monteurs genauso wie am PC im Büro. Es gibt nichts zu installieren und nichts zu warten. Wer ein Foto per WhatsApp verschicken kann, kann SCAFFOLD OS bedienen. Ein Onboarding-Assistent führt dich in 3 Schritten durch die Einrichtung.',
  },
  {
    frage: 'Wo werden meine Daten gespeichert?',
    antwort:
      'Jeder Betrieb bekommt eine eigene Datenbank in Frankfurt am Main. Komplett getrennt von anderen. DSGVO-konform. Deine Daten gehören dir.',
  },
  {
    frage: 'Wie kann ich kündigen?',
    antwort:
      'Die Mindestvertragslaufzeit beträgt 36 Monate, danach ist das Abo monatlich kündbar. Bei einer Kündigung wird deine Instanz pausiert – deine Daten bleiben erhalten und gehen nicht verloren.',
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
        { '@type': 'Offer', name: 'Starter' },
        { '@type': 'Offer', name: 'Priority' },
        { '@type': 'Offer', name: 'Enterprise' },
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

// HINWEIS: Die Screenshot-Sektion („Ein Blick ins System" mit echten
// UI-Bildern aus dem Betrieb) wurde bewusst entfernt – sie zeigte der
// Konkurrenz zu viel vom internen Aufbau. Interessenten sehen das System
// live: interaktive Demo (AufmassDemo), persönlicher Demo-Zugang oder
// Termin im Google Kalender. Auch die Dateien unter public/screenshots/
// wurden gelöscht (sonst weiterhin unter /screenshots/*.webp erreichbar).

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

      {/* ─── Sieben Abschnitte: 3D-Animation im Wechsel links/rechts mit den Texten (Hero, Funktionen, Säulen; Demo-Daten gekennzeichnet) ─── */}
      <StartFilm />

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

      {/* ─── Pakete ─── */}
      <section className="px-6 pb-24" id="pakete">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-center">
            Drei Pakete. <span className="text-[#86868b]">Passend zu Ihrem Betrieb.</span>
          </h2>
          <p className="mt-4 text-center text-[#6e6e73] max-w-2xl mx-auto">
            Auf Anfrage richten wir Ihnen vorab einen persönlichen Demo-Zugang ein. Danach
            zahlen Sie per SEPA-Lastschrift oder Kreditkarte, nach 36 Monaten monatlich kündbar.
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
                  href={`/anfrage?art=demo`}
                  className={`mt-8 inline-flex items-center justify-center gap-2 font-semibold px-6 py-3 rounded-full transition-all hover:scale-[1.02] ${
                    paket.hervorgehoben
                      ? 'bg-[#e8590c] hover:bg-[#d9480f] text-white'
                      : 'bg-black/5 hover:bg-black/10 text-[#1d1d1f]'
                  }`}
                >
                  Starten
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-[#86868b]">
            Preise und Konditionen auf Anfrage · Mindestvertragslaufzeit 36 Monate · Optional:
            Onboarding und Schulung · Fragen zu den Paketen?{' '}
            <Link href="/anfrage" className="text-[#e8590c] hover:underline">Kontakt aufnehmen</Link>
          </p>
        </div>
      </section>

      {/* ─── Terminbuchung über Google Kalender ───
          Link per Env-Var NEXT_PUBLIC_TERMIN_URL steuerbar (siehe Dateikopf),
          Fallback bis dahin: Demo-Anfrage-Formular. */}
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
            href={TERMIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#e8590c] hover:bg-[#d9480f] px-8 py-4 text-lg font-bold text-white transition-colors"
          >
            Kostenlosen Termin buchen <ArrowRight className="h-5 w-5" />
          </a>
          <p className="mt-6 text-xs text-[#86868b]">
            Die Buchung läuft über unseren Online-Kalender – du bekommst sofort eine Bestätigung per E-Mail.
          </p>
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
            Kurz Ihre Daten eintragen – wir richten Ihnen persönlich einen Demo-Zugang
            ein und schicken Ihnen die Zugangsdaten zu.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/anfrage?art=demo"
              className="inline-flex items-center gap-2 bg-[#e8590c] hover:bg-[#d9480f] text-white font-medium text-lg px-8 py-3.5 rounded-full transition-all hover:scale-[1.02] shadow-lg shadow-orange-600/20"
            >
              Jetzt Demo anfordern
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
