'use client';

import { loescheOfflineKopien } from '@/lib/offline/cache-leeren'
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await loescheOfflineKopien();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-red-600 hover:text-red-700 transition"
    >
      Abmelden
    </button>
  );
}