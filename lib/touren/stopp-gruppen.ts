import { leseAbholNotiz } from '@/lib/touren/abholung';

// ============================================================
// SCAFFOLD OS – Stopps zu Karten zusammenfassen ("Meine Touren")
//
// Die automatische Tour legt je Materialzeile einen eigenen Stopp an, alle mit
// derselben Adresse. Für den Fahrer ist das EINE Anlieferung. Hier werden
// aufeinanderfolgende Stopps mit gleicher Adresse und gleichem Projekt zu einer
// Karte zusammengefasst (Reihenfolge der Tour bleibt erhalten, nicht
// aufeinanderfolgende gleiche Adressen werden bewusst NICHT zusammengelegt).
// ============================================================

export interface StoppLike {
  id: string;
  stop_order: number;
  address: string;
  status: string;
  project_id?: string | null;
  notes?: string | null;
  transport_order?: { quantity: number; inventory?: { name: string } | null } | null;
}

export interface MaterialZeile {
  name: string;
  quantity: number;
}

export interface StoppGruppe<S extends StoppLike = StoppLike> {
  /** Eindeutiger Schlüssel der Karte (für Meldungen/Ladezustand): ID des ersten Stopps. */
  schluessel: string;
  address: string;
  project_id: string | null;
  /** Abholfahrt (Abbau beim Kunden) statt Anlieferung. */
  istAbholung: boolean;
  stops: S[];
  /** Stopps, die noch weder erledigt noch übersprungen sind. */
  offeneStops: S[];
  /** 'offen' solange mindestens ein Stopp offen ist; sonst 'completed' oder 'skipped'. */
  status: 'offen' | 'completed' | 'skipped';
  /** Materialzeilen der Karte, gleiche Artikel zusammengezählt, Reihenfolge wie in der Tour. */
  material: MaterialZeile[];
}

const normalisiere = (a: string) => String(a || '').trim().replace(/\s+/g, ' ').toLowerCase();
const istOffen = (s: StoppLike) => s.status !== 'completed' && s.status !== 'skipped';

export function gruppiereStopps<S extends StoppLike>(stops: S[]): StoppGruppe<S>[] {
  const sortiert = [...stops].sort((a, b) => a.stop_order - b.stop_order);
  const gruppen: StoppGruppe<S>[] = [];

  for (const s of sortiert) {
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && normalisiere(letzte.address) === normalisiere(s.address) && (letzte.project_id ?? null) === (s.project_id ?? null) && letzte.istAbholung === leseAbholNotiz(s.notes).istAbholung) {
      letzte.stops.push(s);
    } else {
      gruppen.push({
        schluessel: s.id, address: s.address, project_id: s.project_id ?? null,
        istAbholung: leseAbholNotiz(s.notes).istAbholung,
        stops: [s], offeneStops: [], status: 'offen', material: [],
      });
    }
  }

  for (const g of gruppen) {
    g.offeneStops = g.stops.filter(istOffen);
    g.status = g.offeneStops.length > 0 ? 'offen' : g.stops.every((s) => s.status === 'completed') ? 'completed' : 'skipped';
    const summen = new Map<string, number>();
    for (const s of g.stops) {
      for (const z of leseAbholNotiz(s.notes).material) summen.set(z.name, (summen.get(z.name) ?? 0) + z.quantity);
      const name = s.transport_order?.inventory?.name;
      if (!name) continue;
      summen.set(name, (summen.get(name) ?? 0) + (Number(s.transport_order?.quantity) || 0));
    }
    g.material = [...summen.entries()].map(([name, quantity]) => ({ name, quantity }));
  }
  return gruppen;
}

/** Uhrzeit ohne Sekunden: "07:00:00" → "07:00" (andere Werte bleiben unverändert). */
export function uhrzeitKurz(zeit: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(zeit ?? '').trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : String(zeit ?? '');
}

/** Adressen für die Gesamtroute in Tour-Reihenfolge: aufeinanderfolgende gleiche Adressen nur einmal. */
export function routenAdressen(stops: StoppLike[]): string[] {
  const out: string[] = [];
  for (const s of [...stops].sort((a, b) => a.stop_order - b.stop_order)) {
    if (out.length === 0 || normalisiere(out[out.length - 1]) !== normalisiere(s.address)) out.push(s.address);
  }
  return out;
}
