import type { MetadataRoute } from 'next';

// ============================================================
// SCAFFOLD OS – Sitemap (NUR öffentliche Seiten!)
// Interne Bereiche (Dashboard, Lager, Admin, API …) gehören
// nicht in den Suchindex und werden hier bewusst ausgelassen.
// ============================================================

const BASE = 'https://scaffoldos.de';

export default function sitemap(): MetadataRoute.Sitemap {
  const jetzt = new Date();
  return [
    { url: `${BASE}/`, lastModified: jetzt, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE}/kaufen`, lastModified: jetzt, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/anfrage`, lastModified: jetzt, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/login`, lastModified: jetzt, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${BASE}/hilfe`, lastModified: jetzt, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/impressum`, lastModified: jetzt, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/datenschutz`, lastModified: jetzt, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/agb`, lastModified: jetzt, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
