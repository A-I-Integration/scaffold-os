'use client';

import { useState, useCallback } from 'react';
import { uploadScanClient, getScanStatusClient } from '@/lib/media-client';

// Ab dieser Größe geht der Scan direkt zu Supabase Storage und wird vom
// Punktwolken-Worker (Docker) analysiert – umgeht das Vercel-Upload-Limit.
const WORKER_AB_BYTES = 4 * 1024 * 1024;
const ERLAUBTE_EXT = ['obj', 'ply', 'las', 'glb'];

interface Fassade {
  breiteM: number;
  hoeheM: number;
  punkte: number;
  genauigkeitCm: number;
}

interface Ebene extends Fassade {
  flaecheM2: number;
}

interface Abstand {
  von: number;
  bis: number;
  abstandM: number;
  typ: 'ebene_ebene' | 'hindernis';
}

interface Measurements {
  lengthM: number;
  widthM: number;
  heightM: number;
  vertexCount: number;
  fileType: string;
  robustVertexCount?: number;
  verticalAxis?: 'x' | 'y' | 'z';
  unitScale?: number;
  ebenen?: Ebene[];
  abstaende?: Abstand[];
  fassade?: Fassade | null;
  nebenfassade?: { breiteM: number; hoeheM: number; punkte: number } | null;
  kalibriert?: boolean;
  referenz?: string;
}

interface Props {
  sessionId: string;
  onMeasurements?: (m: Measurements) => void;
}

// Kalibrier-Achsen, die der Nutzer als Referenz einmessen kann
const REF_OPTIONS: { id: keyof Pick<Measurements, 'lengthM' | 'widthM' | 'heightM'> | 'fassadeBreite' | 'fassadeHoehe'; label: string }[] = [
  { id: 'fassadeBreite', label: 'Fassaden-Breite' },
  { id: 'fassadeHoehe', label: 'Fassaden-Höhe' },
  { id: 'lengthM', label: 'Gebäude-Länge' },
  { id: 'widthM', label: 'Gebäude-Breite' },
  { id: 'heightM', label: 'Gebäude-Höhe' },
];

