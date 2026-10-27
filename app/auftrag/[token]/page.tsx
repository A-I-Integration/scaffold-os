'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

// ============================================================
// SCAFFOLD OS – Auftragsstand für den Auftraggeber (ohne Login)
// Immer der aktuelle Stand: Auftragswert, Teilrechnungen, Schlussrechnung, Nachträge.
// Jede Rechnung lässt sich aufklappen (Positionen) und als PDF öffnen. Nur lesen.
// ============================================================

interface Pos { bezeichnung?: string; menge?: number | string; einheit?: string; einzelpreis?: number | string }
interface Rech { id: string; nummer: string; art: string; status: string; datum: string; faellig: string | null; leistungsdatum: string | null; geruestNr: string | null; netto: number; steuersatz: number; steuer: number; brutto: number; bezahlt: number; positionen: Pos[]; bemerkung: string | null }
interface Nacht { nummer: string; datum: string; titel: string; notiz: string; betrag: number; status: string; art: string | null }
interface Daten {
  projekt: { name: string; adresse: string | null }
  firma: { name: string | null; telefon: string | null; email: string | null } | null
  stand: { auftragswert: number; angebotNetto: number; nachtraegeBestaetigt: number; nachtraegeOffen: number; abgerechnet: number; restZuAbrechnen: number; prozentAbgerechnet: number | null; bezahlt: number; offenBrutto: number; ueberfaellig: number }
  rechnungen: Rech[]
  nachtraege: Nacht[]
}

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const datum = (d?: string | null) => { if (!d) return '–'; const x = new Date(String(d).slice(0, 10) + 'T12:00:00'); return Number.isNaN(x.getTime()) ? '–' : x.toLocaleDateString('de-DE'); };
const ART: Record<string, string> = { standard: 'Rechnung', abschlag: 'Teilrechnung', schluss: 'Schlussrechnung', gutschrift: 'Gutschrift' };
const STATUS: Record<string, string> = { offen: 'Offen', bezahlt: 'Bezahlt', ueberfaellig: 'Überfällig', storniert: 'Storniert' };
const NSTATUS: Record<string, string> = { offen: 'Zur Bestätigung offen', bestaetigt: 'Bestätigt', abgelehnt: 'Abgelehnt' };
const zahl = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 };

