'use client';

import { useEffect, useRef, useState } from 'react';
import { baueWareneingang, type ArtikelKurz, type ArtikelTreffer, type GelesenePosition } from '@/lib/ki-lager';

interface Ort { id: string; schluessel: string; name: string; typ: string }
interface Zeile { gelesen: GelesenePosition; treffer: ArtikelTreffer; inventory_id: string; menge: string; einbuchen: boolean }

// Foto vor dem Senden verkleinern (längste Seite 1800 px, JPEG): kleiner Upload, schnellere Auswertung
async function verkleinere(datei: File): Promise<string> {
  const url = URL.createObjectURL(datei);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fehl) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fehl(new Error('Das Bild konnte nicht gelesen werden.')); i.src = url; });
    const f = Math.min(1, 1800 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

const inputCls = 'w-full px-2 py-1.5 border rounded-lg text-sm';

export default function WareneingangFotoTab({ onGebucht }: { onGebucht?: () => void }) {
  const [artikel, setArtikel] = useState<(ArtikelKurz & { quantity?: number })[]>([]);
  const [orte, setOrte] = useState<Ort[]>([]);
  const [bild, setBild] = useState<string | null>(null);
  const [liest, setLiest] = useState(false);
  const [belegnummer, setBelegnummer] = useState<string | null>(null);
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null);
  const [lagerort, setLagerort] = useState('');
  const [bucht, setBucht] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const datei = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let weg = false;
    fetch('/api/inventory').then((r) => r.json()).then((d) => { if (!weg && d.success) setArtikel(d.items); }).catch(() => undefined);
    fetch('/api/lager/orte').then((r) => r.json()).then((d) => { if (!weg && d.success) setOrte(d.orte); }).catch(() => undefined);
    return () => { weg = true; };
  }, []);

  const neu = () => { setBild(null); setZeilen(null); setBelegnummer(null); setMeldung(null); setLagerort(''); if (datei.current) datei.current.value = ''; };

  const waehle = async (f: File | undefined) => {
    if (!f) return;
    setMeldung(null); setZeilen(null); setLiest(true);
    try {
      const b = await verkleinere(f);
      setBild(b);
      const r = await fetch('/api/ki-lager-lesen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bild: b }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Auswertung fehlgeschlagen.');
      setBelegnummer(j.belegnummer);
      setZeilen((j.positionen as { gelesen: GelesenePosition; treffer: ArtikelTreffer }[]).map((p) => ({
        gelesen: p.gelesen, treffer: p.treffer,
        inventory_id: p.treffer.sicherheit === 'sicher' && p.treffer.artikel ? p.treffer.artikel.id : '',
        menge: p.gelesen.menge ? String(p.gelesen.menge) : '',
        einbuchen: p.treffer.sicherheit === 'sicher' && !!p.gelesen.menge, // Vorschläge und fehlende Mengen nie vorausgewählt
      })));
      if (!j.positionen.length) setMeldung({ ok: false, text: 'Auf dem Foto konnte ich keine Positionen erkennen. Bitte ein schärferes, gerades Foto versuchen.' });
    } catch (e) { setMeldung({ ok: false, text: (e as Error).message }); }
    finally { setLiest(false); }
  };

  const aendere = (i: number, teil: Partial<Zeile>) => setZeilen((z) => (z ? z.map((x, k) => (k === i ? { ...x, ...teil } : x)) : z));

  const pruefung = zeilen ? baueWareneingang(zeilen.map((z) => ({ inventory_id: z.inventory_id || null, menge: z.menge.trim() === '' ? null : Number(z.menge), einbuchen: z.einbuchen })), lagerort || null) : null;

  const buchen = async () => {
    if (!pruefung || !pruefung.ok || bucht) return;
    setBucht(true); setMeldung(null);
    try {
      const r = await fetch('/api/lager/buchen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bewegungsart: 'WE', positionen: pruefung.positionen, bemerkung: `Wareneingang per Foto-Erfassung${belegnummer ? `, Beleg ${belegnummer}` : ''}` }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Buchung fehlgeschlagen.');
      setMeldung({ ok: true, text: `Wareneingang gebucht: ${pruefung.positionen.length} Position(en).` });
      setZeilen(null); setBild(null); setBelegnummer(null); setLagerort(''); if (datei.current) datei.current.value = '';
      onGebucht?.();
    } catch (e) { setMeldung({ ok: false, text: (e as Error).message }); }
    finally { setBucht(false); }
  };

  return (
    <div className="space-y-4" data-testid="wareneingang-foto">
      <div className="bg-white border rounded-2xl p-4 space-y-2">
        <h3 className="text-base font-semibold text-gray-900">Wareneingang per Foto</h3>
        <p className="text-sm text-gray-600">Fotografiere den Lieferschein. Die KI liest die Zeilen heraus und schlägt Artikel vor. Gebucht wird erst, wenn du unten bestätigst. Die KI bucht nie selbst.</p>
        <input ref={datei} type="file" accept="image/*" capture="environment" onChange={(e) => waehle(e.target.files?.[0])} disabled={liest || bucht} className="text-sm" data-testid="foto-datei" />
        <p className="text-[11px] text-gray-500">Das Foto geht zur Auswertung an die KI und wird nicht gespeichert. Bitte nur Lieferscheine ohne Personendaten fotografieren.</p>
      </div>

      {liest && <p className="text-sm text-gray-600">Liest den Beleg …</p>}
      {meldung && <p className={`rounded-lg border p-3 text-sm ${meldung.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{meldung.ok ? '✅ ' : '❌ '}{meldung.text}</p>}

      {zeilen && zeilen.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="bg-white border rounded-2xl p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-900">Gelesene Positionen{belegnummer ? ` · Beleg ${belegnummer}` : ''}. Bitte prüfen und bestätigen.</p>
            <div className="space-y-2">
              {zeilen.map((z, i) => (
                <div key={i} className={`rounded-xl border p-3 ${z.einbuchen ? 'border-green-300 bg-green-50/40' : 'border-gray-200'}`}>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={z.einbuchen} onChange={(e) => aendere(i, { einbuchen: e.target.checked })} />
                    <span><span className="text-xs text-gray-500">Auf dem Beleg gelesen:</span> <strong>{z.gelesen.bezeichnung}</strong>{z.gelesen.artikelnummer ? <span className="text-gray-500"> ({z.gelesen.artikelnummer})</span> : null}</span>
                  </label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_110px]">
                    <div>
                      <select className={`${inputCls} ${!z.inventory_id ? 'border-amber-400 bg-amber-50' : ''}`} value={z.inventory_id} onChange={(e) => aendere(i, { inventory_id: e.target.value })} aria-label="Artikel">
                        <option value="">{z.treffer.sicherheit === 'keiner' ? 'Kein passender Artikel, bitte wählen' : 'Bitte Artikel wählen'}</option>
                        {artikel.map((a) => <option key={a.id} value={a.id}>{a.name}{a.sku ? ` (${a.sku})` : ''}</option>)}
                      </select>
                      <p className="mt-0.5 text-[11px] text-gray-500">{z.treffer.sicherheit === 'sicher' ? 'Artikel eindeutig erkannt.' : z.treffer.sicherheit === 'vorschlag' && z.treffer.artikel ? `Vorschlag: ${z.treffer.artikel.name}. Bitte bestätigen oder ändern.` : 'Nicht erkannt.'}</p>
                      {z.treffer.sicherheit === 'vorschlag' && z.treffer.artikel && z.inventory_id !== z.treffer.artikel.id && <button type="button" className="text-[11px] text-blue-700 underline" onClick={() => aendere(i, { inventory_id: z.treffer.artikel!.id })}>Vorschlag übernehmen</button>}
                    </div>
                    <div>
                      <input className={`${inputCls} ${!z.menge ? 'border-amber-400 bg-amber-50' : ''}`} inputMode="numeric" value={z.menge} onChange={(e) => aendere(i, { menge: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Menge" aria-label="Menge" />
                      <p className="mt-0.5 text-[11px] text-gray-500">{z.gelesen.menge ? `gelesen: ${z.gelesen.menge}${z.gelesen.einheit ? ' ' + z.gelesen.einheit : ''}` : 'Menge nicht lesbar'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Einlagern in (Lagerort) *</label>
              <select className={inputCls} value={lagerort} onChange={(e) => setLagerort(e.target.value)} data-testid="foto-lagerort">
                <option value="">Bitte Lagerort wählen</option>
                {orte.map((o) => <option key={o.id} value={o.id}>{o.schluessel} · {o.name}</option>)}
              </select>
            </div>
            {pruefung && !pruefung.ok && <p className="text-xs text-amber-800">{pruefung.fehler}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={buchen} disabled={bucht || !pruefung || !pruefung.ok} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50" data-testid="foto-buchen">{bucht ? 'Bucht …' : 'Wareneingang buchen'}</button>
              <button type="button" onClick={neu} disabled={bucht} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Verwerfen</button>
            </div>
          </div>
          {bild && <div className="bg-white border rounded-2xl p-2 h-fit"><img src={bild} alt="Lieferschein" className="w-full rounded-lg" /></div>}
        </div>
      )}
    </div>
  );
}
