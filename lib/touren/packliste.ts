import { leseAbholNotiz } from '@/lib/touren/abholung';

// ============================================================
// SCAFFOLD OS – Packliste einer Tour ("Meine Touren")
//
// Jeder Transportauftrag bringt Material ZU einer Baustelle. Ist beim Auftrag
// eine "Von"-Baustelle eingetragen (from_project_id), muss das Material dort
// erst ABGEHOLT werden; sonst kommt es aus dem Zentrallager (mitnehmen).
// ============================================================

export interface PackStopp {
  id?: string;
  address?: string;
  notes?: string | null;
  transport_order?: {
    quantity: number;
    from_project_id?: string | null;
    inventory?: { name: string } | null;
    from_project?: { id?: string; name?: string | null; adresse?: string | null } | null;
  } | null;
}

export interface PackZeile {
  /** Schlüssel für das Häkchen (localStorage). Lager-Zeilen behalten den reinen Namen (alte Häkchen bleiben gültig). */
  key: string;
  name: string;
  quantity: number;
}

export interface AbholOrt {
  projectId: string;
  name: string;
  adresse: string;
  zeilen: PackZeile[];
}

export interface KundenAbholung {
  stoppId: string;
  adresse: string;
  zeilen: PackZeile[];
}

export interface TourPackliste {
  /** Abbau: Material beim Kunden abholen (Abholfahrt). */
  beimKunden: KundenAbholung[];
  /** Aus dem Zentrallager mitnehmen. */
  ausLager: PackZeile[];
  /** Unterwegs auf anderen Baustellen abholen, je Baustelle. */
  abholen: AbholOrt[];
}

export function baueTourPackliste(stops: PackStopp[]): TourPackliste {
  const beimKunden: KundenAbholung[] = [];
  const lager = new Map<string, number>();
  const orte = new Map<string, AbholOrt>();
  const summen = new Map<string, number>();

  for (const s of stops) {
    const abhol = leseAbholNotiz(s.notes);
    if (abhol.istAbholung) {
      const id = s.id || s.address || 'abholung';
      beimKunden.push({ stoppId: id, adresse: s.address || '', zeilen: abhol.material.map((z) => ({ key: `kunde|${id}|${z.name}`, name: z.name, quantity: z.quantity })) });
      continue;
    }
    const t = s.transport_order;
    const name = t?.inventory?.name;
    if (!t || !name) continue;
    const menge = Number(t.quantity) || 0;
    const von = t.from_project_id || null;
    if (!von) {
      lager.set(name, (lager.get(name) ?? 0) + menge);
      continue;
    }
    if (!orte.has(von)) {
      orte.set(von, {
        projectId: von,
        name: t.from_project?.name || 'Andere Baustelle',
        adresse: t.from_project?.adresse || '',
        zeilen: [],
      });
    }
    const key = `abholen|${von}|${name}`;
    summen.set(key, (summen.get(key) ?? 0) + menge);
    const ort = orte.get(von)!;
    if (!ort.zeilen.some((z) => z.key === key)) ort.zeilen.push({ key, name, quantity: 0 });
  }
  for (const ort of orte.values()) for (const z of ort.zeilen) z.quantity = summen.get(z.key) ?? 0;

  return {
    beimKunden,
    ausLager: [...lager.entries()].map(([name, quantity]) => ({ key: name, name, quantity })),
    abholen: [...orte.values()],
  };
}

export function alleKeys(p: TourPackliste): string[] {
  return [...p.beimKunden.flatMap((k) => k.zeilen.map((z) => z.key)), ...p.ausLager.map((z) => z.key), ...p.abholen.flatMap((o) => o.zeilen.map((z) => z.key))];
}
