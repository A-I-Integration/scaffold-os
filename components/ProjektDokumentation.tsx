'use client';

import { useState, useEffect, useCallback } from 'react';
import { uploadEventPhotoClient, EventPhoto } from '@/lib/project-events-client';
import { generatePruefprotokollPDF, type PruefungDetails } from '@/lib/pruefprotokoll-pdf';

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
  pruefung_details?: PruefungDetails | null;
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

interface InventoryItem { id: string; name: string; unit: string; quantity: number }
interface MaterialRow { inventory_id: string; zurueck: string; fehlt_beschaedigt: string; grund: string }
const LEERE_ZEILE: MaterialRow = { inventory_id: '', zurueck: '', fehlt_beschaedigt: '', grund: '' };

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

  // Prüfprotokoll-Angaben (Phase 24) – nur relevant bei type = pruefung_freigabe
  const [pruefung, setPruefung] = useState<PruefungDetails>({
    geruestklasse: '', maengel_festgestellt: false, maengel_text: '', maengel_behoben: false,
    kennzeichnung_angebracht: false, freigegeben: false, freigegeben_durch: '', nutzungsende_geplant: '',
  });

  // Material-Rückgabe (Phase 23) – schließt die Lücke zwischen
  // Demontage/Rücktransport-Dokumentation und dem Lagerbestand.
  const [materialOffenId, setMaterialOffenId] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([{ ...LEERE_ZEILE }]);
  const [materialSaving, setMaterialSaving] = useState(false);
  const [materialMsg, setMaterialMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    const istPruefung = type === 'pruefung_freigabe';
    if (!text.trim() && pendingPhotos.length === 0 && !istPruefung) {
      setMsg({ ok: false, text: 'Bitte Text eingeben oder mindestens ein Foto hinzufügen.' });
      return;
    }
    if (istPruefung && !pruefung.freigegeben_durch?.trim()) {
      setMsg({ ok: false, text: 'Bitte "Freigegeben durch (Name)" ausfüllen.' });
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
          pruefung_details: istPruefung ? pruefung : undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setText('');
      setPendingPhotos([]);
      setPruefung({ geruestklasse: '', maengel_festgestellt: false, maengel_text: '', maengel_behoben: false, kennzeichnung_angebracht: false, freigegeben: false, freigegeben_durch: '', nutzungsende_geplant: '' });
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

  async function openMaterialForm(eventId: string) {
    setMaterialMsg(null);
    setMaterialRows([{ ...LEERE_ZEILE }]);
    setMaterialOffenId(materialOffenId === eventId ? null : eventId);
    if (inventoryItems.length === 0) {
      try {
        const res = await fetch('/api/inventory');
        const json = await res.json();
        if (json.success) setInventoryItems(json.items || []);
      } catch { /* Lager-Liste optional, Formular geht trotzdem */ }
    }
  }

  function updateMaterialRow(idx: number, patch: Partial<MaterialRow>) {
    setMaterialRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function submitMaterial(eventId: string) {
    setMaterialMsg(null);
    const items = materialRows
      .filter(r => r.inventory_id && (Number(r.zurueck) > 0 || Number(r.fehlt_beschaedigt) > 0))
      .map(r => ({ inventory_id: r.inventory_id, zurueck: Number(r.zurueck) || 0, fehlt_beschaedigt: Number(r.fehlt_beschaedigt) || 0, grund: r.grund || undefined }));
    if (items.length === 0) {
      setMaterialMsg({ ok: false, text: 'Bitte mindestens eine Position mit Menge angeben.' });
      return;
    }
    setMaterialSaving(true);
    try {
      const res = await fetch('/api/inventory/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, event_id: eventId, items }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMaterialMsg({ ok: true, text: '✅ Material gebucht: ' + json.gebucht.map((g: any) => `${g.name} (${g.zurueck > 0 ? '+' + g.zurueck + ' zurück' : ''}${g.zurueck > 0 && g.verlust > 0 ? ', ' : ''}${g.verlust > 0 ? g.verlust + ' fehlt/beschädigt' : ''})`).join('; ') });
      setMaterialRows([{ ...LEERE_ZEILE }]);
    } catch (e: any) {
      setMaterialMsg({ ok: false, text: '❌ ' + e.message });
    }
    setMaterialSaving(false);
  }

  async function downloadPruefprotokoll(ev: ProjectEvent) {
    try {
      const [pRes, cRes] = await Promise.all([
        fetch(`/api/projects?id=${projectId}`).then(r => r.json()),
        fetch('/api/company').then(r => r.json()),
      ]);
      const projekt = pRes.success ? pRes.project : {};
      const company = cRes.success ? cRes.company : null;
      const doc = generatePruefprotokollPDF(ev.pruefung_details || {}, projekt, company, ev.created_at, ev.text_note);
      doc.save(`Pruefprotokoll_${(projekt?.name || 'Projekt').replace(/\s+/g, '_')}_${new Date(ev.created_at).toISOString().slice(0, 10)}.pdf`);
    } catch (e: any) {
      alert('❌ PDF konnte nicht erzeugt werden: ' + e.message);
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

        {/* ─── Prüfprotokoll-Angaben (Phase 24): nur bei Prüfung/Freigabe ─── */}
        {type === 'pruefung_freigabe' && (
          <div className="bg-[#f5f5f7] rounded-xl p-4 space-y-3 border border-black/5">
            <p className="text-xs font-semibold text-[#1d1d1f]">📋 Angaben für das Prüfprotokoll</p>
            <input value={pruefung.geruestklasse} onChange={e => setPruefung({ ...pruefung, geruestklasse: e.target.value })} placeholder="Gerüstklasse (z.B. Lastklasse 3, Breitenklasse W06)" className={inputCls} />

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!pruefung.maengel_festgestellt} onChange={e => setPruefung({ ...pruefung, maengel_festgestellt: e.target.checked })} />
              Mängel festgestellt
            </label>
            {pruefung.maengel_festgestellt && (
              <>
                <input value={pruefung.maengel_text} onChange={e => setPruefung({ ...pruefung, maengel_text: e.target.value })} placeholder="Welche Mängel?" className={inputCls} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!pruefung.maengel_behoben} onChange={e => setPruefung({ ...pruefung, maengel_behoben: e.target.checked })} />
                  Mängel behoben
                </label>
              </>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!pruefung.kennzeichnung_angebracht} onChange={e => setPruefung({ ...pruefung, kennzeichnung_angebracht: e.target.checked })} />
              Kennzeichnungsschild angebracht
            </label>

            <div>
              <label className="block text-xs text-[#86868b] mb-1">Geplantes Nutzungsende (optional)</label>
              <input type="date" value={pruefung.nutzungsende_geplant} onChange={e => setPruefung({ ...pruefung, nutzungsende_geplant: e.target.value })} className={inputCls} />
            </div>

            <div className="border-t border-black/10 pt-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={!!pruefung.freigegeben} onChange={e => setPruefung({ ...pruefung, freigegeben: e.target.checked })} />
                Gerüst freigegeben
              </label>
              <input value={pruefung.freigegeben_durch} onChange={e => setPruefung({ ...pruefung, freigegeben_durch: e.target.value })} placeholder="Freigegeben durch (Name) *" className={`${inputCls} mt-2`} />
            </div>
          </div>
        )}

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

                {ev.type === 'pruefung_freigabe' && ev.pruefung_details && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ev.pruefung_details.freigegeben ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {ev.pruefung_details.freigegeben ? '✓ Freigegeben' : '✗ Nicht freigegeben'}
                    </span>
                    {ev.pruefung_details.maengel_festgestellt && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Mängel{ev.pruefung_details.maengel_behoben ? ' (behoben)' : ''}</span>
                    )}
                    <button onClick={() => downloadPruefprotokoll(ev)} className="text-xs rounded-lg bg-[#e8590c] hover:bg-[#d9480f] text-white px-3 py-1 font-medium">
                      📄 Prüfprotokoll-PDF
                    </button>
                  </div>
                )}
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

                {/* Material-Rückgabe: nur bei Demontage/Rücktransport (Phase 23) */}
                {(ev.type === 'demontage' || ev.type === 'ruecktransport') && (
                  <div className="mt-3">
                    <button
                      onClick={() => openMaterialForm(ev.id)}
                      className="text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 font-medium transition"
                    >
                      📦 Material buchen (zurück / fehlt / beschädigt)
                    </button>

                    {materialOffenId === ev.id && (
                      <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                        <p className="text-xs text-[#86868b]">Zurückgegebenes Material erhöht den Lagerbestand automatisch. Fehlmengen/Schäden werden nur protokolliert (keine Bestandsänderung, da es beim Reservieren schon abgebucht wurde).</p>
                        {materialRows.map((row, idx) => (
                          <div key={idx} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
                            <select value={row.inventory_id} onChange={e => updateMaterialRow(idx, { inventory_id: e.target.value })} className={`${inputCls} sm:col-span-2`}>
                              <option value="">– Artikel wählen –</option>
                              {inventoryItems.map(it => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}
                            </select>
                            <input value={row.zurueck} onChange={e => updateMaterialRow(idx, { zurueck: e.target.value })} placeholder="Menge zurück" className={inputCls} />
                            <input value={row.fehlt_beschaedigt} onChange={e => updateMaterialRow(idx, { fehlt_beschaedigt: e.target.value })} placeholder="Fehlt/beschädigt" className={inputCls} />
                            <input value={row.grund} onChange={e => updateMaterialRow(idx, { grund: e.target.value })} placeholder="Grund (optional)" className={inputCls} />
                          </div>
                        ))}
                        <button onClick={() => setMaterialRows(prev => [...prev, { ...LEERE_ZEILE }])} className="text-xs text-blue-700 font-semibold hover:underline">+ weitere Position</button>
                        <div className="flex gap-2">
                          <button onClick={() => submitMaterial(ev.id)} disabled={materialSaving} className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 text-sm font-semibold">
                            {materialSaving ? 'Bucht…' : 'Buchen'}
                          </button>
                          <button onClick={() => setMaterialOffenId(null)} className="rounded-lg bg-black/5 hover:bg-black/10 px-4 py-2 text-sm">Abbrechen</button>
                        </div>
                        {materialMsg && (
                          <div className={`rounded-lg p-3 text-sm ${materialMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{materialMsg.text}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
