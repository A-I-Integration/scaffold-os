import Link from 'next/link';
import { HardHat, ArrowLeft } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Impressum
// Inhalt: Arbeitsfassung vom 11.08.2026 (Anwalt prüft final).
// Interne Prüf-/Arbeitsnotizen aus der PDF-Arbeitsfassung
// wurden hier bewusst NICHT übernommen.
// ============================================================

export const metadata = { title: 'Impressum – SCAFFOLD OS' };

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-[#86868b] hover:text-[#e8590c] text-sm transition-colors mb-10">
          <ArrowLeft className="w-4 h-4" /> Zurück zur Startseite
        </Link>

        <div className="flex items-center gap-2 mb-8">
          <HardHat className="w-7 h-7 text-[#e8590c]" />
          <span className="text-lg font-bold tracking-tight">SCAFFOLD OS</span>
        </div>

        <h1 className="text-3xl font-bold mb-8">Impressum</h1>

        <section className="space-y-6 text-[#424245] leading-relaxed">
          <div>
            <h2 className="text-lg font-semibold text-[#e8590c] mb-2">Angaben gemäß § 5 DDG</h2>
            <p>
              AI Integration<br />
              Inhaberin: Michelle Merola (Einzelunternehmen)<br />
              Ölbachstr. 48<br />
              48691 Vreden
            </p>
            <p className="mt-2">
              SCAFFOLD OS ist ein Produkt von AI Integration.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-[#e8590c] mb-2">Verantwortlich für den Inhalt</h2>
            <p>Michelle Merola (Anschrift wie oben)</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-[#e8590c] mb-2">Kontakt</h2>
            <p>
              E-Mail: <a href="mailto:info@scaffoldos.de" className="text-[#e8590c] hover:text-[#e8590c]">info@scaffoldos.de</a><br />
              Telefon: 0151 77266265
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-[#e8590c] mb-2">Unternehmensform</h2>
            <p>
              AI Integration ist ein Einzelunternehmen (kein Kleingewerbe).
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-[#e8590c] mb-2">Umsatzsteuer-Identifikationsnummer</h2>
            <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: wird ergänzt.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
