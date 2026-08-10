import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// SCAFFOLD OS – Lager-Prognose (Nr. 4)
//
// GET  → Prognose-Engine: rechnet auf echten Daten
//        • Verbrauch/Tag (gelieferte Transporte, 30 Tage)
//        • „Reicht noch X Tage" (Bestand minus eingeplante
//          Transporte, geteilt durch Verbrauch)
//        • Ampel + Bestellvorschlag + Bestellwert
//
// POST → KI-Einschätzung: schickt die kompakte Prognose an ein
//        KI-Modell (OpenAI-kompatibel: OpenAI, Kimi/Moonshot…)
//        und liefert eine Text-Zusammenfassung mit Empfehlungen.
//        Läuft über ENV-Variablen: KI_API_KEY (Pflicht),
//        KI_BASE_URL + KI_MODEL (optional, siehe unten).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const DAYS = 30;           // Betrachtungszeitraum Verbrauch
const CRITICAL_DAYS = 7;   // 🔴 darunter kritisch
const WARNING_DAYS = 14;   // 🟡 darunter Warnung

interface ForecastRow {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  min_stock: number;
  unit_price: number;
  pending_out: number;        // schon eingeplant (pending/in_transit)
  effective_stock: number;    // Bestand minus eingeplant
  usage_30d: number;          // Verbrauch letzte 30 Tage
  daily_rate: number;         // Ø pro Tag
  days_left: number | null;   // null = kein Verbrauch
  status: 'critical' | 'warning' | 'ok' | 'idle';
  suggested_order: number;    // Bestellvorschlag (Stück)
  order_value: number;        // Bestellwert in €
}

function buildForecast(inventory: any[], transports: any[]): { rows: ForecastRow[]; kpis: any } {
  const since = new Date();
  since.setDate(since.getDate() - DAYS);

  const usage: Record<string, number> = {};
  const pending: Record<string, number> = {};

  for (const t of transports) {
    const itemId = t.inventory_id;
    if (!itemId) continue;
    const qty = t.quantity || 0;
    if (t.status === 'delivered') {
      const when = new Date(t.completed_at || t.created_at);
      if (when >= since) usage[itemId] = (usage[itemId] || 0) + qty;
    } else if (t.status === 'pending' || t.status === 'in_transit') {
      pending[itemId] = (pending[itemId] || 0) + qty;
    }
  }

  const rows: ForecastRow[] = inventory.map((item: any) => {
    const usage30 = usage[item.id] || 0;
    const dailyRate = usage30 / DAYS;
    const pendingOut = pending[item.id] || 0;
    const effective = (item.quantity || 0) - pendingOut;
    const daysLeft = dailyRate > 0 ? effective / dailyRate : null;

    let status: ForecastRow['status'] = 'idle';
    if (daysLeft !== null) {
      if (daysLeft < CRITICAL_DAYS) status = 'critical';
      else if (daysLeft < WARNING_DAYS) status = 'warning';
      else status = 'ok';
    } else if (effective <= (item.min_stock || 0)) {
      status = 'warning'; // kein Verbrauch, aber unter Mindestbestand
    }

    // Bestellvorschlag: auf 30 Tage Verbrauch + Mindestbestand auffüllen
    const target = dailyRate * DAYS + (item.min_stock || 0);
    const suggested = Math.max(0, Math.ceil(target - effective));
    const orderValue = suggested * (item.unit_price || 0);

    return {
      id: item.id,
      name: item.name,
      unit: item.unit || 'Stk',
      quantity: item.quantity || 0,
      min_stock: item.min_stock || 0,
      unit_price: item.unit_price || 0,
      pending_out: pendingOut,
      effective_stock: effective,
      usage_30d: usage30,
      daily_rate: Math.round(dailyRate * 100) / 100,
      days_left: daysLeft !== null ? Math.round(daysLeft) : null,
      status,
      suggested_order: suggested,
      order_value: Math.round(orderValue * 100) / 100,
    };
  });

  // Sortierung: kritisch zuerst, dann Warnung, dann ok, dann ohne Bewegung
  const rank = { critical: 0, warning: 1, ok: 2, idle: 3 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.days_left ?? 9999) - (b.days_left ?? 9999));

  const kpis = {
    critical: rows.filter(r => r.status === 'critical').length,
    warning: rows.filter(r => r.status === 'warning').length,
    idle: rows.filter(r => r.status === 'idle' && r.quantity > 0).length,
    totalOrderValue: Math.round(rows.reduce((s, r) => s + (r.status !== 'idle' ? r.order_value : 0), 0) * 100) / 100,
    totalItems: rows.length,
  };

  return { rows, kpis };
}

export async function GET() {
  try {
    const [invRes, transRes] = await Promise.all([
      fetch(`${url}/rest/v1/inventory?select=id,name,quantity,unit,unit_price,min_stock&is_active=eq.true`, { headers }),
      fetch(`${url}/rest/v1/transport_orders?select=inventory_id,quantity,status,created_at,completed_at`, { headers }),
    ]);
    if (!invRes.ok) throw new Error('Lager: ' + await invRes.text());
    if (!transRes.ok) throw new Error('Transporte: ' + await transRes.text());

    const { rows, kpis } = buildForecast(await invRes.json(), await transRes.json());
    return NextResponse.json({ success: true, rows, kpis, period_days: DAYS });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── POST: KI-Einschätzung ───
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.KI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'KI_API_KEY ist noch nicht hinterlegt (Vercel → Settings → Environment Variables).',
      }, { status: 400 });
    }
    const baseUrl = process.env.KI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.KI_MODEL || 'gpt-4o-mini';

    const { rows, kpis } = await req.json();

    // Kompakte Lage für das Modell (nur das Nötigste)
    const compact = (rows || []).slice(0, 30).map((r: any) =>
      `${r.name}: Bestand ${r.quantity} ${r.unit}, eingeplant ${r.pending_out}, Verbrauch/Tag ${r.daily_rate}, reicht noch ${r.days_left === null ? '∞' : r.days_left + ' Tage'}, Vorschlag ${r.suggested_order} ${r.unit}`
    ).join('\n');

    const prompt = `Du bist der Dispositions-Assistent eines Gerüstbau-Betriebs. Analysiere diese Lager-Prognose (Zeitraum: ${DAYS} Tage) und antworte auf Deutsch, klar und konkret:

LAGE:
${compact}

KENNZAHLEN: ${kpis?.critical ?? 0} kritisch, ${kpis?.warning ?? 0} Warnungen, Bestellwert gesamt ${kpis?.totalOrderValue ?? 0} €

AUFGABE:
1) Fasse die Gesamtlage in 2-3 Sätzen zusammen.
2) Liste die 3 dringendsten Maßnahmen als Stichpunkte (mit konkreten Artikelnamen und Mengen).
3) Weise falls sinnvoll auf Artikel hin, die Kapital binden (Bestand ohne Verbrauch).
Halte dich kurz – maximal 150 Wörter. Keine Einleitung, keine Höflichkeiten.`;

    const kiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 600,
      }),
    });
    const kiJson = await kiRes.json();
    if (!kiRes.ok) {
      const msg = kiJson?.error?.message || JSON.stringify(kiJson);
      return NextResponse.json({ success: false, error: 'KI-Anfrage fehlgeschlagen: ' + msg }, { status: 502 });
    }

    const text = kiJson?.choices?.[0]?.message?.content || '';
    return NextResponse.json({ success: true, summary: text });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
