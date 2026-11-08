# Analyse: feste Ersatzgewichte in `lib/calculations/article-prices.ts`

Stand der Analyse: Phase 4 der Herstellerdatenbank. **Es wurde nichts entfernt oder geändert.**
Entfernt wird erst nach kontrolliertem Ersatz und erfolgreichen Tests (Vorgabe der Freigabe).

## Wo Gewichte ohne Beleg entstehen

| Nr. | Stelle | Was passiert | Beleg |
|---|---|---|---|
| 1 | `article-prices.ts`, `FALLBACK_PRICES` (27 Artikel, Nummern RA-, AB-, DI-, GE-, KU-, FP-, KO-, BB-…) | Feste Preise **und Gewichte** (z. B. „Rahmen 0,73 m: 12,5 kg") als Ersatz, wenn das Lager nicht erreichbar oder leer ist, und als Ergänzung bei passender SKU ohne Lagergewicht | keiner im Repo; die Nummern kommen in keinem Herstellerkatalog (MJ, SCAFOM-RUX, Layher) vor |
| 2 | `article-prices.ts`, Zeile `weightKg: … : (fb?.weightKg ?? 10)` | Hat ein aktiver Lagerartikel kein Gewicht (0) und keinen Ersatzeintrag, werden **10 kg** angenommen („konservativer Schätzwert") | keiner |
| 3 | `lib/calculations/scaffold-engine.ts` (27 Treffer für `weightKg`) | Eigener, **zweiter** fester Artikelbestand mit denselben Gewichten (12,5 / 15,2 / 18,0 / 22,0 …) | keiner |
| 4 | `app/aufmass/schritt6/page.tsx`, `app/gaeb/page.tsx` | Manuell oder aus GAEB angelegte Positionen mit `weightKg: 0` | bewusst „unbekannt", unkritisch |

## Verbraucher (wer rechnet mit diesen Gewichten?)

| Verbraucher | Nutzt | Folge |
|---|---|---|
| `app/api/ki-material/route.ts` → `loadArticlePricesMitQuelle()` → `calculateScaffoldMaterial` (scaffold-engine) | Preise **und** Gewicht | Gesamtgewicht in der Material-Kalkulation (Aufmaß, Angebot). Die Oberfläche zeigt bei Ersatzpreisen einen Hinweis (`quelle: 'ersatz'`), aber **keinen Hinweis bei Gewichten, die aus den 10 kg oder dem Ersatzwert stammen** |
| `lib/auto-tour.ts` (2 Stellen: neue Fahrt aus Transportaufträgen, Abholung) → `loadArticlePrices()` | `weightKg` je SKU, sonst 0 | Gesamtgewicht → **Fahrzeugwahl** (Tragfähigkeit/zulässiges Gesamtgewicht) |
| `lib/calculations/cad-lager.ts` | nur Lagerwerte (`weight_kg > 0`), sonst CAD-Wert; meldet `ohneGewicht` | kein Ersatzgewicht aus article-prices, sauber |
| `app/cad/page.tsx`, `lib/export/*` (PDF, Statik, Statiker-Paket), `modell-stand.ts` | `weightKg` aus der CAD-Stückliste | Gewicht kommt aus `cad-engine`/Katalog bzw. Lager, nicht aus dem Ersatzbestand |
| `app/api/statiker/lager/route.ts` | nur Lager (`weight_kg`) | unkritisch |
| Tests: `lib/calculations/__tests__/article-prices.test.ts`, `engine-abgleich.test.ts` | prüfen das Ersatzverhalten | müssen bei einem Ersatz mitgeändert werden |

## Risiken
1. Ein Gesamtgewicht in Angebot/Kalkulation oder in der Fahrzeugwahl kann auf **nicht belegten** Gewichten beruhen, ohne dass das sichtbar ist.
2. Die zwei festen Bestände (article-prices und scaffold-engine) können auseinanderlaufen.
3. Der 10-kg-Wert ist eine Annahme, keine Messung.

## Vorgeschlagener kontrollierter Ersatz (nicht umgesetzt)
1. Neue Quelle: freigegebene Referenzgewichte aus der Herstellerdatenbank (nur Status „freigegeben" durch Admin), verbunden über `inventory.katalog_artikel_id`.
2. Reihenfolge je SKU: gemessenes Ist-Gewicht (WM, nur falls freigegeben für Berechnungen) → freigegebenes Herstellergewicht → Lagergewicht (manuell gepflegt) → **kein Wert** (statt 10 kg).
3. Jede Berechnung trägt `gewichtQuelle` und `gewichtUnsicher`; die Oberfläche zeigt Artikel ohne belegtes Gewicht an.
4. Erst dann Ersatzbestand entfernen; Tests für `article-prices`, `auto-tour`, `ki-material` anpassen.
