// ============================================================
// lib/calculations/geruest-systeme.ts
// SCAFFOLD OS – Gerüstsysteme / Hersteller-Datenbank
// ============================================================
// Voreingestellte Systeme der gängigen Hersteller mit ihren
// echten Systemmaßen (Rasterhöhe, Standard-Feldlängen,
// Rahmenbreiten). Der Kunde kann zusätzlich ein eigenes
// System frei eintragen ("custom").
//
// Hinweis zu Maßen: Modulsysteme arbeiten fast alle mit einem
// 2,00-m-Höhenraster; Rahmensysteme (SpeedyScaf, Super 65/100,
// Uni-Connect) ebenfalls 2,00 m. Feldlängen sind die
// jeweiligen Standard-Belagslängen.
// ============================================================

export type SystemBauart = 'modul' | 'rahmen' | 'custom';

export interface GeruestSystem {
  id: string;
  hersteller: string;          // z. B. "Layher"
  systemName: string;          // z. B. "Allround (Stahl)"
  bauart: SystemBauart;
  rasterHoeheM: number;        // Höhenraster (i. d. R. 2,00 m)
  feldlangenM: number[];       // verfügbare Standard-Feldlängen
  standardFeldlangeM: number;  // empfohlene Standard-Feldlänge
  rahmenBreitenM: number[];    // Gerüstbreiten (0,73 / 1,09 / 1,40)
  hinweis: string;             // Kurzinfo für die Auswahl
}

