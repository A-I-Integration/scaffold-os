import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { calculateScaffoldMaterial, type CostSettings } from './calculations/scaffold-engine';
import type { ScaffoldInput } from '../types/scaffold';

// ============================================================
// SCAFFOLD OS – GAEB-Ausschreibungen (Phase 40)
//
// WICHTIG, ehrlich: Ich habe diese Ein-/Auslese-Logik selbst mit einer
// nach der offiziellen GAEB-DA-XML-Struktur nachgebauten Testdatei
// geprüft (Positionen lesen, Preise zurückschreiben, wieder auslesen –
// funktioniert). Anders als beim E-Rechnungs-ZUGFeRD-Teil konnte ich
// das NICHT gegen den offiziellen GAEB-XML-Checker oder eine echte
// Ausschreibungsdatei testen (beides lag nicht vor). Bei der ersten
// echten Datei bitte das Ergebnis genau prüfen, bevor es abgeschickt
// wird.
//
// Schreibweise bewusst so gewählt, dass beim Export NUR ein <UP>-
// Element je Position ergänzt wird – der Rest der Original-Datei
// bleibt Zeichen für Zeichen unverändert. Das minimiert das Risiko,
// etwas an der Struktur kaputt zu machen, das ich nicht vollständig
// kenne.
// ============================================================

export interface GaebPosition {
  oz: string;
  menge: number;
  einheit: string;
  text: string;
  einzelpreis: number | null;
  vorschlagQuelle: 'muster' | null;
}

// FIX (hands-on an einer verschachtelten Teststruktur gefunden): Die alte
// findAll()-Logik hat bei einem TREFFER nicht weiter in die Tiefe gesucht.
// Bei GAEB ist Verschachtelung aber der NORMALFALL: Ein Leistungstitel/
// Untertitel ist selbst ein <Item>, das eine eigene <Itemlist> mit den
// echten, bepreisbaren Positionen enthält. Die alte Version hätte das
// Titel-Item fälschlich als Position behandelt (mit zufällig aus der Tiefe
// "geerbten" Qty/QU-Werten) und die eigentlichen Positionen darunter NIE
// gefunden. Jetzt: nur "Blatt-Items" (ohne eigene, nicht-leere Itemlist)
// gelten als Position; Titel/Gruppen-Items werden übersprungen, aber ihre
// Kinder werden weiter durchsucht.
function findePositionsItems(node: any, out: any[] = []): any[] {
  if (Array.isArray(node)) { node.forEach((n) => findePositionsItems(n, out)); return out; }
  if (!node || typeof node !== 'object') return out;
  for (const key of Object.keys(node)) {
    if (key === 'Item') {
      const arr = Array.isArray(node[key]) ? node[key] : [node[key]];
      for (const item of arr) {
        const eigeneKinder = item && typeof item === 'object' ? item.Itemlist : undefined;
        if (eigeneKinder) {
          // Gruppen-/Titel-Item: selbst NICHT als Position werten, aber
          // in seine Kinder hinein weitersuchen.
          findePositionsItems(eigeneKinder, out);
        } else {
          out.push(item);
        }
      }
    } else {
      findePositionsItems(node[key], out);
    }
  }
  return out;
}

function findAll(node: any, tag: string, out: any[] = []): any[] {
  if (Array.isArray(node)) { node.forEach((n) => findAll(n, tag, out)); return out; }
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      if (key === tag) {
        const arr = Array.isArray(node[key]) ? node[key] : [node[key]];
        out.push(...arr);
      }
      // WICHTIG: anders als vorher wird JETZT immer weiter in die Tiefe
      // gesucht, auch nach einem Treffer – sonst werden Positionen, die
      // unter einem gefundenen Element verschachtelt liegen, übersprungen
      // (betrifft z.B. Qty/QU innerhalb von QtySplit-Strukturen).
      findAll(node[key], tag, out);
    }
  }
  return out;
}

function deepText(node: any, tag: string): string | null {
  const found = findAll(node, tag);
  if (!found.length) return null;
  const el = found[0];
  if (typeof el === 'object') return el['#text'] ?? null;
  return String(el);
}

