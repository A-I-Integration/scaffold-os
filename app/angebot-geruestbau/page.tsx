import type { Metadata } from 'next';
import FeatureSeite, { featureJsonLd, type FeatureSeiteProps } from '@/components/marketing/FeatureSeite';

// SEO-/GEO-Seite „Angebot Gerüstbau". Inhalte stammen aus Startseite, Hilfe und llms.txt.

const PFAD = '/angebot-geruestbau';
const TITEL = "Angebot Gerüstbau erstellen: in Minuten statt Stunden";
const BESCHREIBUNG = "Gerüstbau-Angebot direkt aus dem Aufmaß erzeugen: Materialliste, Kalkulation, PDF mit QR-Code, digitale Unterschrift am Handy. Jetzt Demo anfordern!";

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
  eyebrow: "Angebot Gerüstbau",
  h1: "Angebot im Gerüstbau in Minuten erstellen",
  antwort: "SCAFFOLD OS erzeugt das Gerüstbau-Angebot direkt aus dem Aufmaß: Materialliste und Preis stehen nach der KI-Planung bereit, das Angebot geht als PDF mit QR-Code raus und der Kunde kann auf dem Handy unterschreiben.",
  sektionen: [
  {
    "h2": "Vom Aufmaß zum fertigen Angebot",
    "text": "Nach dem Aufmaß zeigt Schritt 6 Materialliste, Preis und Risiko. Du kannst die Mengen anpassen sowie Skonto, Mietverlängerung, Nachtrag oder Rabatt berücksichtigen. Danach speicherst du das Projekt und verschickst das Angebot.",
    "punkte": [
      "Materialliste und Preis als KI-Vorschlag, von dir prüfbar und anpassbar",
      "Skonto, Mietverlängerung, Nachtrag und Rabatt einstellbar",
      "Angebot als PDF herunterladen oder direkt per E-Mail an den Kunden senden",
      "Preise und Gewichte stammen aus deinem eigenen Lager – du pflegst sie selbst"
    ]
  },
  {
    "h2": "QR-Code und digitale Unterschrift",
    "text": "Das Angebots-PDF enthält einen QR-Code. Vor Ort kann der Kunde direkt digital unterschreiben; der Status des Angebots wechselt dann auf „Angenommen“."
  },
  {
    "h2": "Vom Angebot zur Rechnung",
    "text": "Ist das Angebot angenommen, erstellst du daraus per Klick die Rechnung – die Positionen werden übernommen. Mehr dazu auf der Seite zur Rechnung."
  },
  {
    "h2": "Zeitersparnis: ein Richtwert",
    "text": "Nach unserer eigenen Einschätzung, nicht aus einer Kundenstudie: Ein Aufmaß mit Angebot dauert etwa 15 Minuten statt oft zwei bis drei Stunden. Wie viel es bei dir ist, hängt von deinem Betrieb ab."
  }
],
  faq: [
  {
    "frage": "Wie schnell ist ein Gerüstbau-Angebot erstellt?",
    "antwort": "Als Richtwert nach eigener Einschätzung (keine Kundenstudie): etwa 15 Minuten für Aufmaß und Angebot statt oft zwei bis drei Stunden. Das hängt vom Betrieb und vom Objekt ab."
  },
  {
    "frage": "Kann ich das Angebot noch ändern?",
    "antwort": "Ja. Mengen, Skonto, Mietverlängerung, Nachtrag und Rabatt lassen sich anpassen, bevor du das Angebot speicherst und versendest."
  },
  {
    "frage": "Woher kommen die Preise im Angebot?",
    "antwort": "Aus deinem Lager: Preise und Gewichte pflegst du pro Artikel selbst. Welche Preise du ansetzt, entscheidest du."
  },
  {
    "frage": "Kann der Kunde digital unterschreiben?",
    "antwort": "Ja. Der Kunde kann vor Ort auf dem Handy unterschreiben; das Angebot erhält dann den Status „Angenommen“."
  },
  {
    "frage": "Kann ich aus dem Angebot eine Rechnung machen?",
    "antwort": "Ja. Aus einem angenommenen Angebot erstellst du per Klick die Rechnung, die Positionen werden übernommen."
  }
],
  weiterfuehrend: [
  {
    "href": "/aufmass-geruestbau",
    "label": "Aufmaß"
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
      jsonLd={featureJsonLd({ pfad: PFAD, titel: TITEL, beschreibung: BESCHREIBUNG, label: "Angebot", faq: SEITE.faq })}
    />
  );
}
