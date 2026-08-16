import Link from 'next/link';

// ============================================================
// SCAFFOLD OS – Kauf erfolgreich
//
// Stripe leitet den Kunden nach der Zahlung hierher.
// Der Webhook richtet unterdessen das Kundensystem ein
// (dauert wenige Minuten) und schickt die Willkommens-Mail
// mit Zugangsdaten an die Kunden-E-Mail.
// ============================================================

export default function KaufenErfolgPage() {
  return (
    <div className="min-h-screen bg-white text-[#1d1d1f] flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="text-6xl mb-6">🎉</div>
        <h1 className="text-3xl font-black">Willkommen bei SCAFFOLD OS!</h1>
        <p className="text-[#86868b] mt-4 leading-relaxed">
          Deine Testphase hat begonnen – es wurde <strong className="text-[#1d1d1f]">nichts abgebucht</strong>.
          Die erste Abbuchung erfolgt erst nach 3 Tagen.
        </p>
        <div className="bg-[#f5f5f7] rounded-xl p-6 mt-6 text-left space-y-3">
          <p className="text-sm text-[#424245]">
            <span className="text-[#e8590c] font-bold">1.</span> Wir richten jetzt dein persönliches System ein (dauert wenige Minuten).
          </p>
          <p className="text-sm text-[#424245]">
            <span className="text-[#e8590c] font-bold">2.</span> Du erhältst eine E-Mail mit deinem Zugang und deiner persönlichen Adresse (deine-firma.scaffoldos.de).
          </p>
          <p className="text-sm text-[#424245]">
            <span className="text-[#e8590c] font-bold">3.</span> Keine E-Mail nach 15 Minuten? Schau in den Spam-Ordner oder schreib an{' '}
            <span className="text-[#e8590c]">info@a-i-integration.de</span>.
          </p>
        </div>
        <Link
          href="/"
          className="inline-block mt-8 bg-black/10 hover:bg-black/15 text-[#1d1d1f] font-medium px-6 py-3 rounded-xl transition"
        >
          Zur Startseite
        </Link>
      </div>
    </div>
  );
}