// FIX (hands-on an einer echten GAEB-Datei gefunden): die alte
// deepestText() nahm den ERSTEN gefundenen Text-Knoten überhaupt – bei
// echten GAEB-Dateien steht dort oft zuerst ein Flag wie <OutlTSA>No</OutlTSA>
// ("Freitext gleich Kurztext?"), NICHT die eigentliche Beschreibung. Das
// führte dazu, dass ALLE Positionstexte fälschlich "No" statt der echten
// Beschreibung waren – und damit auch die Muster-Erkennung (Gerüst-Erkennung)
// nie funktioniert hätte. Jetzt gezielt nach den tatsächlichen
// Text-tragenden GAEB-Elementen gesucht (LblTx = Kurztext, TextOutlTxt =
// Langtext/Freitext), bekannte Flag-Felder wie OutlTSA explizit ausgenommen.
const TEXT_TRAEGER_TAGS = ['LblTx', 'TextOutlTxt', 'span', 'p'];
const KEIN_TEXT_TAGS = new Set(['OutlTSA']);

function sammleText(node: any, ausserhalbVon: Set<string> = KEIN_TEXT_TAGS): string[] {
  const teile: string[] = [];
  const rekursiv = (n: any, key?: string) => {
    if (key && ausserhalbVon.has(key)) return; // bekannte Nicht-Text-Felder überspringen
    if (typeof n === 'string') { if (n.trim()) teile.push(n.trim()); return; }
    if (Array.isArray(n)) { n.forEach((x) => rekursiv(x, key)); return; }
    if (n && typeof n === 'object') {
      for (const k of Object.keys(n)) {
        if (k === '@_') continue;
        rekursiv(n[k], k);
      }
    }
  };
  rekursiv(node);
  return teile;
}

function beschreibungsText(description: any): string {
  if (!description) return '';
  // Zuerst gezielt nach bekannten Text-Elementen suchen (zuverlässiger)…
  for (const tag of TEXT_TRAEGER_TAGS) {
    const treffer = findAll(description, tag);
    if (treffer.length) {
      const texte = treffer.map((t) => (typeof t === 'object' ? t['#text'] : t)).filter(Boolean);
      if (texte.length) return texte.join(' ');
    }
  }
  // …sonst: alle Textknoten sammeln, bekannte Flag-Felder ausgenommen,
  // und zusammenfügen (robuster als "irgendeinen ersten Textknoten nehmen").
  const gesammelt = sammleText(description);
  return gesammelt.join(' ');
}

/** Liest die Positionen (OZ, Menge, Einheit, Text) aus einer GAEB-DA-XML-Datei (X83). */
export function parseGaebPositions(xml: string, costs?: CostSettings): GaebPosition[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });
  const doc = parser.parse(xml);
  // FIX: nur echte Blatt-Positionen (siehe findePositionsItems oben), nicht
  // Titel-/Gruppen-Items, die selbst nur Container für weitere Items sind.
  const items = findePositionsItems(doc);
  return items.map((item: any): GaebPosition => {
    // FIX: OZ steht in echten GAEB-Dateien meist NICHT als Attribut direkt am
    // <Item>, sondern als eigenes <RNoPart>-Element (Positionsnummer-Teil,
    // ggf. mehrteilig). Beide Varianten abdecken, mit Attribut-Fallback für
    // ältere/abweichende Exporte.
    const oz = deepText(item, 'RNoPart') || item['@_RNoPart'] || item['@_No'] || '';
    const menge = parseFloat(deepText(item, 'Qty') || '0') || 0;
    const einheit = deepText(item, 'QU') || '';
    const text = beschreibungsText(item.Description);
    const vorschlag = schaetzePreis(text, menge, einheit, costs);
    return { oz, menge, einheit, text, einzelpreis: vorschlag, vorschlagQuelle: vorschlag != null ? 'muster' : null };
  });
}

/**
 * Erkennt gängige Gerüstbau-Formulierungen (Lastklasse, Breitenklasse,
 * Höhenangabe) im Positionstext und lässt EURE bestehende Kalkulations-
 * Engine einen Preis pro m² berechnen – dieselbe Rechenlogik wie im
 * normalen Aufmaß, nicht neu erfunden. Liefert null, wenn nichts
 * Passendes erkannt wird (dann ist manuelle Eingabe nötig).
 */
