'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
// ...
const supabase = createClient();

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Prüfe Login-Status
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    // Listener für Auth-Änderungen
    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    loadProjects();
  }, []);

  async function loadProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setProjects(data);
    }
    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    router.push('/');
  }

  async function deleteProject(id: string) {
    await supabase.from('projects').delete().eq('id', id);
    loadProjects();
  }

  function openProject(project: any) {
    if (project.data) {
      Object.entries(project.data).forEach(([key, value]) => {
        localStorage.setItem(key, JSON.stringify(value));
      });
    }
    router.push('/aufmass');
  }

  function neuesProjekt() {
    localStorage.clear();
    router.push('/aufmass');
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      
      <nav className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏗️</span>
            <span className="text-xl font-bold tracking-tight">SCAFFOLD<span className="text-orange-500">OS</span></span>
          </div>
          <div>
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-400">{user.email}</span>
                <button onClick={logout} className="text-sm text-red-400 hover:text-red-300 transition">
                  Abmelden
                </button>
              </div>
            ) : (
              <button 
                onClick={() => router.push('/login')}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm transition"
              >
                Anmelden
              </button>
            )}
          </div>
        </div>
      </nav>

      <section className="max-w-6xl mx-auto px-6 pt-16 pb-10 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Digitales Aufmaß.<br />
          <span className="text-orange-500">KI-gestützte Planung.</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-8">
          Erstelle in Minuten ein komplettes Gerüstkonzept – gespeichert in der Cloud.
        </p>
        <button 
          onClick={neuesProjekt}
          className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 px-8 rounded-xl text-lg transition shadow-lg shadow-orange-600/20"
        >
          🚀 Neues Projekt starten
        </button>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          📁 Gespeicherte Projekte
          {loading && <span className="text-sm font-normal text-slate-500">(laden...)</span>}
        </h2>

        {projects.length === 0 && !loading && (
          <div className="bg-slate-800 rounded-xl p-8 text-center border border-slate-700">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-slate-400">Noch keine Projekte gespeichert.</p>
            <p className="text-slate-500 text-sm mt-1">Starte dein erstes Aufmaß oben.</p>
          </div>
        )}

        <div className="space-y-3">
          {projects.map((p) => (
            <div key={p.id} className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-orange-500/50 transition flex justify-between items-center">
              <div className="flex-1">
                <div className="text-lg font-semibold text-white">{p.name}</div>
                <div className="text-slate-400 text-sm">
                  {p.data?.s1?.adresse || 'Keine Adresse'}
                </div>
                <div className="text-slate-500 text-xs mt-1">
                  {new Date(p.created_at).toLocaleDateString('de-DE')}
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => openProject(p)}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                >
                  Öffnen
                </button>
                <button 
                  onClick={() => deleteProject(p.id)}
                  className="bg-red-600/20 hover:bg-red-600/40 text-red-400 px-3 py-2 rounded-lg text-sm transition"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-slate-500 text-sm">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span>🏗️</span>
            <span className="font-bold">SCAFFOLD<span className="text-orange-500">OS</span></span>
          </div>
          © 2026 Scaffold OS • Powered by AI Integration
        </div>
      </footer>
    </div>
  );
}