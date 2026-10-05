import type { Metadata } from 'next';
import LandingHeader from '@/components/LandingHeader';
import EignungsCheckFormular from './EignungsCheckFormular';

export const metadata: Metadata = {
  metadataBase: new URL('https://scaffoldos.de'),
  title: 'Ist SCAFFOLD OS für Ihren Gerüstbau-Betrieb geeignet?',
  description: 'Kurze Umfrage für Gerüstbau-Betriebe: Aufmaß, Material, Lager, Angebot und Rechnung. Wir melden uns und prüfen gemeinsam, ob SCAFFOLD OS zu Ihnen passt.',
  alternates: { canonical: 'https://scaffoldos.de/eignungscheck' },
};

export default function EignungscheckSeite() {
  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f]">
      <LandingHeader />
      <main className="px-6 py-14 md:py-20">
        <div className="max-w-2xl mx-auto">
          <p className="text-sm font-semibold tracking-widest text-[#e8590c] uppercase mb-3">Kurz-Umfrage</p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Ist SCAFFOLD OS überhaupt für Sie geeignet?</h1>
          <p className="mt-4 text-[#424245] leading-relaxed">
            Beantworten Sie ein paar Fragen zu Ihrem Alltag im Gerüstbau. Es gibt keine falschen Antworten,
            und Sie müssen nicht alles ausfüllen. Wir lesen jede Antwort selbst und sagen Ihnen ehrlich,
            ob und wo SCAFFOLD OS helfen kann.
          </p>
          <EignungsCheckFormular />
        </div>
      </main>
    </div>
  );
}
