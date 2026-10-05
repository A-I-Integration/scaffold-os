import type { Metadata } from 'next';
import FeatureSeite, { featureJsonLd, type FeatureSeiteProps } from '@/components/marketing/FeatureSeite';

// SEO-/GEO-Seite „Aufmaß Gerüstbau". Inhalte stammen aus Startseite, Hilfe und llms.txt.

const PFAD = '/aufmass-geruestbau';
const TITEL = "Aufmaß Gerüstbau: digital am Handy mit KI | SCAFFOLD OS";
const BESCHREIBUNG = "Aufmaß im Gerüstbau in 6 geführten Schritten am Handy erfassen: Fotos, Maße, Hersteller-System. Die KI schlägt Material und Preis vor. Demo anfordern!";

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
  eyebrow: "Aufmaß Gerüstbau",
  h1: "Aufmaß im Gerüstbau – digital erfasst, KI-gestützt kalkuliert",
  antwort: "Mit SCAFFOLD OS erfasst du das Gerüst-Aufmaß direkt vor Ort am Handy in sechs geführten Schritten – am Ende steht eine Materialliste mit Preis als Vorschlag, aus dem sich das Angebot erzeugen lässt.",
  sektionen: [
  {
    "h2": "So funktioniert das digitale Aufmaß",
    "text": "Das Aufmaß läuft in SCAFFOLD OS als geführter Ablauf. Du legst das Projekt an, trägst Maße, Gerüsttyp und Umgebung ein und prüfst am Ende die Zusammenfassung. Im sechsten Schritt startet die KI-Planung und liefert Materialliste, Preis und Risiko als Vorschlag.",
    "punkte": [
      "Projekt anlegen mit Kunde, Adresse und Fotos",
      "Maße, Gerüst, Umgebung und Zusammenfassung in den Schritten 2 bis 5",
      "Schritt 6: KI-Planung mit Materialliste, Preis und Risiko",
      "Projekt speichern und später über das Dashboard wieder öffnen – alle Daten bleiben erhalten"
    ]
  },
  {
    "h2": "Foto, Drohnen-Upload und Punktwolke",
    "text": "Fotos und Grundrisse können hochgeladen werden; erkannte Maße und Merkmale füllen das Aufmaß vor. Zusätzlich lassen sich Drohnen-Aufnahmen hochladen und Punktwolken (3D-Scans) auswerten. Die KI-Ergebnisse sind Vorschläge – du prüfst sie, bevor ein Angebot rausgeht."
  },
  {
    "h2": "Hersteller-Systeme mit echten Maßen",
    "text": "Für die Berechnung stehen Gerüstsysteme verschiedener Hersteller zur Verfügung, zum Beispiel Layher, MJ, Plettac und Alfix. Die Materialliste richtet sich nach dem gewählten System."
  },
  {
    "h2": "Vom Aufmaß direkt zum Angebot",
    "text": "Aus dem fertigen Aufmaß entsteht das Angebot ohne erneutes Abtippen: als PDF oder per E-Mail an den Kunden. Wie das aussieht, steht auf der Seite zum Angebot."
  }
],
  faq: [
  {
    "frage": "Wie läuft ein Aufmaß mit SCAFFOLD OS ab?",
    "antwort": "Du legst das Projekt an, trägst in den folgenden Schritten Maße, Gerüst und Umgebung ein und startest in Schritt 6 die KI-Planung. Das Ergebnis ist eine Materialliste mit Preis als Vorschlag, den du prüfst und anpasst."
  },
  {
    "frage": "Brauche ich eine Installation?",
    "antwort": "Nein. SCAFFOLD OS läuft im Browser auf Handy, Tablet und PC. Es gibt nichts zu installieren."
  },
  {
    "frage": "Kann ich Fotos oder Grundrisse hochladen?",
    "antwort": "Ja. Fotos und Grundrisse können hochgeladen werden. Erkannte Maße und Merkmale füllen das Aufmaß vor; du kontrollierst und korrigierst sie."
  },
  {
    "frage": "Was ist mit Drohnen und 3D-Scans?",
    "antwort": "Drohnen-Aufnahmen lassen sich hochladen. Punktwolken (3D-Scans) können ausgewertet werden; Großscans bis 500 MB sind im Paket Enterprise enthalten."
  },
  {
    "frage": "Trifft die KI die Entscheidung?",
    "antwort": "Nein. Die KI macht Vorschläge, die fachliche Entscheidung trifft immer ein Mensch. Prüfe das Ergebnis, bevor ein Angebot rausgeht oder Material bestellt wird."
  }
],
  weiterfuehrend: [
  {
    "href": "/angebot-geruestbau",
    "label": "Angebot"
  },
  {
    "href": "/rechnung-geruestbau",
    "label": "Rechnung & DATEV"
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
    "href": "https://www.baunetzwissen.de/gerueste-und-schalungen/tipps/beratungsstellen/bundesverband-geruestbau-164230",
    "label": "BauNetz Wissen: Bundesverband Gerüstbau"
  }
],
};

export default function Seite() {
  return (
    <FeatureSeite
      p={SEITE}
      jsonLd={featureJsonLd({ pfad: PFAD, titel: TITEL, beschreibung: BESCHREIBUNG, label: "Aufmaß", faq: SEITE.faq })}
    />
  );
}
