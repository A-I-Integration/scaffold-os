// ============================================================
// SCAFFOLD OS – MJ-Gerüst Artikelkatalog (Nachschlagewerk)
//
// Quelle: Preislisten MJ OPTIMA (V2.4), MJ OPTIMA TOP (V2.3), MJ OPTIMA metric
// (V2.3), MJ UNI-CONNECT (V3.3-1), MJ COMBI (V3.4), MJ COMBI metric / TOP (V2.2), MJ UNI (V3.2) und MJ UNI TOP (V3.3),
// jeweils Stand 04.2025, der MJ-Gerüst GmbH. Die Tabellen wurden
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

export type MjListe = 'optima' | 'optima-top' | 'optima-metric' | 'uni-connect' | 'combi' | 'combi-metric-top' | 'uni' | 'uni-top';

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
  /** Allgemeine bauaufsichtliche Zulassungen (nur Eckdaten; der Bescheid selbst darf nur vollständig vervielfältigt werden) */
  zulassungen: MjZulassung[];
}

export interface MjZulassung { nummer: string; bescheidVom: string; gueltigBis: string; gegenstand: string }

export const MJ_LISTEN: Record<MjListe, MjListeInfo> = {
  optima: {
    key: 'optima', name: 'MJ OPTIMA', preislisteVersion: 'V2.4', preislisteStand: '04.2025',
    zulassungen: [{ nummer: 'Z-8.22-986', bescheidVom: '06.07.2026', gueltigBis: '23.07.2027', gegenstand: 'Gerüstbauteile für das modulare Fassadengerüst "MJ OPTIMA"' }],
  },
  'optima-top': {
    key: 'optima-top', name: 'MJ OPTIMA TOP', preislisteVersion: 'V2.3', preislisteStand: '04.2025',
    zulassungen: [{ nummer: 'Z-8.22-987', bescheidVom: '20.03.2024', gueltigBis: '20.03.2029', gegenstand: 'Gerüstbauteile für das Fassaden-Modulsystem "MJ OPTIMA TOP"' }],
  },
  'optima-metric': {
    key: 'optima-metric', name: 'MJ OPTIMA metric', preislisteVersion: 'V2.3', preislisteStand: '04.2025',
    zulassungen: [{ nummer: 'Z-8.22-985', bescheidVom: '04.12.2025', gueltigBis: '04.11.2030', gegenstand: 'Gerüstbauteile für das Fassaden-Modulsystem "MJ OPTIMA metric"' }],
  },
  'uni-connect': {
    key: 'uni-connect', name: 'MJ UNI-CONNECT', preislisteVersion: 'V3.3-1', preislisteStand: '04.2025',
    zulassungen: [
      { nummer: 'Z-8.1-872', bescheidVom: '10.06.2024', gueltigBis: '09.03.2027', gegenstand: 'MJ UNI-CONNECT 70 DUO' },
      { nummer: 'Z-8.1-922', bescheidVom: '27.01.2026', gueltigBis: '25.02.2027', gegenstand: 'MJ UNI-CONNECT 100 DUO (Verlängerung)' },
      { nummer: 'Z-8.1-935', bescheidVom: '19.01.2023', gueltigBis: '09.01.2028', gegenstand: 'MJ UNI-CONNECT 70 ALU DUO' },
    ],
  },
  combi: {
    key: 'combi', name: 'MJ COMBI', preislisteVersion: 'V3.4 (laut Dateiname; die Rückseite der Liste nennt V3.3)', preislisteStand: '04.2025',
    zulassungen: [{ nummer: 'Z-8.22-921', bescheidVom: '06.07.2026', gueltigBis: '04.09.2030', gegenstand: 'Gerüstbauteile für das Modulsystem "MJ COMBI"' }],
  },
  'combi-metric-top': {
    key: 'combi-metric-top', name: 'MJ COMBI metric / TOP', preislisteVersion: 'V2.2', preislisteStand: '04.2025',
    // Nur die Zulassung für COMBI metric liegt vor; für COMBI TOP wurde keine Zulassung übergeben.
    zulassungen: [{ nummer: 'Z-8.22-923', bescheidVom: '10.01.2025', gueltigBis: '03.01.2030', gegenstand: 'MJ COMBI metric (Änderungs-/Verlängerungsbescheid; gilt nur zusammen mit der Zulassung vom 10.12.2019)' }],
  },
  uni: {
    key: 'uni', name: 'MJ UNI 70 / 100', preislisteVersion: 'V3.2', preislisteStand: '04.2025',
    zulassungen: [
      { nummer: 'Z-8.1-184', bescheidVom: '06.07.2026', gueltigBis: '13.07.2027', gegenstand: 'MJ UNI 70 (Verlängerungsbescheid; gilt nur zusammen mit der Zulassung vom 21.06.2019)' },
      { nummer: 'Z-8.1-303', bescheidVom: '16.02.2026', gueltigBis: '02.03.2027', gegenstand: 'MJ UNI 70 DUO (Verlängerungsbescheid; gilt nur zusammen mit der Genehmigung vom 24.02.2020)' },
      { nummer: 'Z-8.1-871', bescheidVom: '07.05.2026', gueltigBis: '08.05.2031', gegenstand: 'MJ UNI 100 (Änderungs-/Verlängerungsbescheid; gilt nur zusammen mit der Zulassung vom 06.05.2020)' },
    ],
  },
  'uni-top': {
    key: 'uni-top', name: 'MJ UNI TOP 65', preislisteVersion: 'V3.3', preislisteStand: '04.2025',
    zulassungen: [{ nummer: 'Z-8.1-902', bescheidVom: '11.08.2026', gueltigBis: '18.08.2031', gegenstand: 'Gerüstbauteile für das Gerüstsystem "MJ UNI TOP 65"' }],
  },
};

/** Zulassungen von Systemen, zu denen keine Preisliste hinterlegt ist (daher keine Artikel im Katalog). */
export const MJ_WEITERE_ZULASSUNGEN: MjZulassung[] = [
  { nummer: 'Z-8.22-926', bescheidVom: '10.10.2025', gueltigBis: '17.10.2030', gegenstand: 'MJ COMBI DUO (Änderungs-/Verlängerungsbescheid; gilt nur zusammen mit der Genehmigung vom 11.11.2020)' },
  { nummer: 'Z-8.22-960', bescheidVom: '10.10.2023', gueltigBis: '10.10.2028', gegenstand: 'MJ COMBI metric DUO (Bauartgenehmigung)' },
];

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

const alle: MjArtikel[] = (katalogRoh as unknown as { n: string; l: string; g: string; u: string; a: Record<string, string | number>; p: number }[]).map((r) => ({
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
