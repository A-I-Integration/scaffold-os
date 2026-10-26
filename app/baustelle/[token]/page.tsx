'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

// ============================================================
// SCAFFOLD OS – Baustellenunterlagen (QR-Code am Gerüst, ohne Login)
// Für Auftraggeber, Auftragnehmer und Prüfer: aktuelle Unterlagen der
// Baustelle ansehen oder herunterladen. Große Schrift, handytauglich.
// ============================================================

interface Dok { id: string; name: string; bezeichnung: string | null; kategorie: string; datum: string | null; typ: string | null }
const datum = (d?: string | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '');

export default function BaustellePage() {
  const { token } = useParams<{ token: string }>();
  const [daten, setDaten] = useState<{ projekt: { name: string; adresse: string | null }; firma: { name: string | null; telefon: string | null; email: string | null } | null; dokumente: Dok[] } | null>(null);
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(true);

  useEffect(() => {
    fetch(`/api/public/baustelle?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => { if (!j.success) setFehler(j.error || 'Unterlagen nicht gefunden.'); else setDaten(j); })
      .catch(() => setFehler('Die Unterlagen konnten nicht geladen werden.'))
      .finally(() => setLaedt(false));
  }, [token]);

  if (laedt) return <div className="min-h-screen flex items-center justify-center bg-white"><p className="text-lg text-black">Lade Unterlagen…</p></div>;
  if (!daten) return <div className="min-h-screen flex items-center justify-center bg-white px-4"><p className="text-lg text-black text-center">{fehler}</p></div>;

  const gruppen = daten.dokumente.reduce<Record<string, Dok[]>>((a, d) => { (a[d.kategorie] ||= []).push(d); return a; }, {});

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="px-4 py-5 border-b border-black/20" style={{ background: '#2d63a3', color: '#fff' }}>
        <p className="text-sm opacity-90">Baustellenunterlagen</p>
        <h1 className="text-2xl font-bold">{daten.projekt.name}</h1>
        {daten.projekt.adresse && <p className="text-base mt-1">{daten.projekt.adresse}</p>}
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-6">
        {daten.dokumente.length === 0 && <p className="text-lg">Für diese Baustelle sind noch keine Unterlagen freigegeben.</p>}
        {Object.entries(gruppen).map(([kat, liste]) => (
          <section key={kat}>
            <h2 className="text-lg font-bold mb-2">{kat}</h2>
            <ul className="space-y-2">
              {liste.map((d) => (
                <li key={d.id}>
                  <a href={`/api/public/baustelle/datei?token=${encodeURIComponent(token)}&id=${d.id}`} target="_blank" rel="noreferrer"
                    className="block rounded border border-black/30 px-4 py-3 hover:bg-[#eef4fa]">
                    <span className="block text-lg font-semibold">{d.bezeichnung || d.name}</span>
                    <span className="block text-sm text-black/70">{d.bezeichnung ? d.name + ' · ' : ''}Stand {datum(d.datum)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {daten.firma && (daten.firma.name || daten.firma.telefon) && (
          <footer className="border-t border-black/20 pt-4 text-base">
            <p className="font-semibold">Gerüstersteller / Ansprechpartner</p>
            {daten.firma.name && <p>{daten.firma.name}</p>}
            {daten.firma.telefon && <p><a href={`tel:${daten.firma.telefon}`} className="underline">{daten.firma.telefon}</a></p>}
            {daten.firma.email && <p><a href={`mailto:${daten.firma.email}`} className="underline">{daten.firma.email}</a></p>}
          </footer>
        )}
      </main>
    </div>
  );
}
