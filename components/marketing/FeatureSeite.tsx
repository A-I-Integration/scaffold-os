import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import LandingHeader from '@/components/LandingHeader';

// ============================================================
// SCAFFOLD OS – Vorlage für öffentliche Funktions-Seiten (SEO/GEO)
// Eine Seite pro Suchthema (Aufmaß, Angebot, Rechnung, Disposition,
// Lager). Reiner Server-Component, keine Datenbank, kein Login.
// Alle Aussagen stammen aus Startseite, Hilfe und llms.txt – hier
// wird nichts Neues behauptet.
// ============================================================

const BASE = 'https://scaffoldos.de';

export interface FeatureSektion { h2: string; text: string; punkte?: string[] }
export interface FeatureFaq { frage: string; antwort: string }
export interface FeatureLink { href: string; label: string; extern?: boolean }

export interface FeatureSeiteProps {
  pfad: string;                // z. B. '/aufmass-geruestbau'
  eyebrow: string;
  h1: string;
  antwort: string;             // Antwortsatz direkt unter der H1
  sektionen: FeatureSektion[];
  faq: FeatureFaq[];
  weiterfuehrend: FeatureLink[]; // Verweise auf Nachbar-Seiten
  fachlinks: FeatureLink[];      // externe, themenverwandte Quellen
}

export const FEATURE_SEITEN: { pfad: string; label: string }[] = [
  { pfad: '/aufmass-geruestbau', label: 'Aufmaß' },
  { pfad: '/angebot-geruestbau', label: 'Angebot' },
  { pfad: '/rechnung-geruestbau', label: 'Rechnung & DATEV' },
  { pfad: '/disposition-geruestbau', label: 'Disposition & Touren' },
  { pfad: '/lager-geruestbau', label: 'Lager' },
];

export function featureJsonLd(p: { pfad: string; titel: string; beschreibung: string; label: string; faq: FeatureFaq[] }) {
  const url = `${BASE}${p.pfad}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#seite`,
        url,
        name: p.titel,
        description: p.beschreibung,
        inLanguage: 'de',
        isPartOf: { '@type': 'WebSite', name: 'SCAFFOLD OS', url: BASE },
        about: { '@type': 'SoftwareApplication', name: 'SCAFFOLD OS', applicationCategory: 'BusinessApplication' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'SCAFFOLD OS', item: BASE },
          { '@type': 'ListItem', position: 2, name: p.label, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: p.faq.map((f) => ({
          '@type': 'Question',
          name: f.frage,
          acceptedAnswer: { '@type': 'Answer', text: f.antwort },
        })),
      },
    ],
  };
}

export default function FeatureSeite({ p, jsonLd }: { p: FeatureSeiteProps; jsonLd: object }) {
  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LandingHeader />

      <main className="flex-1">
        <section className="px-6 pt-16 pb-10 md:pt-24 md:pb-14">
          <div className="max-w-3xl mx-auto">
            <nav aria-label="Brotkrumen" className="text-sm text-[#86868b] mb-6">
              <Link href="/" className="hover:text-[#1d1d1f]">SCAFFOLD OS</Link>
              <span className="mx-2">/</span>
              <span>{p.eyebrow}</span>
            </nav>
            <p className="text-sm font-semibold tracking-widest text-[#e8590c] uppercase mb-3">{p.eyebrow}</p>
            <h1 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.1]">{p.h1}</h1>
            <p className="mt-6 text-lg md:text-xl text-[#424245] leading-relaxed">{p.antwort}</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/anfrage?art=demo"
                className="inline-flex items-center justify-center gap-2 bg-[#e8590c] hover:bg-[#d9480f] text-white font-medium px-7 py-3 rounded-full transition-colors"
              >
                Demo anfordern <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/kaufen"
                className="inline-flex items-center justify-center text-[#1d1d1f] font-medium px-7 py-3 rounded-full border border-black/10 hover:bg-black/5 transition-colors"
              >
                Pakete & Preise
              </Link>
            </div>
          </div>
        </section>

        {p.sektionen.map((s) => (
          <section key={s.h2} className="px-6 py-8">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">{s.h2}</h2>
              <p className="mt-4 text-[#424245] leading-relaxed">{s.text}</p>
              {s.punkte && (
                <ul className="mt-4 space-y-2">
                  {s.punkte.map((x) => (
                    <li key={x} className="flex gap-3 text-[#424245]">
                      <Check className="w-5 h-5 text-[#e8590c] shrink-0 mt-0.5" />
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}

        <section className="px-6 py-10">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Häufige Fragen</h2>
            <div className="mt-6 space-y-3">
              {p.faq.map((f) => (
                <details key={f.frage} className="group rounded-2xl border border-black/5 bg-white px-5 py-4">
                  <summary className="cursor-pointer font-medium list-none flex justify-between gap-4">
                    <span>{f.frage}</span>
                    <span className="text-[#86868b] group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <p className="mt-3 text-[#424245] leading-relaxed">{f.antwort}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl font-semibold tracking-tight">Weitere Funktionen von SCAFFOLD OS</h2>
            <ul className="mt-4 grid sm:grid-cols-2 gap-2">
              {p.weiterfuehrend.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="block rounded-xl border border-black/5 bg-white px-4 py-3 text-[#1d1d1f] hover:border-[#e8590c]/40 transition-colors">
                    {l.label} <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
            {p.fachlinks.length > 0 && (
              <p className="mt-8 text-sm text-[#6e6e73]">
                Weiterführend:{' '}
                {p.fachlinks.map((l, i) => (
                  <span key={l.href}>
                    {i > 0 && ' · '}
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className="underline hover:text-[#1d1d1f]">{l.label}</a>
                  </span>
                ))}
              </p>
            )}
          </div>
        </section>
      </main>

      <footer className="px-6 py-10 border-t border-black/5 text-sm text-[#86868b]">
        <div className="max-w-3xl mx-auto flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/" className="hover:text-[#1d1d1f]">Startseite</Link>
          <Link href="/kaufen" className="hover:text-[#1d1d1f]">Pakete</Link>
          <Link href="/impressum" className="hover:text-[#1d1d1f]">Impressum</Link>
          <Link href="/datenschutz" className="hover:text-[#1d1d1f]">Datenschutz</Link>
          <Link href="/agb" className="hover:text-[#1d1d1f]">AGB</Link>
        </div>
      </footer>
    </div>
  );
}
