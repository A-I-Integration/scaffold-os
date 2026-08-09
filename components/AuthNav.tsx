'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface UserProfile {
  id: string;
  role: 'admin' | 'disponent' | 'bauleiter' | 'mitarbeiter' | 'lager';
  full_name?: string;
}

export default function AuthNav() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, role, full_name')
          .eq('id', user.id)
          .single();
        setProfile(profileData);
      }
      
      setLoading(false);
    }
    
    getUser();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        supabase.from('profiles')
          .select('id, role, full_name')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => setProfile(data));
      } else {
        setProfile(null);
      }
    });
    
    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const isAdmin = profile?.role === 'admin';
  const isDisponent = profile?.role === 'disponent';
  const isBauleiter = profile?.role === 'bauleiter';
  const isMitarbeiter = profile?.role === 'mitarbeiter';
  const isLager = profile?.role === 'lager';
  const canAccessDashboard = isAdmin || isDisponent;
  const canAccessLager = isAdmin || isDisponent || isBauleiter || isLager;
  const canAccessPlanung = isAdmin || isDisponent || isBauleiter;
  const canAccessTouren = isAdmin || isDisponent;
  const canAccessAufmass = isAdmin || isBauleiter;

  const navLinkClass = (path: string) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      pathname === path
        ? 'bg-blue-700 text-white'
        : 'text-gray-300 hover:bg-blue-600 hover:text-white'
    }`;

  if (loading) {
    return (
      <nav className="bg-blue-900 border-b border-blue-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <span className="text-white font-bold text-xl">SCAFFOLD OS</span>
            </div>
            <div className="animate-pulse bg-blue-800 h-8 w-32 rounded"></div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="bg-blue-900 border-b border-blue-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Links */}
          <div className="flex items-center gap-8">
            <Link href="/" className="text-white font-bold text-xl tracking-tight">
              SCAFFOLD OS
            </Link>
            
            <div className="hidden md:flex items-center gap-1">
              {canAccessDashboard && (
                <Link href="/dashboard" className={navLinkClass('/dashboard')}>
                  Dashboard
                </Link>
              )}
              
              {canAccessLager && (
                <Link href="/lager" className={navLinkClass('/lager')}>
                  Lager
                </Link>
              )}
              
              {canAccessPlanung && (
                <Link href="/planung" className={navLinkClass('/planung')}>
                  Planung
                </Link>
              )}

              {canAccessTouren && (
                <Link href="/touren" className={navLinkClass('/touren')}>
                  Touren
                </Link>
              )}

              {canAccessTouren && (
                <Link href="/mitarbeiter" className={navLinkClass('/mitarbeiter')}>
                  Zugänge
                </Link>
              )}

              {user && (
                <Link href="/meine-touren" className={navLinkClass('/meine-touren')}>
                  Meine Touren
                </Link>
              )}

              {canAccessAufmass && (
                <Link href="/aufmass/schritt1" className={navLinkClass('/aufmass/schritt1')}>
                  Aufmaß
                </Link>
              )}
            </div>
          </div>

          {/* User Section */}
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-blue-200 text-sm">
                    {profile?.full_name || user.email}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    isAdmin ? 'bg-red-500 text-white' :
                    isDisponent ? 'bg-yellow-500 text-black' :
                    isBauleiter ? 'bg-green-500 text-white' :
                    isMitarbeiter ? 'bg-sky-500 text-white' :
                    isLager ? 'bg-purple-500 text-white' :
                    'bg-gray-500 text-white'
                  }`}>
                    {profile?.role?.toUpperCase() || 'USER'}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-red-600 hover:text-white transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className={navLinkClass('/login')}>
                  Login
                </Link>
                <Link
                  href="/register"
                  className="px-3 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                >
                  Registrieren
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}