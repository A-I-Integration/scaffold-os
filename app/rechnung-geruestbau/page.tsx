import type { Metadata } from 'next';
import FeatureSeite, { featureJsonLd, type FeatureSeiteProps } from '@/components/marketing/FeatureSeite';

// SEO-/GEO-Seite „Rechnung Gerüstbau". Inhalte stammen aus Startseite, Hilfe und llms.txt.

const PFAD = '/rechnung-geruestbau';
const TITEL = "Rechnung Gerüstbau: GoBD-konform mit DATEV-Export";
const BESCHREIBUNG = "Rechnungen für den Gerüstbau: Voll-, Abschlags- und Schlussrechnung, Mahnwesen und DATEV-Buchungsstapel für den Steuerberater. Jetzt Demo anfordern!";

export const metadata: Metadata = {
  metadataBase: new URL('https://scaffoldos.de'),
  title: TITEL,
  description: BESCHREIBUNG,
  alternates: { canonical: `https://scaffoldos.de${PFAD}` },
  openGraph: {
    title: TITEL,
    description: BESCHREIBUNG,
    url: `https://scaffoldos.de${PFAD}`,
    siteName: 'SCAFFOLD OS',
    locale: 'de_DE',
    type: 'website',
    images: [{ url: '/og-share.png', width: 1200, height: 630, alt: 'SCAFFOLD OS – Software für Gerüstbau-Betriebe' }],
  },
};

const SEITE: FeatureSeiteProps = {
  pfad: PFAD,
  eyebrow: "Rechnung Gerüstbau",
  h1: "Rechnungen im Gerüstbau – GoBD-konform, DATEV-Export inklusive",
  antwort: "In SCAFFOLD OS schreibst du Voll-, Abschlags- und Schlussrechnungen für den Gerüstbau, mahnst überfällige Rechnungen und exportierst einen DATEV-Buchungsstapel für deinen Steuerberater.",
  sektionen: [
  {
    "h2": "Rechnung schreiben – auch direkt aus dem Angebot",
    "text": "Eine Rechnung legst du neu an oder erzeugst sie aus einem angenommenen Angebot per Klick; die Positionen werden übernommen. Die Rechnungsnummer wird automatisch vergeben, das Zahlungsziel ist vorbelegt.",
    "punkte": [
      "Typ wählen: Vollrechnung, Abschlagsrechnung oder Schlussrechnung",
      "Rechnungsnummer automatisch im Format RE-JAHR-0001",
      "PDF herunterladen oder direkt per E-Mail an den Kunden senden",
      "Status pflegen: offen, bezahlt, überfällig oder storniert"
    ]
  },
  {
    "h2": "Mahnwesen",
    "text": "Überfällige Rechnungen werden gekennzeichnet. Mit einem Klick erstellst du die 1. Mahnung als PDF, optional direkt per E-Mail; bleibt die Rechnung offen, folgt die 2. Mahnung mit Hinweis auf Verzugszinsen. Die Mahnstufe steht in der Rechnungsliste."
  },
  {
    "h2": "DATEV: Buchungsstapel und Lohn für den Steuerberater",
    "text": "Im Rechnungsmodul exportierst du einen DATEV-Buchungsstapel für die Buchhaltung, aus der Zeiterfassung einen DATEV-Lohn-Export. Vor dem ersten Import stimmst du Kontenrahmen, Personalnummern sowie Berater- und Mandantennummer mit deinem Steuerberater ab."
  },
  {
    "h2": "GoBD",
    "text": "Rechnungen werden nach den GoBD-Anforderungen geführt. Bereits erstellte Rechnungen bleiben bewusst unverändert; spätere Änderungen am Firmenprofil wirken nur auf neue Rechnungen. Verbindliche Auskunft zu deinen steuerlichen Pflichten gibt dir dein Steuerberater."
  }
],
  faq: [
  {
    "frage": "Welche Rechnungsarten gibt es?",
    "antwort": "Vollrechnung, Abschlagsrechnung und Schlussrechnung."
  },
  {
    "frage": "Gibt es einen DATEV-Export?",
    "antwort": "Ja: einen DATEV-Buchungsstapel im Rechnungsmodul und einen DATEV-Lohn-Export in der Zeiterfassung. Die Einstellungen stimmst du vor dem ersten Import mit deinem Steuerberater ab."
  },
  {
    "frage": "Kann ich Mahnungen erstellen?",
    "antwort": "Ja. Es gibt eine 1. und eine 2. Mahnung als PDF, optional direkt per E-Mail an den Kunden."
  },
  {
    "frage": "Wird die Rechnung automatisch aus dem Angebot erzeugt?",
    "antwort": "Per Klick auf „Rechnung erstellen“ bei einem angenommenen Angebot. Die Positionen werden übernommen."
  },
  {
    "frage": "Was bedeutet GoBD-konform?",
    "antwort": "Die GoBD sind Grundsätze des Finanzamts zur ordnungsmäßigen Buchführung in elektronischer Form. SCAFFOLD OS führt Rechnungen danach; bereits erstellte Rechnungen bleiben unverändert. Für steuerliche Fragen ist dein Steuerberater zuständig."
  }
],
  weiterfuehrend: [
  {
    "href": "/aufmass-geruestbau",
    "label": "Aufmaß"
  },
  {
    "href": "/angebot-geruestbau",
    "label": "Angebot"
  },
  {
    "href": "/disposition-geruestbau",
    "label": "Disposition & Touren"
  },
  {
    "href": "/lager-geruestbau",
    "label": "Lager"
  },
  {
    "href": "/kaufen",
    "label": "Pakete & Preise"
  }
],
  fachlinks: [
  {
    "href": "https://www.ihk-muenchen.de/de/Service/Recht-und-Steuern/Steuerrecht/Finanzverwaltung/Grunds%C3%A4tze-zur-elektronischen-Buchf%C3%BChrung-(GOBD)/",
    "label": "IHK München: Grundsätze zur elektronischen Buchführung (GoBD)"
  },
  {
    "href": "https://www.datev.de",
    "label": "DATEV"
  }
],
};

export default function Seite() {
  return (
    <FeatureSeite
      p={SEITE}
      jsonLd={featureJsonLd({ pfad: PFAD, titel: TITEL, beschreibung: BESCHREIBUNG, label: "Rechnung & DATEV", faq: SEITE.faq })}
    />
  );
}
