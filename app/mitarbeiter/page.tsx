'use client';

import { useEffect, useState } from 'react';
import MitarbeiterZugaenge from '@/components/MitarbeiterZugaenge';
import PersonalStamm from '@/components/PersonalStamm';
import PersonalDokumente from '@/components/PersonalDokumente';

// ============================================================
// SCAFFOLD OS – Personal: drei Reiter
//   Zugänge & Lohnabrechnung | Mitarbeiter (Personalstamm) | Dokumente
// ============================================================

type Reiter = 'zugaenge' | 'stamm' | 'dokumente';
const REITER: { key: Reiter; label: string }[] = [
  { key: 'zugaenge', label: '🔑 Zugänge & Lohnabrechnung' },
  { key: 'stamm', label: '👤 Mitarbeiter' },
  { key: 'dokumente', label: '📎 Dokumente' },
];

export default function MitarbeiterPage() {
  const [reiter, setReiter] = useState<Reiter>('zugaenge');
  const [employees, setEmployees] = useState<{ id: string; first_name: string; last_name: string }[]>([]);

  useEffect(() => {
    fetch('/api/admin/users?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json()).then(j => { if (j.success) setEmployees(j.employees || []); }).catch(() => undefined);
  }, [reiter]);

  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold">👥 Personal</h1>
          <p className="text-[#86868b] mt-1">Zugänge, Personalstamm und Dokumente der Mitarbeiter.</p>
        </header>
        <nav className="flex flex-wrap gap-2 border-b border-black/10 pb-2" role="tablist" data-testid="personal-reiter">
          {REITER.map(r => (
            <button key={r.key} role="tab" aria-selected={reiter === r.key} onClick={() => setReiter(r.key)} data-testid={`reiter-${r.key}`}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${reiter === r.key ? 'bg-[#e8590c] text-white' : 'bg-black/5 text-[#424245] hover:bg-black/10'}`}>
              {r.label}
            </button>
          ))}
        </nav>
        {reiter === 'zugaenge' && <MitarbeiterZugaenge />}
        {reiter === 'stamm' && <PersonalStamm />}
        {reiter === 'dokumente' && <PersonalDokumente employees={employees} />}
      </div>
    </div>
  );
}
