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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md p-8 bg-[#1e293b] rounded-2xl border border-[#334155] shadow-2xl text-center">
        <div className="inline-flex items-center gap-2 mb-4">
          <HardHat className="w-8 h-8 text-amber-400" />
          <span className="text-xl font-bold text-white tracking-tight">SCAFFOLD OS</span>
        </div>
        <div className="flex justify-center mb-4">
          <ShieldCheck className="w-12 h-12 text-emerald-400" />
        </div>
        <h1 className="text-lg font-semibold text-white mb-2">Registrierung nur durch deine Firma</h1>
        <p className="text-sm text-[#94a3b8] mb-6">
          Zugänge werden von der Geschäftsführung oder Disposition angelegt.
          Wende dich an deinen Chef – du bekommst E-Mail und Passwort von ihm.
        </p>
        <Link
          href="/login"
          className="inline-block bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold px-6 py-2.5 rounded-lg transition-colors"
        >
          Zur Anmeldung
        </Link>
      </div>
    </div>
  );
}
