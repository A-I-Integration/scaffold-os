'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { HardHat } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Wechselnde Aussagen in der Leiste über dem Menü (Texte der Geschäftsführung).
const MELDUNGEN = [
  'Mit Gerüstbauern, Statikern und Architekten zusammen entwickelt',
  'Mit Gerüstbauern für Gerüstbauer',
  'Vom Aufmaß zum Angebot schneller, als der Kaffee durch ist',
  'Neu: LV-Funktion',
  'Jetzt noch bis zum 31.12. zum Einführungspreis sichern!',
];

function Meldungsleiste() {
  const [i, setI] = useState(0);
  const [aus, setAus] = useState(false);
  useEffect(() => {
    const t = setInterval(() => {
      setAus(true);
      setTimeout(() => { setI((x) => (x + 1) % MELDUNGEN.length); setAus(false); }, 450);
    }, 4200);
    return () => clearInterval(t);
  }, []);
  return (
    <Link
      href="/anfrage?art=demo"
      className="flex min-h-9 items-center justify-center bg-[#e8590c] px-3 py-1 text-center text-[13px] font-semibold leading-tight text-white"
      role="status"
    >
      <span className={`block transition-all duration-500 ${aus ? 'opacity-0 -translate-y-1' : 'opacity-100'}`}>{MELDUNGEN[i]}</span>
    </Link>
  );
}

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
    <div data-landing-kopf className="sticky top-0 z-40">
    <Meldungsleiste />
    <header className="backdrop-blur-xl bg-white/80 border-b border-black/5">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 whitespace-nowrap font-semibold tracking-tight">
          <HardHat className="w-5 h-5 text-[#e8590c]" />
          SCAFFOLD OS
        </span>
        <nav className="flex items-center gap-2 whitespace-nowrap text-sm sm:gap-6">
          <Link href="/login" className="text-[#6e6e73] hover:text-[#1d1d1f] transition-colors">Anmelden</Link>
          <Link
            href="/anfrage?art=demo"
            className="bg-[#e8590c] hover:bg-[#d9480f] text-white font-medium px-3 sm:px-4 py-1.5 text-[13px] sm:text-sm rounded-full transition-colors"
          >
            <span className="sm:hidden">Demo anfordern</span><span className="hidden sm:inline">Jetzt Demo anfordern</span>
          </Link>
        </nav>
      </div>
    </header>
    </div>
  );
}
