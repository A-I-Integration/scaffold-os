'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<'bauleiter' | 'disponent' | 'admin'>('disponent');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Auth User erstellen
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Kein User erstellt');

      const userId = authData.user.id;

      // 2. Warten (Session aufbauen)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 3. Session holen (für RLS)
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('Session nicht verfügbar – E-Mail-Verifizierung erforderlich?');
      }

      // 4. Profil ERSTELLEN oder UPDATEN
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      let result;
      if (existing) {
        // Profil existiert (z.B. durch Trigger) → UPDATE
        result = await supabase
          .from('profiles')
          .update({
            role: selectedRole,
            full_name: fullName,
            email: email,
          })
          .eq('id', userId);
      } else {
        // Neues Profil → INSERT
        result = await supabase.from('profiles').insert({
          id: userId,
          full_name: fullName,
          email: email,
          role: selectedRole,
          created_at: new Date().toISOString(),
        });
      }

      if (result.error) throw result.error;

      // 5. VERIFIZIEREN
      const { data: verify } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', userId)
        .single();

      if (verify?.role !== selectedRole) {
        throw new Error(`Fehler: Rolle nicht korrekt gespeichert. Erwartet: ${selectedRole}, Ist: ${verify?.role}`);
      }

      // Erfolg → Weiterleitung
      router.push('/verify');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Registrierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🏗️</div>
          <h1 className="text-2xl font-bold text-white">SCAFFOLD OS</h1>
          <p className="text-blue-200 text-sm mt-1">Konto erstellen</p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 p-8 shadow-2xl">
          <form onSubmit={handleRegister} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-500/20 border border-red-400/30 rounded-lg text-red-200 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-blue-100 mb-1.5">Vollständiger Name</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                placeholder="Max Mustermann"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-100 mb-1.5">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                placeholder="name@firma.de"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-100 mb-1.5">Passwort (min. 6 Zeichen)</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-100 mb-1.5">Rolle</label>
              <select
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value as 'bauleiter' | 'disponent' | 'admin')}
                className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
              >
                <option value="bauleiter" className="bg-blue-900 text-white">Bauleiter</option>
                <option value="disponent" className="bg-blue-900 text-white">Disponent</option>
                <option value="admin" className="bg-blue-900 text-white">Admin (CEO)</option>
              </select>
              <p className="text-xs text-blue-300/70 mt-1.5">
                {selectedRole === 'admin' && 'Vollzugriff: Dashboard, Lager, Mitarbeiter, Statistiken'}
                {selectedRole === 'disponent' && 'Lager, Transporte, Mitarbeiter-Planung'}
                {selectedRole === 'bauleiter' && 'Baustellen, Aufmaß, Material-Pläne'}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-green-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
            >
              {loading ? 'Wird erstellt...' : 'Konto erstellen'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-blue-200 text-sm">
              Bereits registriert?{' '}
              <Link href="/login" className="text-white font-medium hover:underline">Anmelden</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}