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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-400 text-sm transition-colors mb-10">
          <ArrowLeft className="w-4 h-4" /> Zurück zur Startseite
        </Link>

        <div className="flex items-center gap-2 mb-8">
          <HardHat className="w-7 h-7 text-amber-400" />
          <span className="text-lg font-bold tracking-tight">SCAFFOLD OS</span>
        </div>

        <h1 className="text-3xl font-bold mb-8">Impressum</h1>

        <section className="space-y-6 text-slate-300 leading-relaxed">
          <div>
            <h2 className="text-lg font-semibold text-amber-400 mb-2">Angaben gemäß § 5 DDG</h2>
            <p>
              SCAFFOLD OS UG (haftungsbeschränkt) i. G.<br />
              Ölbachstr. 48<br />
              48691 Vreden
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-amber-400 mb-2">Vertreten durch</h2>
            <p>Michelle Merola</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-amber-400 mb-2">Kontakt</h2>
            <p>
              E-Mail: <a href="mailto:info@scaffoldos.de" className="text-amber-400 hover:text-amber-300">info@scaffoldos.de</a><br />
              Telefon: 0151 77266265
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-amber-400 mb-2">Handelsregister</h2>
            <p>
              Die Gesellschaft befindet sich in Gründung. Registergericht und Registernummer
              werden nach Eintragung ergänzt.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-amber-400 mb-2">Umsatzsteuer-Identifikationsnummer</h2>
            <p>Beantragt. Die USt-IdNr. wird nach Erteilung ergänzt.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
