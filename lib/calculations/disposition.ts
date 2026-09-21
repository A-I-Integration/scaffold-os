// ============================================================
// lib/calculations/disposition.ts
// SCAFFOLD OS – Dispositions- & Transport-Optimierungs-Engine
// ============================================================
// Eingabe: Materialliste (aus KI-Berechnung) + Ziel-Baustelle
// Ausgabe: Optimale Beschaffungs-Strategie mit Einsparungen
// ============================================================

import { MaterialItem } from '@/types/scaffold';

// --- INTERFACES ---

export interface SiteStock {
  siteId: string;
  siteName: string;
  address: string;
  articleNumber: string;
  quantity: number;
  // Entfernung zur Ziel-Baustelle (echte Fahrstrecke via Google Distance
  // Matrix, siehe lib/google-distance.ts). `null` = nicht ermittelbar
  // (kein API-Key, Adresse nicht auflösbar, API nicht erreichbar) -
  // wird NIE durch eine geschätzte/erfundene Zahl ersetzt.
  distanceKm: number | null;
}

export interface CentralStock {
  articleNumber: string;
  quantity: number;
  location: string;
}

export interface DispositionSuggestion {
  articleNumber: string;
  articleName: string;
  needed: number;
  source: 'central' | 'site_direct' | 'site_via_central' | 'order_new';
  sourceSiteId?: string;
  sourceSiteName?: string;
  availableQuantity: number;
  missingQuantity: number;
  transportCost: number | null;
  transportCostOptimized: number | null;
  distanceKm: number | null;
  dieselLiters: number | null;
  timeHours: number | null;
  co2Kg: number | null;
  savings: number;
  reason: string;
}

export interface DispositionResult {
  suggestions: DispositionSuggestion[];
  totalNeeded: number;
  totalAvailable: number;
  totalMissing: number;
  totalSavings: number;
  totalSavedKm: number;
  totalSavedDiesel: number;
  totalSavedHours: number;
  totalSavedCo2: number;
  routes: OptimizedRoute[];
  summaryText: string;
}

export interface OptimizedRoute {
  from: string;
  to: string;
  siteName?: string;
  articles: string[];
  distanceKm: number | null;
  dieselLiters: number | null;
  timeHours: number | null;
  co2Kg: number | null;
  savingsVsCentral: number;
}

// --- KONSTANTEN ---

const DIESEL_PER_100KM = 34; // Liter Diesel pro 100km (LKW)
const LKW_COST_PER_KM = 2.8; // € pro km (inkl. Fahrer, LKW, Versicherung)
const LKW_SPEED_KMH = 65; // Durchschnittsgeschwindigkeit
const CO2_PER_LITER_DIESEL = 2.65; // kg CO2 pro Liter Diesel
const HANDLING_COST_CENTRAL = 45; // € Umladepauschale Zentrallager

// --- HAUPTFUNKTION ---

