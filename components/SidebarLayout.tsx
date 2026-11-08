'use client';

import { loescheOfflineKopien } from '@/lib/offline/cache-leeren'
import { istStatiker } from '@/lib/statiker';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import ProductTour from './ProductTour';
import AppShell from './shell/AppShell';
import type { Rolle } from './shell/nav-config';

// ============================================================
// SCAFFOLD OS – Rahmen um alle Seiten.
// Login, echte Rollen aus Supabase und Produkt-Tour wie bisher.
// Die Navigation ist EINE Oberfläche für alle Rollen und Bildschirmgrößen
// (components/shell/AppShell.tsx, Menüstruktur in components/shell/nav-config.ts).
// ============================================================

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<{ role: string; full_name?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [zeigeTour, setZeigeTour] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', user.id)
          .single();
        setProfile(data);
        // Produkt-Tour beim allerersten Login zeigen
        if (typeof window !== 'undefined' && !localStorage.getItem(`scaffold_tour_seen_${user.id}`)) {
          setZeigeTour(true);
        }
      }
      setLoading(false);
    }
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        supabase.from('profiles').select('role, full_name').eq('id', session.user.id).single()
          .then(({ data }) => setProfile(data));
      } else {
        setProfile(null);
      }
    });
    return () => { subscription.unsubscribe(); };
  }, []);

  async function handleLogout() {
    await loescheOfflineKopien();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  // Nicht eingeloggt (oder lädt noch) → Seite ohne Menü anzeigen
  // Statiker-Bereich (extern): bewusst ohne Firmen-Menü, eigene Kopfzeile
  if (loading || !user || pathname.startsWith('/statiker') || pathname.startsWith('/baustelle/') || pathname.startsWith('/auftrag/') || istStatiker(user)) {
    return <>{children}</>;
  }

  const rolle = (profile?.role || 'mitarbeiter') as Rolle;

  return (
    <>
      <AppShell rolle={rolle} name={profile?.full_name || user.email || ''} onLogout={handleLogout}>
        {children}
      </AppShell>
      {zeigeTour && user && (
        <ProductTour onClose={() => { localStorage.setItem(`scaffold_tour_seen_${user.id}`, 'true'); setZeigeTour(false); }} />
      )}
    </>
  );
}
