import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geocodeAll, buildTable, tableAsText } from '@/lib/routing';

// ─── POST /api/routen-ki ───
// KI-Tourenplan für ein Datum: bündelt offene Transporte, Baustellen-Bestände,
// Fahrzeuge und Fahrer, rechnet echte Fahrzeiten (OSRM) und lässt Mistral
// einen Plan erstellen, der Leerfahrten vermeidet und Baustelle-zu-Baustelle-
// Umladungen vorschlägt. Rollen: admin + disponent.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const ALLOWED = ['admin', 'disponent'];

async function callerRole(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role || null;
}

async function rest(path: string) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const role = await callerRole();
    if (!role || !ALLOWED.includes(role)) {
      return NextResponse.json({ success: false, error: 'Kein Zugriff' }, { status: 403 });
    }

    const apiKey = process.env.KI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'KI_API_KEY fehlt (Vercel → Environment Variables).' }, { status: 400 });
    }
    const baseUrl = process.env.KI_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.KI_MODEL || 'gpt-4o-mini';

    const { date, depotAddress } = await req.json();
    if (!date) {
      return NextResponse.json({ success: false, error: 'Datum fehlt' }, { status: 400 });
    }

    // ─── Daten sammeln ───
    const [orders, vehicles, drivers, stocks, absences] = await Promise.all([
      rest(`transport_orders?status=eq.pending&select=id,quantity,status,from_project_id,to_project_id,inventory:inventory_id(name,unit),from_project:from_project_id(id,name,adresse),to_project:to_project_id(id,name,adresse)`),
      rest(`vehicles?is_active=eq.true&select=id,name,license_plate&order=name`),
      rest(`drivers?is_active=eq.true&select=id,name,employee_id,employee:employee_id(id,first_name,last_name)&order=name`),
      rest(`site_stock?quantity=gt.0&select=quantity,reserved_quantity,inventory:inventory_id(name,unit),project:project_id(id,name,adresse)`),
      rest(`absences?status=eq.approved&start_date=lte.${date}&end_date=gte.${date}&select=employee_id,type,employee:employee_id(id,first_name,last_name)`),
    ]);

    if (!orders || orders.length === 0) {
      return NextResponse.json({ success: false, error: 'Keine offenen Transportaufträge – nichts zu optimieren.' }, { status: 404 });
    }

    // Abwesende Fahrer ermitteln
    const absentEmployeeIds = new Set((absences || []).map((a: any) => a.employee_id));
    const availableDrivers = (drivers || []).filter((d: any) => !d.employee_id || !absentEmployeeIds.has(d.employee_id));
    const absentDrivers = (drivers || []).filter((d: any) => d.employee_id && absentEmployeeIds.has(d.employee_id));

    // ─── Adressen geocodieren (Lager + alle beteiligten Baustellen) ───
    const addressItems: { label: string; address: string }[] = [];
    const seen = new Set<string>();
    const push = (label: string, address?: string | null) => {
      if (!address || seen.has(address)) return;
      seen.add(address);
      addressItems.push({ label, address });
    };
    if (depotAddress) push('Lager', depotAddress);
    for (const o of orders) {
      if (o.to_project?.adresse) push(o.to_project.name, o.to_project.adresse);
      if (o.from_project?.adresse) push(o.from_project.name, o.from_project.adresse);
    }

    const { points, failed } = await geocodeAll(addressItems);
    const table = await buildTable(points);
    const matrixText = tableAsText(points, table.durations);

    // ─── Kompakte Lage fürs Modell ───
    const orderLines = orders.map((o: any) =>
      `ID ${o.id}: ${o.quantity} ${o.inventory?.unit || 'Stk'} ${o.inventory?.name || 'Material'} — von ${o.from_project?.name || 'Lager'} nach ${o.to_project?.name || '?'} (${o.to_project?.adresse || 'keine Adresse'})`
    ).join('\n');

    const stockLines = (stocks || []).slice(0, 40).map((s: any) =>
      `${s.project?.name}: ${s.quantity - (s.reserved_quantity || 0)} ${s.inventory?.unit || 'Stk'} ${s.inventory?.name} frei`
    ).join('\n');

    const prompt = `Du bist der Tourenplaner eines Gerüstbau-Betriebs. Erstelle den optimalen Tourenplan für den ${date}.

OFFENE TRANSPORTAUFTRÄGE (jeder MUSS genau einmal eingeplant werden):
${orderLines}

BAUSTELLEN-BESTÄNDE (Material, das schon auf Baustellen liegt):
${stockLines || '(keine)'}

FAHRZEUGE: ${(vehicles || []).map((v: any) => `${v.name} (${v.license_plate || 'kein Kennzeichen'})`).join(', ') || 'keine'}
VERFÜGBARE FAHRER: ${availableDrivers.map((d: any) => d.name).join(', ') || 'keine'}
${absentDrivers.length ? `ABWESENDE FAHRER (krank/urlaub): ${absentDrivers.map((d: any) => d.name).join(', ')}` : ''}

${matrixText}

REGELN:
- Leerfahrten vermeiden: Stopps so bündeln und reihen, dass ein LKW möglichst nie leer fährt (z.B. Rücktransport von einer Baustelle direkt mitnehmen).
- Baustelle-zu-Baustelle-Umladungen bevorzugen, wenn das Material dort frei liegt statt vom Lager.
- Fahrzeit-Matrix berücksichtigen: nahe Stopps in eine Tour, sinnvolle Reihenfolge.
- Jede Tour: ein Fahrzeug, ein Fahrer, maximal ~6 Stopps.
- Verwende AUSSCHLIESSLICH die echten IDs, Fahrzeug-, Fahrer- und Projektnamen aus den Daten oben.

Antworte AUSSCHLIESSLICH als JSON:
{
  "touren": [
    {
      "name": "<Tourneyname, z.B. Tour Nord>",
      "fahrzeug": "<exakter Fahrzeugname>",
      "fahrer": "<exakter Fahrername>",
      "stopps": [
        { "projekt": "<Projektname>", "aktion": "<z.B. Anlieferung 50 Stk Rahmen / Abholung>", "transport_order_ids": ["<echte IDs aus den Aufträgen>"] }
      ],
      "begruendung": "<1-2 Sätze warum diese Reihenfolge>"
    }
  ],
  "umladungen": [
    { "von": "<Projekt>", "nach": "<Projekt>", "material": "<Name>", "menge": "<Zahl + Einheit>", "grund": "<1 Satz>" }
  ],
  "leerfahrt_hinweise": ["<konkrete Einsparungen, z.B. Rückfahrt genutzt für...>"],
  "warnungen": ["<z.B. nicht geocodierbare Adressen, zu wenig Fahrer, nicht eingeplante Aufträge>"]
}`;

    const kiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 2500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!kiRes.ok) {
      const errText = await kiRes.text();
      return NextResponse.json({ success: false, error: `KI-Fehler (${kiRes.status}): ${errText.slice(0, 300)}` }, { status: 502 });
    }

    const kiJson = await kiRes.json();
    const raw = kiJson.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return NextResponse.json({ success: false, error: 'KI hat keine Antwort geliefert' }, { status: 502 });
    }

    let plan: any;
    try {
      plan = JSON.parse(raw);
    } catch {
      return NextResponse.json({ success: false, error: 'KI-Antwort war kein gültiges JSON' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      plan,
      meta: {
        date,
        ordersCount: orders.length,
        geocoded: points.length,
        failedAddresses: failed,
        matrixOk: !!table.durations,
        vehicles: (vehicles || []).map((v: any) => ({ id: v.id, name: v.name })),
        drivers: availableDrivers.map((d: any) => ({ id: d.id, name: d.name })),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Unbekannter Fehler' }, { status: 500 });
  }
}
