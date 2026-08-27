import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aktuellerPlan, UPGRADE_HINWEIS } from '@/lib/plan-limits';

// ============================================================
// SCAFFOLD OS – CSV-Import: Material/Lager
// POST { rows: [...] } → legt Artikel in der Tabelle inventory an.
//
// SICHERHEIT: Nur admin + disponent (Session-Check per Cookie).
// Datenbank-Zugriff danach per REST + SERVICE_ROLE_KEY.
// Dubletten über SKU werden übersprungen. Insert in Blöcken à 100.
// Paket-Lagergrenze (maxLagerTeile) wird wie beim manuellen
// Anlegen geprüft (Summe der importierten Bestände).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

const ALLOWED_CALLERS = ['admin', 'disponent'];
const MAX_ROWS = 5000;

async function checkCaller(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || !ALLOWED_CALLERS.includes(profile.role)) {
    return NextResponse.json({ success: false, error: 'Keine Berechtigung (nur CEO/Dispo)' }, { status: 403 });
  }
  return null;
}

function s(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t.slice(0, max);
}

function zahl(v: unknown, fallback: number): number {
  if (v === undefined || v === null || String(v).trim() === '') return fallback;
  // deutsches Komma akzeptieren: „12,50" → 12.5
  const n = Number(String(v).trim().replace(/\./g, (String(v).includes(',') ? '' : '.')).replace(',', '.'));
  return isNaN(n) ? fallback : n;
}

export async function POST(req: NextRequest) {
  const denied = await checkCaller();
  if (denied) return denied;

  let body: { rows?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Ungültige Anfrage' }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ success: false, error: 'Keine Zeilen übergeben' }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { success: false, error: `Maximal ${MAX_ROWS.toLocaleString('de-DE')} Zeilen pro Import` },
      { status: 400 }
    );
  }

  // Paket-Lagergrenze: Gesamtmenge des Imports gegen das Limit prüfen
  const plan = aktuellerPlan();
  const importMenge = rows.reduce<number>((summe, r) => {
    const q = zahl((r as Record<string, unknown>)?.quantity, 0);
    return summe + (q > 0 ? q : 0);
  }, 0);
  if (plan && plan.grenzen.maxLagerTeile !== null && importMenge > 0) {
    try {
      const res = await fetch(`${url}/rest/v1/inventory?select=quantity&is_active=eq.true`, { headers: adminHeaders });
      if (res.ok) {
        const bestand = (await res.json()) as { quantity: number }[];
        const summe = bestand.reduce((a, r) => a + (Number(r.quantity) || 0), 0);
        if (summe + importMenge > plan.grenzen.maxLagerTeile) {
          return NextResponse.json({
            success: false,
            error: `${plan.grenzen.label}-Paket: Lagerlimit ${plan.grenzen.maxLagerTeile.toLocaleString('de-DE')} Teile (aktuell ${summe.toLocaleString('de-DE')}, Import ${importMenge.toLocaleString('de-DE')}). ${UPGRADE_HINWEIS}`,
          }, { status: 403 });
        }
      }
    } catch (e) {
      console.error('Lagergrenzen-Prüfung nicht lesbar (fail-open):', e);
    }
  }

  // Vorhandene SKUs laden → Dubletten überspringen
  let vorhandeneSkus = new Set<string>();
  try {
    const res = await fetch(`${url}/rest/v1/inventory?select=sku&is_active=eq.true`, { headers: adminHeaders });
    if (res.ok) {
      const bestand = (await res.json()) as { sku: string }[];
      vorhandeneSkus = new Set(bestand.map((a) => a.sku.toLowerCase()));
    }
  } catch (e) {
    console.error('inventory-Bestand nicht lesbar (Import läuft ohne Dubletten-Check):', e);
  }

  const fehler: { zeile: number; grund: string }[] = [];
  const eintraege: Record<string, unknown>[] = [];
  let uebersprungen = 0;

  rows.forEach((roh, i) => {
    const zeile = i + 1;
    const r = (roh || {}) as Record<string, unknown>;
    const name = s(r.name, 200);
    if (!name) {
      fehler.push({ zeile, grund: 'Bezeichnung fehlt' });
      return;
    }
    let sku = s(r.sku, 60);
    if (sku && vorhandeneSkus.has(sku.toLowerCase())) {
      uebersprungen++;
      return;
    }
    if (!sku) {
      // SKU aus Name + Zeilennummer erzeugen (NOT NULL in inventory)
      sku = `IMP-${zeile}-${name.slice(0, 30).replace(/[^a-zA-Z0-9äöüÄÖÜ]/g, '-')}`;
    }
    vorhandeneSkus.add(sku.toLowerCase()); // Dubletten innerhalb der Datei
    eintraege.push({
      sku,
      name,
      category: s(r.category, 100) || 'Sonstiges',
      description: s(r.description, 1000),
      quantity: Math.max(0, Math.round(zahl(r.quantity, 0))),
      min_stock: Math.max(0, Math.round(zahl(r.min_stock, 10))),
      reorder_point: Math.max(0, Math.round(zahl(r.reorder_point, 20))),
      unit: s(r.unit, 20) || 'Stk',
      unit_price: Math.max(0, zahl(r.unit_price, 0)),
      supplier: s(r.supplier, 200),
      supplier_lead_time: Math.max(0, Math.round(zahl(r.supplier_lead_time, 7))),
      location_in_warehouse: s(r.location_in_warehouse, 100),
      barcode: s(r.barcode, 60),
      is_active: true,
    });
  });

  // In Blöcken à 100 einfügen
  let importiert = 0;
  for (let von = 0; von < eintraege.length; von += 100) {
    const block = eintraege.slice(von, von + 100);
    try {
      const res = await fetch(`${url}/rest/v1/inventory`, {
        method: 'POST',
        headers: { ...adminHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(block),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('inventory-Import Blockfehler:', res.status, text);
        block.forEach((_, j) => fehler.push({ zeile: von + j + 1, grund: 'Datenbank-Fehler beim Einfügen' }));
      } else {
        importiert += block.length;
      }
    } catch (e) {
      console.error('inventory-Import Fehler:', e);
      block.forEach((_, j) => fehler.push({ zeile: von + j + 1, grund: 'Verbindungsfehler' }));
    }
  }

  return NextResponse.json({ success: true, importiert, uebersprungen, fehler });
}
