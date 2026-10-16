import { NextRequest, NextResponse } from 'next/server';
import { pruefeCronAufruf } from '@/lib/cron-auth';
import { runSqlOnProject } from '@/lib/provision/supabase-mgmt';
import { hofSpalteFehlt } from '@/lib/touren/hof';

// ============================================================
// SCAFFOLD OS – Cron: Datenhygiene (NUR Master-Instanz)
//
// Löscht GPS-Positionsdaten, die älter als 90 Tage sind (gps_tracking) und
// leert die Koordinaten "Vom Hof gefahren / Zurück auf dem Hof" an Touren,
// die länger als 90 Tage zurückliegen (die Uhrzeiten bleiben) –
// auf ALLEN Kundeninstanzen und auf der Master-Instanz selbst.
//
// Hintergrund: Der AVV (§ 10) verspricht Kunden eine automatische
// Löschung der GPS-Verläufe nach 90 Tagen. Dieser Job macht das
// wahr – er läuft täglich um 03:00 Uhr (vercel.json).
//
// Sicherheit: Vercel Cron schickt den CRON_SECRET als Bearer-Token
// mit. Ohne gültiges Secret passiert nichts.
// ============================================================

export const maxDuration = 300;

const GPS_LOESCH_SQL = `delete from public.gps_tracking where created_at < now() - interval '90 days'`;

// Tour-Koordinaten (Abfahrt/Rückkehr) nach 90 Tagen leeren; die Uhrzeiten bleiben.
// Als DO-Block: fehlen die Spalten (SQL phase-100 nicht ausgeführt), passiert nichts.
const HOF_LOESCH_SQL = `do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tours' and column_name = 'returned_lng')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tours' and column_name = 'departed_lng') then
    update public.tours
       set departed_lat = null, departed_lng = null, returned_lat = null, returned_lng = null
     where planned_date < current_date - 90
       and (departed_lat is not null or departed_lng is not null or returned_lat is not null or returned_lng is not null);
  end if;
end $$;`;

const masterUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const masterKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  apikey: masterKey,
  Authorization: `Bearer ${masterKey}`,
  'Content-Type': 'application/json',
};

export async function GET(req: NextRequest) {
  // 1) Nur Master-Instanz darf diesen Job ausführen
  if (process.env.MASTER_INSTANCE !== 'true') {
    return NextResponse.json({ error: 'Nur auf der Master-Instanz.' }, { status: 403 });
  }

  // 2) Cron-Secret ist Pflicht (ohne Secret gesperrt)
  const cronFehler = pruefeCronAufruf(req);
  if (cronFehler) return cronFehler;

  const ergebnis: { instanz: string; ok: boolean; info: string }[] = [];

  // 3) Master-Instanz selbst bereinigen
  try {
    const res = await fetch(
      `${masterUrl}/rest/v1/gps_tracking?created_at=lt.${new Date(Date.now() - 90 * 86400000).toISOString()}`,
      { method: 'DELETE', headers }
    );
    ergebnis.push({
      instanz: 'master',
      ok: res.ok,
      info: res.ok ? 'GPS-Daten > 90 Tage gelöscht' : await res.text(),
    });
  } catch (err: any) {
    ergebnis.push({ instanz: 'master', ok: false, info: err.message });
  }

  // 3b) Master-Instanz: Tour-Koordinaten > 90 Tage leeren
  try {
    const grenze = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const res = await fetch(
      `${masterUrl}/rest/v1/tours?planned_date=lt.${grenze}&or=(departed_lat.not.is.null,departed_lng.not.is.null,returned_lat.not.is.null,returned_lng.not.is.null)`,
      { method: 'PATCH', headers, body: JSON.stringify({ departed_lat: null, departed_lng: null, returned_lat: null, returned_lng: null }) }
    );
    if (res.ok) {
      ergebnis.push({ instanz: 'master (Tour-Koordinaten)', ok: true, info: 'Tour-Koordinaten > 90 Tage geleert' });
    } else {
      const txt = await res.text();
      const fehlt = hofSpalteFehlt(txt);
      ergebnis.push({ instanz: 'master (Tour-Koordinaten)', ok: fehlt, info: fehlt ? 'Spalten noch nicht vorhanden – nichts zu tun' : txt });
    }
  } catch (err: any) {
    ergebnis.push({ instanz: 'master (Tour-Koordinaten)', ok: false, info: err.message });
  }

  // 4) Alle Kundeninstanzen bereinigen
  try {
    const tRes = await fetch(
      `${masterUrl}/rest/v1/tenants?supabase_project_ref=not.is.null&status=in.("active","past_due")&select=slug,supabase_project_ref`,
      { headers }
    );
    if (!tRes.ok) throw new Error(await tRes.text());
    const tenants = await tRes.json();

    for (const t of tenants) {
      try {
        await runSqlOnProject(t.supabase_project_ref, GPS_LOESCH_SQL);
        ergebnis.push({ instanz: t.slug, ok: true, info: 'GPS-Daten > 90 Tage gelöscht' });
        try {
          await runSqlOnProject(t.supabase_project_ref, HOF_LOESCH_SQL);
          ergebnis.push({ instanz: `${t.slug} (Tour-Koordinaten)`, ok: true, info: 'Tour-Koordinaten > 90 Tage geleert' });
        } catch (err2: any) {
          ergebnis.push({ instanz: `${t.slug} (Tour-Koordinaten)`, ok: false, info: err2.message });
          console.error(`[cron-datenhygiene] ${t.slug} (Tour-Koordinaten): ${err2.message}`);
        }
      } catch (err: any) {
        // Einzelne Instanz darf den Gesamtlauf nicht stoppen
        ergebnis.push({ instanz: t.slug, ok: false, info: err.message });
        console.error(`[cron-datenhygiene] ${t.slug}: ${err.message}`);
      }
    }
  } catch (err: any) {
    console.error('[cron-datenhygiene] Tenant-Liste fehlgeschlagen:', err.message);
    return NextResponse.json({ success: false, error: err.message, teilergebnis: ergebnis }, { status: 500 });
  }

  const fehler = ergebnis.filter((e) => !e.ok);
  console.log(`[cron-datenhygiene] fertig: ${ergebnis.length - fehler.length} ok, ${fehler.length} Fehler`);
  return NextResponse.json({ success: fehler.length === 0, ergebnis });
}