export default function LiDARUpload({ sessionId, onMeasurements }: Props) {
  const [uploading, setUploading] = useState(false);
  const [scan, setScan] = useState<{ m: Measurements; name: string } | null>(null);
  // Kalibrierung
  const [refFeld, setRefFeld] = useState<string>('fassadeBreite');
  const [refWert, setRefWert] = useState('');

  // Phase-Anzeige für den Worker-Pfad (große Scans)
  const [phase, setPhase] = useState<string>('');

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ERLAUBTE_EXT.includes(ext)) {
      alert('Nur .ply (ASCII), .las, .obj oder .glb erlaubt.');
      e.target.value = '';
      return;
    }

    setUploading(true);

    try {
      if (file.size >= WORKER_AB_BYTES) {
        // ── Großer Scan: Direkt-Upload + Worker-Analyse ──
        setPhase(`Lade hoch (${(file.size / 1e6).toFixed(0)} MB, direkt zum Speicher)…`);
        const media = await uploadScanClient(file, sessionId, ext);

        // Pollen, bis der Worker fertig ist (max. 10 Minuten)
        const deadline = Date.now() + 10 * 60 * 1000;
        for (;;) {
          await new Promise((r) => setTimeout(r, 5000));
          const st = await getScanStatusClient(media.id);
          if (st.status === 'done' && st.measurements) {
            setScan({ m: st.measurements, name: file.name });
            onMeasurements?.(st.measurements);
            break;
          }
          if (st.status === 'error') throw new Error(st.fehler || 'Analyse fehlgeschlagen');
          if (Date.now() > deadline) throw new Error('Analyse dauert zu lange – bitte später erneut prüfen.');
          setPhase(st.status === 'processing' ? 'Analyse läuft auf dem Worker…' : 'In Warteschlange…');
        }
      } else {
        // ── Kleiner Scan: schneller Direktweg über die API ──
        setPhase('');
        const fd = new FormData();
        fd.append('file', file);
        fd.append('sessionId', sessionId);

        const res = await fetch('/api/lidar-upload', { method: 'POST', body: fd });
        const json = await res.json();

        if (!res.ok) throw new Error(json.error || 'Upload fehlgeschlagen');

        setScan({ m: json.measurements, name: json.fileName });
        onMeasurements?.(json.measurements);
      }
    } catch (err: any) {
      alert('Scan-Fehler: ' + err.message);
    } finally {
      setUploading(false);
      setPhase('');
      e.target.value = '';
    }
  }, [sessionId, onMeasurements]);

  // Referenzmaß anwenden: alle Werte werden um den Faktor skaliert
  const kalibrieren = useCallback(() => {
    if (!scan) return;
    const bekannt = parseFloat(refWert.replace(',', '.'));
    if (!bekannt || bekannt <= 0) { alert('Bitte ein gültiges Referenzmaß in Metern eingeben.'); return; }

    const gemessen =
      refFeld === 'fassadeBreite' ? scan.m.fassade?.breiteM :
      refFeld === 'fassadeHoehe' ? scan.m.fassade?.hoeheM :
      (scan.m as any)[refFeld] as number | undefined;

    if (!gemessen || gemessen <= 0) { alert('Dieses Maß wurde im Scan nicht erkannt – anderes Feld wählen.'); return; }

    const f = bekannt / gemessen;
    const k: Measurements = {
      ...scan.m,
      lengthM: scan.m.lengthM * f,
      widthM: scan.m.widthM * f,
      heightM: scan.m.heightM * f,
      ebenen: scan.m.ebenen?.map((e) => ({ ...e, breiteM: e.breiteM * f, hoeheM: e.hoeheM * f, flaecheM2: e.flaecheM2 * f * f, genauigkeitCm: e.genauigkeitCm * f })),
      abstaende: scan.m.abstaende?.map((a) => ({ ...a, abstandM: a.abstandM * f })),
      fassade: scan.m.fassade ? { ...scan.m.fassade, breiteM: scan.m.fassade.breiteM * f, hoeheM: scan.m.fassade.hoeheM * f, genauigkeitCm: scan.m.fassade.genauigkeitCm * f } : null,
      nebenfassade: scan.m.nebenfassade ? { ...scan.m.nebenfassade, breiteM: scan.m.nebenfassade.breiteM * f, hoeheM: scan.m.nebenfassade.hoeheM * f } : null,
      kalibriert: true,
      referenz: `${REF_OPTIONS.find((r) => r.id === refFeld)?.label} = ${bekannt} m`,
    };
    setScan({ m: k, name: scan.name });
    onMeasurements?.(k);
  }, [scan, refFeld, refWert, onMeasurements]);

  const feldVerfuegbar = (id: string) => {
    if (!scan) return false;
    if (id === 'fassadeBreite' || id === 'fassadeHoehe') return !!scan.m.fassade;
    return true;
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="file"
          accept=".obj,.ply,.las,.glb"
          onChange={handleFile}
          disabled={uploading}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <button
          disabled={uploading}
          className="w-full rounded-xl border border-dashed border-black/20 bg-black/5 py-4 text-sm text-[#424245] hover:border-purple-500 hover:bg-[#f5f5f7] disabled:opacity-50 transition"
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              {phase || 'Punktwolke wird analysiert (Ausreißer-Filter + Ebenen-Erkennung)…'}
            </span>
          ) : (
            <span>
              <span className="text-lg">📱</span> <span className="font-medium">Punktwolke / 3D-Modell hochladen</span>
              <br />
              <span className="text-[11px] text-[#86868b]">Polycam: .ply (ASCII) oder .las als Punktwolke, .glb / .obj als 3D-Modell · Großscans bis 500 MB</span>
            </span>
          )}
        </button>
      </div>

      {scan && (
        <div className="rounded-xl bg-purple-50 border border-purple-200 p-4 animate-in fade-in slide-in-from-top-2 space-y-4">
          <p className="text-xs text-purple-700 font-medium">
            ✅ Ausgewertet: <span className="text-[#1d1d1f]">{scan.name}</span>
            {scan.m.kalibriert && <span className="ml-2 rounded bg-emerald-500/15 border border-emerald-500/40 px-1.5 py-0.5 text-emerald-700">Kalibriert ({scan.m.referenz})</span>}
          </p>

          {/* ── Erkannte Ebenen (RANSAC) – das eigentliche Arbeitsergebnis ── */}
          {scan.m.ebenen && scan.m.ebenen.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#86868b] mb-1.5">
                Erkannte Ebenen ({scan.m.ebenen.length})
              </p>
              <div className="space-y-2">
                {scan.m.ebenen.map((eb, i) => (
                  <div key={i} className="rounded-lg bg-[#f5f5f7] p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-[#1d1d1f]">
                        {i === 0 ? '🏠 Hauptfassade' : `🧱 Ebene ${i + 1}`}
                      </p>
                      <p className="text-sm font-bold text-[#e8590c]">{eb.flaecheM2.toFixed(1)} m²</p>
                    </div>
                    <p className="text-[11px] text-[#424245] mt-0.5">
                      {eb.breiteM.toFixed(2)} m breit × {eb.hoeheM.toFixed(2)} m hoch
                      <span className="text-[#86868b]"> · {eb.punkte.toLocaleString()} Punkte · ±{eb.genauigkeitCm.toFixed(1)} cm</span>
                    </p>
                  </div>
                ))}
              </div>

              {/* ── Abstände ── */}
              {scan.m.abstaende && scan.m.abstaende.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#86868b] mb-1.5">Abstände</p>
                  <div className="space-y-1">
                    {scan.m.abstaende.map((a, i) => (
                      <p key={i} className="text-[11px] text-[#424245]">
                        {a.typ === 'hindernis' ? (
                          <>⚠️ Nächstes Hindernis vor Hauptfassade: <span className="font-semibold text-[#1d1d1f]">{a.abstandM.toFixed(2)} m</span> (z. B. Baum, Auto – Gerüst-Abstand beachten)</>
                        ) : (
                          <>↔️ Ebene {a.von} ↔ Ebene {a.bis}: <span className="font-semibold text-[#1d1d1f]">{a.abstandM.toFixed(2)} m</span> (z. B. gegenüberliegende Fassade)</>
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-amber-700">
              ⚠️ Keine klare Fassaden-Ebene erkannt (Scan zu unruhig oder Wand verdeckt) – Gebäude-Maße unten nutzen.
            </p>
          )}

          {/* ── Gebäude-Box (robust, ausreißer-gefiltert) ── */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#86868b] mb-1.5">Gebäude-Gesamtmaße (gefiltert)</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded bg-[#f5f5f7] p-2 text-center">
                <p className="text-[10px] text-[#86868b] uppercase">Länge</p>
                <p className="text-sm font-bold text-[#1d1d1f]">{scan.m.lengthM.toFixed(2)} m</p>
              </div>
              <div className="rounded bg-[#f5f5f7] p-2 text-center">
                <p className="text-[10px] text-[#86868b] uppercase">Breite</p>
                <p className="text-sm font-bold text-[#1d1d1f]">{scan.m.widthM.toFixed(2)} m</p>
              </div>
              <div className="rounded bg-[#f5f5f7] p-2 text-center">
                <p className="text-[10px] text-[#86868b] uppercase">Höhe</p>
                <p className="text-sm font-bold text-[#1d1d1f]">{scan.m.heightM.toFixed(2)} m</p>
              </div>
            </div>
          </div>

          {/* ── Referenz-Kalibrierung ── */}
          <div className="rounded-lg bg-white/60 border border-black/10 p-3">
            <p className="text-[11px] font-semibold text-[#1d1d1f] mb-2">🎯 Genauigkeit steigern: Referenzmaß einmessen</p>
            <p className="text-[10px] text-[#86868b] mb-2">
              Ein bekanntes Maß vor Ort messen (z. B. Türhöhe 2,10 m, Fensterbreite) und hier eintragen –
              alle Werte werden exakt skaliert.
            </p>
            <div className="flex gap-2">
              <select
                value={refFeld}
                onChange={(e) => setRefFeld(e.target.value)}
                className="flex-1 rounded-lg border border-black/10 bg-white px-2 py-2 text-xs text-[#1d1d1f]"
              >
                {REF_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id} disabled={!feldVerfuegbar(r.id)}>{r.label}</option>
                ))}
              </select>
              <input
                type="text"
                inputMode="decimal"
                value={refWert}
                onChange={(e) => setRefWert(e.target.value)}
                placeholder="z. B. 2,10"
                className="w-24 rounded-lg border border-black/10 bg-white px-2 py-2 text-xs text-[#1d1d1f] placeholder-[#86868b]"
              />
              <button
                onClick={kalibrieren}
                className="rounded-lg bg-[#e8590c] hover:bg-[#d9480f] px-3 py-2 text-xs font-semibold text-white transition"
              >
                Skalieren
              </button>
            </div>
          </div>

          <p className="text-[10px] text-[#86868b] text-center">
            {scan.m.vertexCount.toLocaleString()} Punkte gesamt · {(scan.m.robustVertexCount ?? scan.m.vertexCount).toLocaleString()} ausgewertet · {scan.m.fileType.toUpperCase()}
          </p>
        </div>
      )}
    </div>
  );
}
