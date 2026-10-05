import type { Metadata } from 'next';
import FeatureSeite, { featureJsonLd, type FeatureSeiteProps } from '@/components/marketing/FeatureSeite';

// SEO-/GEO-Seite „Lager Gerüstbau". Inhalte stammen aus Startseite, Hilfe und llms.txt.

const PFAD = '/lager-geruestbau';
const TITEL = "Lager Gerüstbau: Bestände, Stückliste und Prognose";
const BESCHREIBUNG = "Gerüstbau-Lager digital verwalten: automatische Stückliste aus dem Aufmaß, Reservierung pro Baustelle, KI-Prognose bei knappen Beständen. Demo anfordern!";

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
  eyebrow: "Lager Gerüstbau",
  h1: "Das Gerüstbau-Lager im Griff – vom Rahmen bis zur Klemme",
  antwort: "SCAFFOLD OS verwaltet deine Bestände digital, erzeugt aus jedem Aufmaß automatisch die Stückliste, reserviert Material pro Baustelle und warnt per KI-Prognose, bevor Material knapp wird.",
  sektionen: [
  {
    "h2": "Bestände, Preise und Gewichte pflegst du selbst",
    "text": "Jede Firma pflegt ihr Lager selbst: Artikel mit Artikelnummer, Name, Preis und Gewicht. Aufmaß und CAD-Planung rechnen mit diesen Werten – welche Preise gelten, entscheidest du.",
    "punkte": [
      "Alle Bestände digital erfasst – vom Rahmen bis zur Klemme",
      "Preis und Gewicht pro Artikel in deinem Lager",
      "Lagergrenzen je Paket: 10.000, 20.000 oder unbegrenzt viele Teile"
    ]
  },
  {
    "h2": "Automatische Stückliste aus dem Aufmaß",
    "text": "Aus jedem Aufmaß entsteht die Stückliste: Was muss auf den Lkw? Mengen lassen sich vor dem Angebot anpassen."
  },
  {
    "h2": "Reservierung pro Baustelle",
    "text": "Material wird einer Baustelle reserviert, damit nichts doppelt verplant wird. Der Baustellenbestand zeigt, was verbaut ist und was zurückkommt."
  },
  {
    "h2": "Prognose-KI",
    "text": "Die Lager-Prognose gibt eine Einschätzung, was wann knapp wird. Sie ist im Paket Priority enthalten und ein Hinweis, keine Garantie."
  }
],
  faq: [
  {
    "frage": "Wie verwalte ich mein Gerüstbau-Lager mit SCAFFOLD OS?",
    "antwort": "Du erfasst Artikel mit Artikelnummer, Name, Preis und Gewicht digital. Aufmaß, Stückliste und Reservierung greifen auf diese Bestände zu."
  },
  {
    "frage": "Entsteht die Stückliste automatisch?",
    "antwort": "Ja, aus jedem Aufmaß. Mengen kannst du vor dem Angebot anpassen."
  },
  {
    "frage": "Wie viele Teile kann ich im Lager führen?",
    "antwort": "Je nach Paket bis 10.000 (Starter), bis 20.000 (Priority) oder unbegrenzt (Enterprise)."
  },
  {
    "frage": "Wer legt die Preise im Lager fest?",
    "antwort": "Du. Jeder Betrieb pflegt seine Preise und Gewichte selbst; SCAFFOLD OS gibt keine Preise vor."
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
    "href": "/rechnung-geruestbau",
    "label": "Rechnung & DATEV"
  },
  {
    "href": "/disposition-geruestbau",
    "label": "Disposition & Touren"
  },
  {
    "href": "/kaufen",
    "label": "Pakete & Preise"
  }
],
  fachlinks: [],
};

export default function Seite() {
  return (
    <FeatureSeite
      p={SEITE}
      jsonLd={featureJsonLd({ pfad: PFAD, titel: TITEL, beschreibung: BESCHREIBUNG, label: "Lager", faq: SEITE.faq })}
    />
  );
}