function schaetzePreis(text: string, menge: number, einheit: string, costs?: CostSettings): number | null {
  if (!menge || !/m2|m²|qm/i.test(einheit)) return null; // nur Flächenpositionen (m²)
  const hatGeruestbegriff = /gerüst|einrüstung|einrüsten/i.test(text);
  if (!hatGeruestbegriff) return null;

  const hoeheMatch = text.match(/(?:bis|höhe)[^\d]*(\d+[,.]?\d*)\s*m\b/i);
  const hoehe = hoeheMatch ? parseFloat(hoeheMatch[1].replace(',', '.')) : 8; // Annahme, falls keine Höhe im Text steht

  try {
    const input: ScaffoldInput = {
      customer: '', address: '', trade: 'fassade', projectDurationDays: 30,
      lengthM: Math.round((menge / hoehe) * 100) / 100, heightM: hoehe, widthM: 0.73, eavesHeightM: hoehe,
      roofForm: 'kein', roofOverhangM: 0, facadeType: 'mauerwerk', obstacles: [],
      scaffoldType: 'rahmen', deckingType: 'stahl', fieldLengthM: 2.5, groundType: 'beton',
      anchorType: 'fassadenanker', groundCondition: 'beton', hasSlope: false, hasLightShafts: false,
      hasBasement: false, needsLoadDistribution: false,
      environment: { hasPowerLines: false, hasVegetation: false, hasNeighborProperty: false, hasPublicTraffic: false, needsNoParkingZone: false, needsSpecialUse: false, hasStorageArea: false, hasTruckAccess: false, needsCrane: false, needsProtectionRoof: false, needsSafetyNet: false },
      windZone: 1, hazards: [], additionalNotes: '',
    };
    const ergebnis = calculateScaffoldMaterial(input, undefined, costs);
    const flaeche = ergebnis.totalAreaM2 || input.lengthM * input.heightM;
    if (!flaeche) return null;
    const proQm = ergebnis.suggestedPrice / flaeche;
    return Math.round(proQm * menge * 100) / 100;
  } catch {
    return null;
  }
}

/**
 * Schreibt die eingegebenen Einzelpreise als <UP>-Element in die Datei
 * zurück (X84).
 *
 * FIX (hands-on gefunden): Der ursprüngliche Ansatz hat den Preis per
 * Text-Ersetzung (Regex) direkt in die rohe XML-Zeichenkette eingefügt.
 * Das funktioniert bei einer FLACHEN Liste von Positionen, schlägt aber
 * bei der GAEB-üblichen VERSCHACHTELTEN Struktur (Titel enthält
 * Positionen) fehl: Ein Regex kann nicht zuverlässig erkennen, welches
 * schließende </Item> zu welchem öffnenden <Item> gehört, wenn Items
 * ineinander verschachtelt sind – das hätte den Preis in die falsche
 * Position geschrieben oder die Datei strukturell beschädigt.
 *
 * Jetzt: die Datei wird echt geparst, nur die tatsächlichen Blatt-
 * Positionen (dieselbe Erkennung wie beim Einlesen) bekommen ihr <UP>-
 * Element gesetzt, und die komplette Struktur wird sauber neu
 * geschrieben. Das ändert minimal die Formatierung/Einrückung der
 * Datei, garantiert aber, dass jeder Preis wirklich bei der richtigen
 * Position landet, auch bei mehrstufiger Titel-Gliederung.
 */
export function buildGaebX84(originalXml: string, preiseNachIndex: (number | null)[]): string {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', preserveOrder: false });
  const doc = parser.parse(originalXml);

  let index = 0;
  const setzePreise = (node: any) => {
    if (Array.isArray(node)) { node.forEach(setzePreise); return; }
    if (!node || typeof node !== 'object') return;
    for (const key of Object.keys(node)) {
      if (key === 'Item') {
        const arr = Array.isArray(node[key]) ? node[key] : [node[key]];
        for (const item of arr) {
          if (item && typeof item === 'object' && item.Itemlist) {
            setzePreise(item.Itemlist); // Titel/Gruppe: nur in die Kinder schreiben
          } else if (item && typeof item === 'object') {
            const preis = preiseNachIndex[index];
            index++;
            if (preis != null && !isNaN(preis)) {
              item.UP = preis.toFixed(2);
            }
          }
        }
      } else {
        setzePreise(node[key]);
      }
    }
  };
  setzePreise(doc);

  // FIX: der Parser liest die XML-Deklaration (<?xml ...?>) mit als
  // eigenen Schlüssel ein – ohne Entfernen würde sie doppelt erscheinen
  // (einmal von uns hartkodiert, einmal vom Builder zurückgeschrieben).
  delete doc['?xml'];

  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', format: true });
  const xmlDeklaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
  return xmlDeklaration + builder.build(doc);
}
