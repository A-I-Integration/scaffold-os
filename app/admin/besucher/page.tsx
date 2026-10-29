'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Eye } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Besucher pro Tag (nur Master-Instanz)
//
// Zeigt die Aufrufe und Besucher der Marketing-Website pro Tag,
// dazu Top-Seiten, Herkünfte und Geräte.
// Daten: /api/admin/besucher (Zähler: /api/track/besuch).
// „Besucher" = verschiedene Personen pro Tag; über mehrere Tage
// wird die Tagessumme gezeigt, weil die anonyme Kennung täglich
// wechselt (daher keine Wiedererkennung über Tage).
// ============================================================

interface Tag { tag: string; aufrufe: number; besucher: number }
interface Zeile { aufrufe: number; pfad?: string; quelle?: string; geraet?: string }

const ZEITRAEUME = [7, 30, 90];

function datumKurz(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
}

function wochentag(iso: string) {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(iso + 'T12:00:00Z'));
}

export default function BesucherPage() {
  const [tage, setTage] = useState<Tag[]>([]);
  const [seiten, setSeiten] = useState<Zeile[]>([]);
  const [quellen, setQuellen] = useState<Zeile[]>([]);
  const [geraete, setGeraete] = useState<Zeile[]>([]);
  const [zeitraum, setZeitraum] = useState(30);
  const [version, setVersion] = useState(0);
  const [geladen, setGeladen] = useState('');
  const [error, setError] = useState('');
  const schluessel = `${zeitraum}:${version}`;
  const loading = geladen !== schluessel;

  useEffect(() => {
    let aktiv = true;
    fetch(`/api/admin/besucher?tage=${zeitraum}&t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (!aktiv) return;
        if (!json.success) {
          setError(json.error || 'Fehler');
        } else {
          setError('');
          setTage(json.tage || []);
          setSeiten(json.seiten || []);
          setQuellen(json.quellen || []);
          setGeraete(json.geraete || []);
        }
        setGeladen(`${zeitraum}:${version}`);
      })
      .catch(() => {
        if (!aktiv) return;
        setError('Statistik konnte nicht geladen werden.');
        setGeladen(`${zeitraum}:${version}`);
      });
    return () => { aktiv = false; };
  }, [zeitraum, version]);

  const heute = tage.length ? tage[tage.length - 1] : null;
  const gestern = tage.length > 1 ? tage[tage.length - 2] : null;
  const summeAufrufe = tage.reduce((s, t) => s + t.aufrufe, 0);
  const summeBesucher = tage.reduce((s, t) => s + t.besucher, 0);
  const maxAufrufe = Math.max(1, ...tage.map((t) => t.aufrufe));
  const umgekehrt = [...tage].reverse();

  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <Eye className="w-7 h-7 text-[#e8590c]" /> Besucher pro Tag
            </h1>
            <p className="text-[#86868b] text-sm mt-1">
              Aufrufe der Website – ohne Cookies, ohne gespeicherte IP-Adresse.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex bg-white border border-black/10 rounded-full p-1">
              {ZEITRAEUME.map((z) => (
                <button key={z} onClick={() => setZeitraum(z)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${zeitraum === z ? 'bg-[#e8590c] text-white' : 'text-[#86868b] hover:text-[#1d1d1f]'}`}>
                  {z} Tage
                </button>
              ))}
            </div>
            <button onClick={() => setVersion((v) => v + 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-black/10 hover:border-[#e8590c] rounded-full text-sm transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Aktualisieren
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 text-red-700">{error}</div>
        )}

        {!error && !loading && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <KPI label="Aufrufe heute" value={heute?.aufrufe ?? 0} accent />
              <KPI label="Besucher heute" value={heute?.besucher ?? 0} accent />
              <KPI label="Aufrufe gestern" value={gestern?.aufrufe ?? 0} />
              <KPI label={`Aufrufe (${zeitraum} Tage)`} value={summeAufrufe.toLocaleString('de-DE')} />
            </div>

            <h2 className="text-lg font-semibold mb-3">Verlauf</h2>
            <div className="bg-white border border-black/5 shadow-sm rounded-2xl p-4 mb-8 overflow-x-auto">
              <div className="flex items-end gap-[3px] h-40 min-w-[320px]" role="img"
                aria-label={`Aufrufe pro Tag der letzten ${zeitraum} Tage`}>
                {tage.map((t) => (
                  <div key={t.tag} className="flex-1 flex flex-col justify-end h-full group relative"
                    title={`${wochentag(t.tag)} ${datumKurz(t.tag)}: ${t.aufrufe} Aufrufe, ${t.besucher} Besucher`}>
                    <div className="bg-[#e8590c]/80 group-hover:bg-[#e8590c] rounded-t-sm"
                      style={{ height: `${(t.aufrufe / maxAufrufe) * 100}%`, minHeight: t.aufrufe ? 2 : 0 }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-[#86868b] mt-2">
                <span>{tage[0] ? datumKurz(tage[0].tag) : ''}</span>
                <span>{heute ? datumKurz(heute.tag) : ''}</span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h2 className="text-lg font-semibold mb-3">Tage</h2>
                <div className="bg-white border border-black/5 shadow-sm rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#f5f5f7] text-[#86868b] text-xs uppercase">
                      <tr><th className="px-4 py-3">Tag</th><th className="px-4 py-3 text-right">Aufrufe</th><th className="px-4 py-3 text-right">Besucher</th></tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {umgekehrt.map((t) => (
                        <tr key={t.tag} className={t.aufrufe === 0 ? 'text-[#86868b]' : ''}>
                          <td className="px-4 py-2">{wochentag(t.tag)} {datumKurz(t.tag)}</td>
                          <td className="px-4 py-2 text-right font-medium">{t.aufrufe}</td>
                          <td className="px-4 py-2 text-right">{t.besucher}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#f5f5f7] text-sm font-semibold">
                      <tr><td className="px-4 py-2">Summe</td><td className="px-4 py-2 text-right">{summeAufrufe}</td><td className="px-4 py-2 text-right">{summeBesucher}</td></tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="space-y-6">
                <Liste titel="Beliebteste Seiten" zeilen={seiten.map((s) => ({ name: s.pfad || '', n: s.aufrufe }))} />
                <Liste titel="Woher kommen die Besucher?" zeilen={quellen.map((s) => ({ name: s.quelle || '', n: s.aufrufe }))} />
                <Liste titel="Geräte" zeilen={geraete.map((s) => ({ name: s.geraet || '', n: s.aufrufe }))} />
              </div>
            </div>

            <p className="text-xs text-[#86868b] mt-6">
              „Besucher“ sind verschiedene Personen pro Tag. Die Spalte „Summe“ zählt sie je Tag, dieselbe
              Person an zwei Tagen also zweimal. Eigene Besuche ausschließen: einmal die Startseite mit
              ?zaehler=aus öffnen (wieder einschalten mit ?zaehler=an). Bekannte Suchmaschinen- und
              Prüf-Programme werden nicht mitgezählt.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Liste({ titel, zeilen }: { titel: string; zeilen: { name: string; n: number }[] }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">{titel}</h2>
      <div className="bg-white border border-black/5 shadow-sm rounded-2xl divide-y divide-black/5">
        {zeilen.map((z) => (
          <div key={z.name} className="flex justify-between gap-3 px-4 py-2 text-sm">
            <span className="truncate">{z.name}</span>
            <span className="font-medium">{z.n}</span>
          </div>
        ))}
        {zeilen.length === 0 && <div className="px-4 py-6 text-center text-sm text-[#86868b]">Noch keine Daten.</div>}
      </div>
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-white border border-black/5 shadow-sm rounded-2xl p-5">
      <p className="text-[#86868b] text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-[#e8590c]' : 'text-[#1d1d1f]'}`}>{value}</p>
    </div>
  );
}