export const GERUEST_SYSTEME: GeruestSystem[] = [
  // ─── Modulsysteme ───
  {
    id: 'peri-up-flex',
    hersteller: 'PERI',
    systemName: 'UP Flex',
    bauart: 'modul',
    rasterHoeheM: 2.0,
    feldlangenM: [2.0, 2.5, 3.0],
    standardFeldlangeM: 2.5,
    rahmenBreitenM: [0.75],
    hinweis: 'Rosetten-Modulsystem, Regelausführung "Flex F75" nach Zulassung Z-8.22-863 geprüft',
  },
  {
    id: 'layher-allround',
    hersteller: 'Layher',
    systemName: 'Allround (Stahl)',
    bauart: 'modul',
    rasterHoeheM: 2.0,
    feldlangenM: [2.07, 2.57, 3.07],
    standardFeldlangeM: 2.57,
    rahmenBreitenM: [0.73, 1.09],
    hinweis: 'Marktführer-Modulsystem, keilbolzenloses Aufsteckprinzip',
  },
  {
    id: 'layher-allround-alu',
    hersteller: 'Layher',
    systemName: 'Allround Alu',
    bauart: 'modul',
    rasterHoeheM: 2.0,
    feldlangenM: [2.07, 2.57, 3.07],
    standardFeldlangeM: 2.57,
    rahmenBreitenM: [0.73, 1.09],
    hinweis: 'Leichter als Stahl, schneller Auf-/Abbau',
  },
  {
    id: 'mj-plus',
    hersteller: 'MJ Gerüst',
    systemName: 'MJ-Plus',
    bauart: 'modul',
    rasterHoeheM: 2.0,
    feldlangenM: [2.5, 3.0],
    standardFeldlangeM: 3.0,
    rahmenBreitenM: [0.73, 1.09],
    hinweis: 'Modulsystem mit 8 Anschlussmöglichkeiten pro Rosette',
  },
  {
    id: 'plettac-sl70',
    hersteller: 'Plettac',
    systemName: 'Modul / SL 70',
    bauart: 'modul',
    rasterHoeheM: 2.0,
    feldlangenM: [2.5, 3.0],
    standardFeldlangeM: 3.0,
    rahmenBreitenM: [0.7, 1.0],
    hinweis: 'Weit verbreitet, kompatibel zu ASS-Systemen',
  },
  {
    id: 'alfix-modul',
    hersteller: 'Alfix',
    systemName: 'Modul',
    bauart: 'modul',
    rasterHoeheM: 2.0,
    feldlangenM: [2.07, 2.57, 3.07],
    standardFeldlangeM: 2.57,
    rahmenBreitenM: [0.73, 1.09],
    hinweis: 'Layher-kompatibles Modulsystem',
  },
  {
    id: 'huennebeck-modex',
    hersteller: 'Hünnebeck',
    systemName: 'Modex',
    bauart: 'modul',
    rasterHoeheM: 2.0,
    feldlangenM: [2.07, 2.57, 3.07],
    standardFeldlangeM: 2.57,
    rahmenBreitenM: [0.73, 1.09],
    hinweis: 'Modulsystem aus dem BrandSafway-Konzern',
  },

  // MJ OPTIMA-Familie: Werte aus den Preislisten/Zulassungen der MJ-Gerüst GmbH (Stand 04.2025).
  // Feldhöhe 2,00 m; Standard-Feldlänge ist eine Annahme (häufigste Größe) und kann geändert werden.
  {
    id: 'mj-optima',
    hersteller: 'MJ Gerüst',
    systemName: 'OPTIMA',
    bauart: 'modul',
    rasterHoeheM: 2.0,
    feldlangenM: [1.57, 2.07, 2.57, 3.07],
    standardFeldlangeM: 2.57,
    rahmenBreitenM: [0.73, 1.09],
    hinweis: 'Fassadengerüst mit vorlaufendem Geländer, Zulassung Z-8.22-986 (gültig bis 23.07.2027). Artikel: Menü „MJ-Katalog“',
  },
  {
    id: 'mj-optima-top',
    hersteller: 'MJ Gerüst',
    systemName: 'OPTIMA TOP',
    bauart: 'modul',
    rasterHoeheM: 2.0,
    feldlangenM: [1.5, 2.0, 2.5, 3.0],
    standardFeldlangeM: 2.5,
    rahmenBreitenM: [0.65, 1.0],
    hinweis: 'Fassaden-Modulsystem, Zulassung Z-8.22-987 (gültig bis 20.03.2029), Systembreite 0,65 m. Artikel: Menü „MJ-Katalog“',
  },
  {
    id: 'mj-optima-metric',
    hersteller: 'MJ Gerüst',
    systemName: 'OPTIMA metric',
    bauart: 'modul',
    rasterHoeheM: 2.0,
    feldlangenM: [1.5, 2.0, 2.5, 3.0],
    standardFeldlangeM: 2.5,
    rahmenBreitenM: [0.74, 1.1],
    hinweis: 'Fassaden-Modulsystem mit metrischen Feldlängen, Zulassung Z-8.22-985 (gültig bis 04.11.2030). Artikel: Menü „MJ-Katalog“',
  },

  // ─── Rahmensysteme (Stahlrahmen-Gerüste) ───
  {
    id: 'layher-speedyscaf',
    hersteller: 'Layher',
    systemName: 'SpeedyScaf',
    bauart: 'rahmen',
    rasterHoeheM: 2.0,
    feldlangenM: [2.5, 3.0],
    standardFeldlangeM: 3.0,
    rahmenBreitenM: [0.73],
    hinweis: 'Klassisches Rahmengerüst, schneller Standardaufbau',
  },
  {
    id: 'mj-uniconnect',
    hersteller: 'MJ Gerüst',
    systemName: 'Uni-Connect',
    bauart: 'rahmen',
    rasterHoeheM: 2.0,
    feldlangenM: [2.5, 3.0, 3.5],
    standardFeldlangeM: 3.0,
    rahmenBreitenM: [0.73],
    hinweis: 'Rahmensystem mit Anschluss an MJ-Plus möglich',
  },
  {
    id: 'rux-super65',
    hersteller: 'Rux',
    systemName: 'Super 65',
    bauart: 'rahmen',
    rasterHoeheM: 2.0,
    feldlangenM: [2.5, 3.0],
    standardFeldlangeM: 3.0,
    rahmenBreitenM: [0.73],
    hinweis: 'Rahmengerüst bis 65 cm Ausladung',
  },
  {
    id: 'rux-super100',
    hersteller: 'Rux',
    systemName: 'Super 100',
    bauart: 'rahmen',
    rasterHoeheM: 2.0,
    feldlangenM: [2.5, 3.0],
    standardFeldlangeM: 3.0,
    rahmenBreitenM: [1.0],
    hinweis: 'Rahmengerüst bis 100 cm Ausladung',
  },
  {
    id: 'plettac-ass',
    hersteller: 'Plettac',
    systemName: 'ASS (Rahmen)',
    bauart: 'rahmen',
    rasterHoeheM: 2.0,
    feldlangenM: [2.5, 3.0],
    standardFeldlangeM: 3.0,
    rahmenBreitenM: [0.7],
    hinweis: 'Klassisches ASS-Rahmensystem',
  },
];

import { findeKatalogSerie } from '@/lib/data/katalog-serien';

// Eigenes System (Freitext) – wird im Formular separat abgefragt
export const CUSTOM_SYSTEM_ID = 'custom';

export function findeSystem(id: string | undefined): GeruestSystem | null {
  if (!id || id === CUSTOM_SYSTEM_ID) return null;
  return GERUEST_SYSTEME.find((s) => s.id === id) ?? null;
}

// Anzeigename für Zusammenfassung / Angebot, z. B. "Layher Allround (Stahl)"
export function systemAnzeigename(
  systemId: string | undefined,
  customName?: string
): string | null {
  if (!systemId) return null;
  if (systemId === CUSTOM_SYSTEM_ID) return customName?.trim() || 'Eigenes System';
  const s = findeSystem(systemId);
  if (s) return `${s.hersteller} ${s.systemName}`;
  const k = findeKatalogSerie(systemId);
  return k ? `${k.hersteller} ${k.name} (Katalog)` : null;
}
