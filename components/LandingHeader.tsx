'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { HardHat } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ============================================================
// Marketing-Header der Startseite.
// Eingeloggte Nutzer haben bereits die Sidebar mit Logo –
// dann wird dieser Header ausgeblendet (kein doppeltes Logo).
// ============================================================
export default function LandingHeader() {
  const [eingeloggt, setEingeloggt] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setEingeloggt(!!user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setEingeloggt(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Noch unbekannt → Header zeigen (Startseite ist primär für Gäste)
  if (eingeloggt) return null;

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/70 border-b border-black/5">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <HardHat className="w-5 h-5 text-[#e8590c]" />
          SCAFFOLD OS
        </span>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/login" className="text-[#6e6e73] hover:text-[#1d1d1f] transition-colors">Anmelden</Link>
          <Link
            href="/kaufen"
            className="bg-[#e8590c] hover:bg-[#d9480f] text-white font-medium px-4 py-1.5 rounded-full transition-colors"
          >
            3 Tage kostenlos testen
          </Link>
        </nav>
      </div>
    </header>
  );
}
