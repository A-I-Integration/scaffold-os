import type { MetadataRoute } from 'next';

// ============================================================
// SCAFFOLD OS – robots.txt
// Öffentliche Seiten (Startseite, Kaufen, FAQ, Rechtliches)
// dürfen indexiert werden. Interne App-Bereiche, Kunden-
// Instanzen und API-Routen bleiben für Crawler gesperrt.
// ============================================================

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/kaufen', '/anfrage', '/login', '/hilfe', '/impressum', '/datenschutz', '/agb'],
      disallow: [
        '/api/',
        '/admin/',
        '/dashboard',
        '/aufmass/',
        '/lager',
        '/touren',
        '/meine-touren',
        '/planung',
        '/prognose',
        '/rechnungen',
        '/mitarbeiter',
        '/zeiterfassung',
        '/datenpflege',
        '/einstellungen',
        '/onboarding',
        '/stueckliste',
        '/routenoptimierung',
        '/fahrer/',
        '/abo-verwalten',
        '/kaufen/erfolg',
      ],
    },
    sitemap: 'https://scaffoldos.de/sitemap.xml',
  };
}
