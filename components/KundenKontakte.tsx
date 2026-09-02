'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, User } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Mehrere Kunden-Ansprechpartner (Phase 28)
// ============================================================

interface Kontakt { id: string; name: string; bezeichnung: string | null; email: string | null; phone: string | null; is_primary: boolean }

const inputCls = 'w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:border-[#e8590c]';

export default function KundenKontakte({ customerId }: { customerId: string }) {
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [loading, setLoading] = useState(true);
  const [neuOffen, setNeuOffen] = useState(false);
  const [form, setForm] = useState({ name: '', bezeichnung: '', email: '', phone: '' });
  const [speichern, setSpeichern] = useState(false);

  const lade = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kunden-kontakte?customer_id=${customerId}`);
      const json = await res.json();
      if (json.success) setKontakte(json.contacts || []);
    } catch { /* still */ }
    setLoading(false);
  }, [customerId]);
  useEffect(() => { lade(); }, [lade]);

  async function hinzufuegen() {
    if (!form.name.trim()) { alert('Bitte Name eingeben.'); return; }
    setSpeichern(true);
    try {
      const res = await fetch('/api/kunden-kontakte', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, ...form }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setForm({ name: '', bezeichnung: '', email: '', phone: '' });
      setNeuOffen(false);
      lade();
    } catch (e: any) { alert('❌ ' + e.message); }
    setSpeichern(false);
  }

  async function loeschen(id: string) {
    if (!confirm('Ansprechpartner wirklich entfernen?')) return;
    try {
      const res = await fetch(`/api/kunden-kontakte?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      lade();
    } catch (e: any) { alert('❌ ' + e.message); }
  }

  return (
    <div className="bg-white rounded-xl border border-black/10 p-5 space-y-3">
      <h3 className="text-sm font-semibold text-[#1d1d1f] flex items-center gap-1.5"><User className="h-4 w-4 text-[#e8590c]" /> Weitere Ansprechpartner</h3>
      {loading ? <p className="text-xs text-[#86868b]">Lade…</p> : kontakte.length === 0 ? (
        <p className="text-xs text-[#86868b]">Noch keine weiteren Ansprechpartner (z. B. Buchhaltung, Bauleiter beim Kunden).</p>
      ) : (
        <ul className="divide-y divide-black/5">
          {kontakte.map(k => (
            <li key={k.id} className="py-2 flex items-center gap-2 text-sm">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-[#1d1d1f]">{k.name}</span>
                {k.bezeichnung && <span className="text-[#86868b]"> · {k.bezeichnung}</span>}
                <div className="text-xs text-[#86868b]">{[k.email, k.phone].filter(Boolean).join(' · ')}</div>
              </div>
              <button onClick={() => loeschen(k.id)} className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/30 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}

      {!neuOffen ? (
        <button onClick={() => setNeuOffen(true)} className="flex items-center gap-1 text-xs text-[#e8590c] font-semibold hover:underline">
          <Plus className="h-3.5 w-3.5" /> Ansprechpartner hinzufügen
        </button>
      ) : (
        <div className="bg-[#f5f5f7] rounded-xl p-3 space-y-2">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Name *" className={inputCls} />
          <input value={form.bezeichnung} onChange={e => setForm({ ...form, bezeichnung: e.target.value })} placeholder="Bezeichnung, z.B. Buchhaltung" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="E-Mail" className={inputCls} />
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Telefon" className={inputCls} />
          </div>
          <div className="flex gap-2">
            <button onClick={hinzufuegen} disabled={speichern} className="px-3 py-1.5 rounded-lg bg-[#e8590c] hover:bg-[#d9480f] disabled:opacity-50 text-white text-xs font-semibold">{speichern ? 'Speichert…' : 'Hinzufügen'}</button>
            <button onClick={() => setNeuOffen(false)} className="px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-xs">Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}
