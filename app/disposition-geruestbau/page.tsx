import type { Metadata } from 'next';
import FeatureSeite, { featureJsonLd, type FeatureSeiteProps } from '@/components/marketing/FeatureSeite';

// SEO-/GEO-Seite „Disposition Gerüstbau". Inhalte stammen aus Startseite, Hilfe und llms.txt.

const PFAD = '/disposition-geruestbau';
const TITEL = "Disposition Gerüstbau: Touren, GPS und Routen-KI";
const BESCHREIBUNG = "Disposition im Gerüstbau: Routen-KI plant die Touren, GPS zeigt die Fahrzeuge live, Umdisposition bei Krankheit oder Wetter. Jetzt Demo anfordern!";

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
  eyebrow: "Disposition Gerüstbau",
  h1: "Disposition im Gerüstbau – jede Tour im Blick",
  antwort: "Mit SCAFFOLD OS plant die Routen-KI die Touren, das Cockpit zeigt Status und GPS der Fahrzeuge, und bei Krankheit oder Wetter disponierst du kurzfristig um.",
  sektionen: [
  {
    "h2": "Touren planen mit der Routen-KI",
    "text": "Du hinterlegst einmal die Depot-Adresse. Morgens wählst du das Datum, lässt optimale Touren generieren und übernimmst sie. Die KI schlägt vor, die Disposition entscheidet.",
    "punkte": [
      "Depot-Adresse einmalig in den Einstellungen",
      "Touren für den Tag generieren und übernehmen",
      "Umdisposition bei kurzfristigen Änderungen",
      "Routen-KI und GPS-Tracking sind im Paket Priority enthalten"
    ]
  },
  {
    "h2": "GPS und Fahrer-Navigation",
    "text": "Fahrer navigieren direkt aus der App, die Zentrale sieht Fahrzeugpositionen live im Touren-Cockpit."
  },
  {
    "h2": "Planung, Krank und Urlaub",
    "text": "Krankheit und Urlaub landen direkt in der Tagesplanung, Konflikte werden sichtbar. Jeder Monteur sieht nur seine eigenen Touren, die Disposition sieht alle."
  },
  {
    "h2": "Zeiterfassung per Handy",
    "text": "Mitarbeiter stempeln am Handy, Pausen laufen automatisch. Soll-Ist-Vergleich und Überstunden siehst du auf einen Blick; ein DATEV-Lohn-Export steht bereit."
  }
],
  faq: [
  {
    "frage": "Wie plane ich Touren im Gerüstbau mit SCAFFOLD OS?",
    "antwort": "Depot-Adresse hinterlegen, Datum wählen, Touren von der Routen-KI generieren lassen und übernehmen. Im Touren-Cockpit verfolgst du Status und GPS der Fahrzeuge."
  },
  {
    "frage": "Was passiert bei Krankheit oder schlechtem Wetter?",
    "antwort": "Über die Umdisposition in der Routen-KI änderst du die Touren kurzfristig. Krank und Urlaub stehen direkt in der Planung."
  },
  {
    "frage": "Sieht jeder Mitarbeiter alle Touren?",
    "antwort": "Nein. Mitarbeiter sehen nur ihre eigenen Touren; Admin und Disposition sehen alles."
  },
  {
    "frage": "In welchem Paket ist die Routen-KI enthalten?",
    "antwort": "Routen-KI und GPS-Tracking gehören zum Paket Priority und höher. Details auf der Seite „Pakete & Preise“."
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
    "href": "/lager-geruestbau",
    "label": "Lager"
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
      jsonLd={featureJsonLd({ pfad: PFAD, titel: TITEL, beschreibung: BESCHREIBUNG, label: "Disposition & Touren", faq: SEITE.faq })}
    />
  );
}
