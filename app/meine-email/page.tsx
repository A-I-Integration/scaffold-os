'use client';

import { Mail } from 'lucide-react';
import PostfachEinstellungen from '@/components/PostfachEinstellungen';

// ============================================================
// SCAFFOLD OS – "Meine E-Mail" (Menüpunkt in der Seitenleiste)
//
// Hier verbindet JEDER eingeloggte Nutzer sein eigenes Firmenpostfach.
// Die Verbindung gehört nur diesem Nutzer (email_accounts.employee_id).
// ============================================================

export default function MeineEmailPage() {
  return (
    <div className="min-h-screen bg-[#fbfbfd] p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Mail className="h-8 w-8 text-[#e8590c]" />
          <div>
            <h1 className="text-2xl font-bold text-[#1d1d1f]">Meine E-Mail</h1>
            <p className="text-sm text-[#86868b]">Dein Firmenpostfach – für Versand und Anzeige beim Kunden</p>
          </div>
        </div>
        <PostfachEinstellungen />
      </div>
    </div>
  );
}