export default function AuftragPage() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [offen, setOffen] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/auftrag?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => { if (!j.success) setFehler(j.error || 'Nicht gefunden.'); else setD(j); })
      .catch(() => setFehler('Der Auftragsstand konnte nicht geladen werden.'))
      .finally(() => setLaedt(false));
  }, [token]);

  if (laedt) return <div className="min-h-screen flex items-center justify-center bg-white"><p className="text-lg text-black">Lade Auftragsstand…</p></div>;
  if (!d) return <div className="min-h-screen flex items-center justify-center bg-white px-4"><p className="text-lg text-black text-center">{fehler}</p></div>;

  const s = d.stand;
  const kachel = (titel: string, wert: string, hinweis?: string, rot = false) => (
    <div className="rounded border border-black/30 p-3">
      <div className="text-sm text-black/70">{titel}</div>
      <div className={`text-xl font-bold tabular-nums ${rot ? 'text-red-700' : ''}`}>{wert}</div>
      {hinweis && <div className="text-sm text-black/70">{hinweis}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="px-4 py-5 border-b border-black/20" style={{ background: '#2d63a3', color: '#fff' }}>
        <p className="text-sm opacity-90">Auftragsstand · Stand {new Date().toLocaleDateString('de-DE')}</p>
        <h1 className="text-2xl font-bold">{d.projekt.name}</h1>
        {d.projekt.adresse && <p className="text-base mt-1">{d.projekt.adresse}</p>}
      </header>
      <main className="max-w-3xl mx-auto px-4 py-5 space-y-6">
        <section className="grid gap-2 sm:grid-cols-2">
          {kachel('Auftragswert (netto)', eur(s.auftragswert), s.nachtraegeBestaetigt > 0 ? `inkl. bestätigter Nachträge ${eur(s.nachtraegeBestaetigt)}` : undefined)}
          {kachel('Bisher abgerechnet (netto)', eur(s.abgerechnet), s.prozentAbgerechnet === null ? undefined : `${s.prozentAbgerechnet.toLocaleString('de-DE')} % des Auftragswerts`)}
          {kachel('Noch abzurechnen (netto)', eur(s.restZuAbrechnen), s.nachtraegeOffen > 0 ? `Zusätzlich zur Bestätigung offen: ${eur(s.nachtraegeOffen)}` : undefined)}
          {kachel('Offen zu zahlen (brutto)', eur(s.offenBrutto), `Bereits bezahlt ${eur(s.bezahlt)}`, s.ueberfaellig > 0)}
        </section>

        <section>
          <h2 className="text-lg font-bold mb-2">Rechnungen</h2>
          {d.rechnungen.length === 0 && <p className="text-base">Bisher wurde keine Rechnung gestellt.</p>}
          <ul className="space-y-2">
            {d.rechnungen.map((r) => {
              const auf = offen === r.id;
              const rest = r.status === 'storniert' ? 0 : Math.round((r.brutto - r.bezahlt) * 100) / 100;
              return (
                <li key={r.id} className="rounded border border-black/30">
                  <button onClick={() => setOffen(auf ? null : r.id)} aria-expanded={auf} className={`w-full text-left px-4 py-3 hover:bg-[#eef4fa] ${r.status === 'storniert' ? 'line-through text-black/50' : ''}`}>
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-lg font-semibold">{ART[r.art] || 'Rechnung'} {r.nummer}</span>
                      <span className="tabular-nums font-semibold">{eur(r.brutto)}</span>
                    </span>
                    <span className="block text-sm text-black/70">{datum(r.datum)} · {STATUS[r.status] || r.status}{rest > 0 ? ` · offen ${eur(rest)}` : ''}</span>
                  </button>
                  {auf && (
                    <div className="px-4 pb-4 space-y-3 border-t border-black/20 pt-3">
                      {r.leistungsdatum && <p className="text-sm">Leistungsdatum: {datum(r.leistungsdatum)}{r.geruestNr ? ` · Gerüst ${r.geruestNr}` : ''}</p>}
                      <table className="w-full text-sm border-collapse">
                        <thead><tr className="text-left bg-[#f0f0f0]"><th className="px-2 py-1 border border-black/20">Position</th><th className="px-2 py-1 border border-black/20 text-right">Menge</th><th className="px-2 py-1 border border-black/20 text-right">Einzelpreis</th><th className="px-2 py-1 border border-black/20 text-right">Netto</th></tr></thead>
                        <tbody>
                          {r.positionen.map((p, i) => (
                            <tr key={i}>
                              <td className="px-2 py-1 border border-black/20">{p.bezeichnung}</td>
                              <td className="px-2 py-1 border border-black/20 text-right tabular-nums">{zahl(p.menge).toLocaleString('de-DE')} {p.einheit}</td>
                              <td className="px-2 py-1 border border-black/20 text-right tabular-nums">{eur(zahl(p.einzelpreis))}</td>
                              <td className="px-2 py-1 border border-black/20 text-right tabular-nums">{eur(zahl(p.menge) * zahl(p.einzelpreis))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-sm text-right tabular-nums">Netto {eur(r.netto)} · USt {r.steuersatz.toLocaleString('de-DE')} % {eur(r.steuer)} · <b>Brutto {eur(r.brutto)}</b></p>
                      {r.faellig && <p className="text-sm">Fällig am {datum(r.faellig)}</p>}
                      {r.bemerkung && <p className="text-sm whitespace-pre-line">{r.bemerkung}</p>}
                      <a href={`/api/public/auftrag/rechnung?token=${encodeURIComponent(token)}&id=${r.id}`} target="_blank" rel="noreferrer" className="inline-block rounded border border-black/30 px-4 py-2 bg-[#f0f0f0] font-semibold hover:bg-[#e4e4e4]">Rechnung als PDF öffnen</a>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-black/70 mt-2">Die Schlussrechnung weist nur den Rest nach Abzug der Teilrechnungen aus. Die Summe aller Rechnungen ergibt daher den Gesamtbetrag.</p>
        </section>

        {d.nachtraege.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-2">Nachträge und Verlängerungen</h2>
            <ul className="space-y-2">
              {d.nachtraege.map((n) => (
                <li key={n.nummer} className="rounded border border-black/30 px-4 py-3">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{n.nummer} · {n.titel}</span>
                    <span className="tabular-nums font-semibold">{eur(n.betrag)} netto</span>
                  </span>
                  <span className="block text-sm text-black/70">{datum(n.datum)} · {NSTATUS[n.status] || n.status}</span>
                  {n.notiz && <span className="block text-sm mt-1">{n.notiz}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {d.firma && (d.firma.name || d.firma.telefon || d.firma.email) && (
          <footer className="border-t border-black/20 pt-4 text-base">
            <p className="font-semibold">{d.firma.name}</p>
            {d.firma.telefon && <p>Tel. {d.firma.telefon}</p>}
            {d.firma.email && <p>{d.firma.email}</p>}
          </footer>
        )}
      </main>
    </div>
  );
}
