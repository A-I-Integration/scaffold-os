'use client';

import { useState, useEffect, useCallback } from 'react';
import { uploadEventPhotoClient, EventPhoto } from '@/lib/project-events-client';

// ============================================================
// SCAFFOLD OS – Projekt-Dokumentation (Phase 18)
//
// Deckt die Punkte 9–13 des Gerüstbau-Prozesses ab:
//   9.  Prüfung/Freigabe nach Aufbau
//   10. Nutzung/Standzeit – Änderungen
//   11. Gerüständerungen
//   12. Demontage
//   13. Rücktransport
//
// Für alle 5 Rollen nutzbar (admin, disponent, bauleiter,
// mitarbeiter, lager) – reine Text- und Foto-Dokumentation mit
// "Fertig"-Status, kein rollenspezifisches Verhalten nötig.
// ============================================================

interface EventEmployee { id: string; first_name: string; last_name: string; }
interface ProjectEvent {
  id: string;
  project_id: string;
  type: string;
  text_note: string | null;
  photos: EventPhoto[];
  status: 'offen' | 'erledigt';
  employee: EventEmployee | null;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  pruefung_freigabe: '✅ Prüfung / Freigabe',
  standzeit: '📅 Standzeit / Nutzung',
  geruest_aenderung: '🔧 Gerüständerung',
  demontage: '📦 Demontage',
  ruecktransport: '🚚 Rücktransport',
  sonstiges: '📝 Sonstiges',
};

interface Props {
  projectId: string;
  employeeId?: string | null; // vorausgewählter Mitarbeiter (z.B. aus "Meine Touren")
}

export default function ProjektDokumentation({ projectId, employeeId }: Props) {
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [type, setType] = useState('pruefung_freigabe');
  const [text, setText] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<EventPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/project-events?project_id=${projectId}&t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setEvents(json.events || []);
      else setError(json.error || 'Fehler beim Laden');
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) { alert(`${file.name} ist kein Bild.`); continue; }
      try {
        const uploaded = await uploadEventPhotoClient(file, projectId);
        setPendingPhotos(prev => [...prev, uploaded]);
      } catch (err: any) {
        alert(`Upload fehlgeschlagen: ${err.message}`);
      }
    }
    setUploading(false);
    e.target.value = '';
  }

  function removePendingPhoto(path: string) {
    setPendingPhotos(prev => prev.filter(p => p.path !== path));
  }

  async function submit() {
    setMsg(null);
    if (!text.trim() && pendingPhotos.length === 0) {
      setMsg({ ok: false, text: 'Bitte Text eingeben oder mindestens ein Foto hinzufügen.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/project-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          type,
          text_note: text.trim() || null,
          photos: pendingPhotos,
          employee_id: employeeId || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setText('');
      setPendingPhotos([]);
      setMsg({ ok: true, text: '✅ Eintrag gespeichert.' });
      load();
    } catch (e: any) {
      setMsg({ ok: false, text: '❌ ' + e.message });
    }
    setSaving(false);
  }

  async function markDone(id: string) {
    try {
      await fetch('/api/project-events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'erledigt' }),
      });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const inputCls = 'w-full rounded-lg bg-[#f5f5f7] border border-black/10 px-3 py-2 text-[#1d1d1f] placeholder-[#86868b] focus:border-[#e8590c] focus:outline-none';

  if (!projectId) return <div className="text-[#86868b] text-sm">Bitte zuerst ein Projekt wählen.</div>;

  return (
    <div className="space-y-6">
      {/* ─── Neuer Eintrag ─── */}
      <section className="bg-white border border-black/5 rounded-2xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">📋 Neuen Eintrag dokumentieren</h2>

        <div>
          <label className="block text-sm text-[#86868b] mb-1">Kategorie *</label>
          <select value={type} onChange={e => setType(e.target.value)} className={inputCls}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-[#86868b] mb-1">Text</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            className={inputCls}
            rows={3}
            placeholder="Was ist passiert? Was wurde geprüft, geändert, festgestellt..."
          />
        </div>

        <div>
          <label className="block text-sm text-[#86868b] mb-1">Fotos</label>
          <div className="relative">
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={handlePhotoSelect}
              disabled={uploading}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              disabled={uploading}
              className="w-full rounded-xl border-2 border-dashed border-black/10 bg-black/5 py-4 text-center hover:border-[#e8590c] disabled:opacity-50"
            >
              {uploading ? '⏳ Wird hochgeladen…' : '📷 Foto hinzufügen'}
            </button>
          </div>

          {pendingPhotos.length > 0 && (
            <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {pendingPhotos.map(p => (
                <div key={p.path} className="relative group">
                  <img src={p.url} alt={p.file_name} className="w-full h-20 object-cover rounded-lg border border-black/10" />
                  <button
                    type="button"
                    onClick={() => removePendingPhoto(p.path)}
                    className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-5 h-5 text-xs leading-none"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={submit}
          disabled={saving || uploading}
          className="rounded-xl bg-[#e8590c] hover:bg-[#d9480f] text-white disabled:opacity-50 px-5 py-2.5 font-semibold transition"
        >
          {saving ? '⏳ Speichert…' : '💾 Eintrag speichern'}
        </button>

        {msg && (
          <div className={`rounded-xl p-4 whitespace-pre-line ${msg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {msg.text}
          </div>
        )}
      </section>

      {/* ─── Verlauf ─── */}
      <section className="bg-white border border-black/5 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">📜 Verlauf ({events.length})</h2>
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 mb-4">{error}</div>}
        {loading ? (
          <p className="text-[#86868b]">Lade…</p>
        ) : events.length === 0 ? (
          <p className="text-[#86868b] text-sm">Noch keine Einträge für dieses Projekt.</p>
        ) : (
          <ul className="space-y-3">
            {events.map(ev => (
              <li key={ev.id} className="border border-black/10 rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{TYPE_LABELS[ev.type] || ev.type}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${ev.status === 'erledigt' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {ev.status === 'erledigt' ? 'Fertig' : 'Offen'}
                    </span>
                  </div>
                  <span className="text-xs text-[#86868b]">
                    {new Date(ev.created_at).toLocaleString('de-DE')}
                    {ev.employee ? ` · ${ev.employee.first_name} ${ev.employee.last_name}` : ''}
                  </span>
                </div>
                {ev.text_note && <p className="text-sm text-[#424245] mt-2 whitespace-pre-line">{ev.text_note}</p>}
                {ev.photos?.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {ev.photos.map(p => (
                      <a key={p.path} href={p.url} target="_blank" rel="noreferrer">
                        <img src={p.url} alt={p.file_name} className="w-full h-20 object-cover rounded-lg border border-black/10" />
                      </a>
                    ))}
                  </div>
                )}
                {ev.status === 'offen' && (
                  <button
                    onClick={() => markDone(ev.id)}
                    className="mt-3 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 font-medium transition"
                  >
                    ✓ Als fertig markieren
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
