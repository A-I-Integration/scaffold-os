import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // NEU (Sicherheits-Review, Phase 58): Security-Header, die vorher
  // komplett fehlten. Bewusst OHNE Content-Security-Policy – die App
  // lädt von mehreren externen Diensten (Supabase, KI-Anbieter,
  // Sentry, ggf. Kartendienste), eine falsch konfigurierte CSP hätte
  // das Risiko, die Anwendung live zu zerschießen (Bilder/Uploads/
  // API-Aufrufe blockiert), ohne dass das lokal auffällt. Das braucht
  // einen eigenen, mit echten Tests abgesicherten Anlauf – lieber
  // jetzt die risikolosen Header, als überstürzt eine CSP, die alles
  // blockiert.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Verhindert Clickjacking (Seite in einem fremden iframe einbetten)
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Verhindert, dass der Browser Dateitypen "errät" (MIME-Sniffing)
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Schickt bei Links zu anderen Seiten nur die Domain mit, keine volle URL
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Erzwingt HTTPS für ein Jahr, auch bei Unterdomains
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Deaktiviert Browser-Funktionen, die diese App nicht braucht
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), payment=()' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Nur beim CI-Build (Vercel) Logs ausgeben, nicht bei jedem lokalen `npm run dev`.
  silent: !process.env.CI,
  // Mehr Source-Maps hochladen für lesbare Fehler-Stacktraces (etwas längere Build-Zeit).
  widenClientFileUpload: true,
  // Browser-Anfragen über eine Next.js-Route umleiten, damit Ad-Blocker sie nicht blockieren.
  tunnelRoute: "/monitoring",
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});
