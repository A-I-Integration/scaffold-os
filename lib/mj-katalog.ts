// ============================================================
// SCAFFOLD OS – MJ-Gerüst Artikelkatalog (Nachschlagewerk)
//
// Quelle: Preislisten MJ OPTIMA (V2.4), MJ OPTIMA TOP (V2.3), MJ OPTIMA metric
// (V2.3), jeweils Stand 04.2025, der MJ-Gerüst GmbH. Die Tabellen wurden
// automatisch ausgelesen (lib/data/mj-katalog.json) und stichprobenartig gegen
// die PDFs geprüft. Der Katalog ist NUR ZUM NACHSCHLAGEN: Er verändert weder
// Lagerbestände noch die Preise in den Kalkulationen.
//
// Preise: MJ-Listenpreise netto (zzgl. MwSt.) – keine Verkaufspreise.
// Nicht übernommen: Kennzeichen der Preisliste (Nettopreis/nicht rabattfähig,
// EN, BG-Förderung, Lieferzeit auf Anfrage) und die Zuordnung der Bereichsnamen
// ist automatisch erfolgt (kann bei einzelnen Artikeln ungenau sein).
// ============================================================

import katalogRoh from '@/lib/data/mj-katalog.json';

export type MjListe = 'optima' | 'optima-top' | 'optima-metric';

export interface MjArtikel {
  /** Artikelnummer laut MJ (6 Stellen) */
  nr: string;
  liste: MjListe;
  /** Bereich/Überschrift in der Preisliste (automatisch zugeordnet) */
  gruppe: string;
  untertitel: string;
  /** Maße/Gewicht/VPE usw. wie in der Tabelle (Schlüssel mit Einheit, z. B. "Länge (m)") */
  attribute: Record<string, string | number>;
  /** Listenpreis netto in € */
  preis: number;
}

export interface MjListeInfo {
  key: MjListe;
  name: string;
  preislisteVersion: string;
  preislisteStand: string;
  zulassung: { nummer: string; bescheidVom: string; gueltigBis: string; gegenstand: string };
}

export const MJ_LISTEN: Record<MjListe, MjListeInfo> = {
  optima: {
    key: 'optima', name: 'MJ OPTIMA', preislisteVersion: 'V2.4', preislisteStand: '04.2025',
    zulassung: { nummer: 'Z-8.22-986', bescheidVom: '06.07.2026', gueltigBis: '23.07.2027', gegenstand: 'Gerüstbauteile für das modulare Fassadengerüst "MJ OPTIMA"' },
  },
  'optima-top': {
    key: 'optima-top', name: 'MJ OPTIMA TOP', preislisteVersion: 'V2.3', preislisteStand: '04.2025',
    zulassung: { nummer: 'Z-8.22-987', bescheidVom: '20.03.2024', gueltigBis: '20.03.2029', gegenstand: 'Gerüstbauteile für das Fassaden-Modulsystem "MJ OPTIMA TOP"' },
  },
  'optima-metric': {
    key: 'optima-metric', name: 'MJ OPTIMA metric', preislisteVersion: 'V2.3', preislisteStand: '04.2025',
    zulassung: { nummer: 'Z-8.22-985', bescheidVom: '04.12.2025', gueltigBis: '04.11.2030', gegenstand: 'Gerüstbauteile für das Fassaden-Modulsystem "MJ OPTIMA metric"' },
  },
};

/**
 * MJ OPTI-BEAM (Aluminium-Kastenträger) – Angaben vom Hersteller, von der
 * Betreiberin übernommen; in den hier hinterlegten Preislisten ist der Träger
 * NICHT enthalten (keine Artikelnummern/Preise).
 */
export const MJ_OPTI_BEAM = {
  name: 'MJ OPTI-BEAM',
  beschreibung: 'Aluminium-Kastenträger mit zwei Bohrungsreihen für Bolzen-Anbauteile und einem U-Profil an der Oberseite für Systemböden mit U-Krallen.',
  einsatz: [
    'Mit Aufhängeschuh nach oben befestigt: Hängegerüst.',
    'Mit Stielanschluss unten auf COMBI-Stütztragwerken (der Träger erhält automatisch eine Gabellagerung).',
    'Mit Stielanschluss oben: Aufbauten mit COMBI-Stielen, -Riegeln und weiteren Bauteilen auf dem Träger.',
  ],
  hinweis: 'Nur zur Verwendung mit original MJ-Bauteilen. Nach den europäischen Schutzrechten EP 3721028 und EP 3721029 ist die Verwendung mit Abhebesicherungen und Stieladaptern anderer Hersteller nicht vorgesehen.',
} as const;

const alle: MjArtikel[] = (katalogRoh as any[]).map((r) => ({
  nr: r.n, liste: r.l as MjListe, gruppe: r.g, untertitel: r.u, attribute: r.a, preis: r.p,
}));

export function alleMjArtikel(): MjArtikel[] {
  return alle;
}

export function mjArtikelNachNr(nr: string): MjArtikel[] {
  return alle.filter((a) => a.nr === nr.trim());
}

/** Suche in Artikelnummer, Bereich und Untertitel (alle Suchwörter müssen vorkommen). */
export function sucheMjArtikel(suche: string, liste?: MjListe | 'alle', artikel: MjArtikel[] = alle): MjArtikel[] {
  const woerter = suche.toLowerCase().split(/\s+/).filter(Boolean);
  return artikel.filter((a) => {
    if (liste && liste !== 'alle' && a.liste !== liste) return false;
    const text = `${a.nr} ${a.gruppe} ${a.untertitel}`.toLowerCase();
    return woerter.every((w) => text.includes(w));
  });
}
