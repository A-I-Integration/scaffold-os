import Link from 'next/link';
import { HardHat, ShieldCheck } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Registrierung (geschlossen)
// Optik-Stufe 1 / Sicherheitsfix:
// Die öffentliche Selbst-Registrierung ist deaktiviert.
// Grund: Auf dieser Seite konnte sich bisher JEDER – auch
// fremde Personen über den Link – ein Konto anlegen und sich
// dabei selbst die Rolle „Admin (CEO)" geben.
// Zugänge werden jetzt ausschließlich von CEO/Dispo unter
// „Zugänge" angelegt (mit passender Rolle).
// ============================================================

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-[#fbfbfd] flex items-center justify-center p-6">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl border border-black/10 shadow-2xl text-center">
        <div className="inline-flex items-center gap-2 mb-4">
          <HardHat className="w-8 h-8 text-[#e8590c]" />
          <span className="text-xl font-bold text-[#1d1d1f] tracking-tight">SCAFFOLD OS</span>
        </div>
        <div className="flex justify-center mb-4">
          <ShieldCheck className="w-12 h-12 text-emerald-600" />
        </div>
        <h1 className="text-lg font-semibold text-[#1d1d1f] mb-2">Registrierung nur durch deine Firma</h1>
        <p className="text-sm text-[#86868b] mb-6">
          Zugänge werden von der Geschäftsführung oder Disposition angelegt.
          Wende dich an deinen Chef – du bekommst E-Mail und Passwort von ihm.
        </p>
        <Link
          href="/login"
          className="inline-block bg-[#e8590c] hover:bg-[#d9480f] text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
        >
          Zur Anmeldung
        </Link>
      </div>
    </div>
  );
}