export async function optimizeDisposition(
  materialList: MaterialItem[],
  targetSiteId: string,
  targetAddress: string,
  getCentralStock: (articleNumbers: string[]) => Promise<CentralStock[]>,
  getSiteStock: (articleNumbers: string[], excludeSiteId: string, targetAddress: string) => Promise<SiteStock[]>
): Promise<DispositionResult> {
  
  const suggestions: DispositionSuggestion[] = [];
  const routes: OptimizedRoute[] = [];
  
  let totalSavings = 0;
  let totalSavedKm = 0;
  let totalSavedDiesel = 0;
  let totalSavedHours = 0;
  let totalSavedCo2 = 0;
  
  // 1. Abgleich-Schlüssel sammeln: bewusst der Artikel-NAME, nicht die
  // articleNumber. Die articleNumber ist ein interner KI-Katalogcode
  // (z.B. "RA-001") aus scaffold-engine.ts/cad-engine.ts und hat keine
  // Entsprechung in der echten Lager-Tabelle (inventory.sku bleibt für
  // reale Artikel meist leer). Der Name ist der einzige verlässliche
  // Abgleichspunkt – siehe lib/angebot-annahme.ts, wo aus demselben
  // Grund bewusst per Name (case-insensitive, exakter Treffer) statt
  // per articleNumber abgeglichen wird.
  const articleNumbers = materialList.map(m => m.name);
  
    // 2. Bestände parallel abfragen (mit Fallback)
  let centralStock: CentralStock[] = [];
  let siteStock: SiteStock[] = [];

  try {
    centralStock = await getCentralStock(articleNumbers);
  } catch (e) {
    console.warn('[Disposition] Zentrallager nicht erreichbar, verwende leeren Bestand');
  }

  try {
    siteStock = await getSiteStock(articleNumbers, targetSiteId, targetAddress);
  } catch (e) {
    console.warn('[Disposition] Baustellenbestand nicht erreichbar, verwende leeren Bestand');
  }
  
  // 3. Indexe für schnellen Zugriff
  const centralByArticle = new Map(centralStock.map(c => [c.articleNumber, c]));
  const siteByArticle = new Map<string, SiteStock[]>();
  for (const s of siteStock) {
    if (!siteByArticle.has(s.articleNumber)) {
      siteByArticle.set(s.articleNumber, []);
    }
    siteByArticle.get(s.articleNumber)!.push(s);
  }
  
  // 4. Jeden Artikel einzeln optimieren
  for (const item of materialList) {
    const needed = item.quantity;
    const central = centralByArticle.get(item.name);
    const centralQty = central?.quantity || 0;
    const sites = siteByArticle.get(item.name) || [];
    
    // Beste Quelle finden
    let bestSource: DispositionSuggestion;
    
    if (sites.length > 0) {
      // Es gibt Überbestand auf anderen Baustellen. Nächste Baustelle
      // finden - Sites mit bekannter Entfernung werden bevorzugt
      // (aufsteigend sortiert), Sites ohne ermittelbare Entfernung
      // (distanceKm === null) kommen ans Ende, statt fälschlich als
      // "nah" zu gelten.
      const nearestSite = [...sites].sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return 0;
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      })[0];
      const availableOnSite = Math.min(needed, nearestSite.quantity);
      const distBekannt = nearestSite.distanceKm != null;
      const distHinRueck = distBekannt ? nearestSite.distanceKm! * 2 : null; // Hin + Zurück
      const distHinweis = distBekannt
        ? `(${nearestSite.distanceKm} km)`
        : '(Entfernung nicht ermittelbar - Google-Distanzberechnung prüfen)';

      if (availableOnSite >= needed) {
        // Komplett von Baustelle direkt
        const diesel = distHinRueck != null ? (distHinRueck / 100) * DIESEL_PER_100KM : null;
        const time = distHinRueck != null ? distHinRueck / LKW_SPEED_KMH : null;
        const costDirect = distHinRueck != null ? distHinRueck * LKW_COST_PER_KM : null;
        const costViaCentral = distBekannt
          ? (nearestSite.distanceKm! + 50) * LKW_COST_PER_KM + HANDLING_COST_CENTRAL // Annahme: Lager ist ~50km entfernt
          : null;

        bestSource = {
          articleNumber: item.articleNumber,
          articleName: item.name,
          needed,
          source: 'site_direct',
          sourceSiteId: nearestSite.siteId,
          sourceSiteName: nearestSite.siteName,
          availableQuantity: availableOnSite,
          missingQuantity: 0,
          transportCost: costDirect,
          transportCostOptimized: costDirect,
          distanceKm: distHinRueck,
          dieselLiters: diesel,
          timeHours: time,
          co2Kg: diesel != null ? diesel * CO2_PER_LITER_DIESEL : null,
          savings: costViaCentral != null && costDirect != null ? Math.max(0, costViaCentral - costDirect) : 0,
          reason: `Direkt von Baustelle "${nearestSite.siteName}" ${distHinweis}. Kein Umweg über Zentrallager nötig.`,
        };
      } else {
        // Teilweise von Baustelle, Rest von Zentrallager
        const missing = needed - availableOnSite;
        const diesel = distHinRueck != null ? (distHinRueck / 100) * DIESEL_PER_100KM : null;
        const costDirect = distHinRueck != null ? distHinRueck * LKW_COST_PER_KM : null;

        bestSource = {
          articleNumber: item.articleNumber,
          articleName: item.name,
          needed,
          source: 'site_via_central',
          sourceSiteId: nearestSite.siteId,
          sourceSiteName: nearestSite.siteName,
          availableQuantity: availableOnSite,
          missingQuantity: missing,
          transportCost: costDirect,
          transportCostOptimized: costDirect,
          distanceKm: distHinRueck,
          dieselLiters: diesel,
          timeHours: distHinRueck != null ? distHinRueck / LKW_SPEED_KMH : null,
          co2Kg: diesel != null ? diesel * CO2_PER_LITER_DIESEL : null,
          savings: availableOnSite * 15, // ca. 15€ Einsparung pro Stück durch Vermeidung doppelter Fahrt
          reason: `${availableOnSite} Stk von Baustelle "${nearestSite.siteName}" ${distHinweis}, ${missing} Stk aus Zentrallager nachbestellen.`,
        };
      }
    } else if (centralQty >= needed) {
      // Alles aus Zentrallager verfügbar
      const dist = 50; // Annahme: Standard-Entfernung Lager → Baustelle
      const diesel = (dist / 100) * DIESEL_PER_100KM;
      
      bestSource = {
        articleNumber: item.articleNumber,
        articleName: item.name,
        needed,
        source: 'central',
        availableQuantity: needed,
        missingQuantity: 0,
        transportCost: dist * LKW_COST_PER_KM,
        transportCostOptimized: dist * LKW_COST_PER_KM,
        distanceKm: dist,
        dieselLiters: diesel,
        timeHours: dist / LKW_SPEED_KMH,
        co2Kg: diesel * CO2_PER_LITER_DIESEL,
        savings: 0,
        reason: 'Aus Zentrallager verfügbar. Standard-Lieferung.',
      };
    } else {
      // Nicht verfügbar → neu bestellen
      bestSource = {
        articleNumber: item.articleNumber,
        articleName: item.name,
        needed,
        source: 'order_new',
        availableQuantity: centralQty,
        missingQuantity: needed - centralQty,
        transportCost: 0,
        transportCostOptimized: 0,
        distanceKm: 0,
        dieselLiters: 0,
        timeHours: 0,
        co2Kg: 0,
        savings: 0,
        reason: `Nicht auf Lager. ${needed - centralQty} Stk müssen neu beschafft werden.`,
      };
    }
    
    suggestions.push(bestSource);
    totalSavings += bestSource.savings;
    totalSavedKm += bestSource.distanceKm ?? 0;
    totalSavedDiesel += bestSource.dieselLiters ?? 0;
    totalSavedHours += bestSource.timeHours ?? 0;
    totalSavedCo2 += bestSource.co2Kg ?? 0;
  }
  
  // 5. Routen gruppieren (Baustellen zusammenfassen)
  const siteRoutes = new Map<string, OptimizedRoute>();
  for (const s of suggestions) {
    if (s.source === 'site_direct' || s.source === 'site_via_central') {
      const key = s.sourceSiteId!;
      if (!siteRoutes.has(key)) {
        siteRoutes.set(key, {
          from: s.sourceSiteName!,
          to: targetAddress,
          siteName: s.sourceSiteName,
          articles: [],
          distanceKm: s.distanceKm,
          dieselLiters: s.dieselLiters,
          timeHours: s.timeHours,
          co2Kg: s.co2Kg,
          savingsVsCentral: 0,
        });
      }
      siteRoutes.get(key)!.articles.push(s.articleName);
      siteRoutes.get(key)!.savingsVsCentral += s.savings;
    }
  }
  
  routes.push(...siteRoutes.values());
  
  // 6. Zusammenfassungstext generieren
  const directCount = suggestions.filter(s => s.source === 'site_direct').length;
  const partialCount = suggestions.filter(s => s.source === 'site_via_central').length;
  const centralCount = suggestions.filter(s => s.source === 'central').length;
  const orderCount = suggestions.filter(s => s.source === 'order_new').length;
  
  let summaryText = '';
  if (directCount > 0) {
    summaryText += `${directCount} Artikel können direkt von anderen Baustellen geliefert werden. `;
  }
  if (partialCount > 0) {
    summaryText += `${partialCount} Artikel teilweise von Baustellen, Rest aus Lager. `;
  }
  if (centralCount > 0) {
    summaryText += `${centralCount} Artikel aus Zentrallager. `;
  }
  if (orderCount > 0) {
    summaryText += `${orderCount} Artikel müssen neu bestellt werden.`;
  }
  
  return {
    suggestions,
    totalNeeded: materialList.reduce((s, m) => s + m.quantity, 0),
    totalAvailable: suggestions.reduce((s, sug) => s + sug.availableQuantity, 0),
    totalMissing: suggestions.reduce((s, sug) => s + sug.missingQuantity, 0),
    totalSavings: Math.round(totalSavings * 100) / 100,
    totalSavedKm: Math.round(totalSavedKm * 10) / 10,
    totalSavedDiesel: Math.round(totalSavedDiesel * 10) / 10,
    totalSavedHours: Math.round(totalSavedHours * 10) / 10,
    totalSavedCo2: Math.round(totalSavedCo2 * 100) / 100,
    routes,
    summaryText,
  };
}