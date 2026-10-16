import { describe, it, expect, vi, beforeEach } from 'vitest';

// Rollen-Prüfung pro Aktion für Fahrer, Fahrzeuge, Lager (Teil 2).
// Gemockt: Login/Rolle (Supabase-Client) und die Datenbank-Aufrufe (fetch).

let aktuellerUser: { id: string } | null = { id: 'u1' };
let aktuelleRolle: string | null = 'admin';

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: aktuellerUser } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: aktuelleRolle ? { role: aktuelleRolle } : null }) }),
      }),
    }),
  }),
}));

vi.mock('@/lib/inventory/buchung', () => ({
  bucheAusZentrallager: async () => ({ ok: true, data: {} }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

function req(method: string, body?: unknown, url = 'http://x/api') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  aktuellerUser = { id: 'u1' };
  aktuelleRolle = 'admin';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify([{ id: '1', quantity: 1 }]), { status: 200 }))
  );
});

const ALLE = ['admin', 'disponent', 'bauleiter', 'lager', 'mitarbeiter'];

async function status(fn: (r: any) => Promise<Response>, rolle: string | null, r: Request) {
  aktuelleRolle = rolle;
  return (await fn(r)).status;
}

describe('Fahrer-API', async () => {
  const m = await import('@/app/api/drivers/route');
  it('Lesen: jeder Eingeloggte (Meine Touren braucht das)', async () => {
    for (const rolle of ALLE) expect(await status(m.GET as any, rolle, req('GET'))).toBe(200);
  });
  it('Lesen ohne Login: 401', async () => {
    aktuellerUser = null;
    expect((await (m.GET as any)()).status).toBe(401);
  });
  it('Anlegen/Ändern: nur Admin und Disposition', async () => {
    for (const rolle of ALLE) {
      const erlaubt = rolle === 'admin' || rolle === 'disponent';
      expect(await status(m.POST as any, rolle, req('POST', { name: 'Max' }))).toBe(erlaubt ? 200 : 403);
      expect(await status(m.PUT as any, rolle, req('PUT', { id: 'a', employee_id: null }))).toBe(erlaubt ? 200 : 403);
    }
  });
  it('Fehlendes Profil gilt als Mitarbeiter und wird abgewiesen', async () => {
    expect(await status(m.POST as any, null, req('POST', { name: 'Max' }))).toBe(403);
  });
});

describe('Fahrzeug-API', async () => {
  const m = await import('@/app/api/vehicles/route');
  it('Lesen: jeder Eingeloggte', async () => {
    for (const rolle of ALLE) expect(await status(m.GET as any, rolle, req('GET'))).toBe(200);
  });
  it('Anlegen/Ändern: nur Admin und Disposition', async () => {
    for (const rolle of ALLE) {
      const erlaubt = rolle === 'admin' || rolle === 'disponent';
      expect(await status(m.POST as any, rolle, req('POST', { name: 'LKW' }))).toBe(erlaubt ? 200 : 403);
      expect(await status(m.PUT as any, rolle, req('PUT', { id: 'a', name: 'LKW 2' }))).toBe(erlaubt ? 200 : 403);
    }
  });
});

describe('Lager-API', async () => {
  const m = await import('@/app/api/inventory/route');
  const reserve = await import('@/app/api/inventory/reserve/route');
  const lagerRollen = ['admin', 'disponent', 'bauleiter', 'lager'];
  it('Lesen: jeder Eingeloggte (Doku/Aufmaß brauchen die Artikelliste)', async () => {
    for (const rolle of ALLE) expect(await status(m.GET as any, rolle, req('GET'))).toBe(200);
  });
  it('Artikel anlegen/ändern/löschen: nicht für Mitarbeiter', async () => {
    for (const rolle of ALLE) {
      const erlaubt = lagerRollen.includes(rolle);
      expect(await status(m.POST as any, rolle, req('POST', { sku: 'A', name: 'A', category: 'x' }))).toBe(erlaubt ? 200 : 403);
      expect(await status(m.PUT as any, rolle, req('PUT', { id: 'a', name: 'B' }))).toBe(erlaubt ? 200 : 403);
      expect(await status(m.DELETE as any, rolle, req('DELETE', undefined, 'http://x/api/inventory?id=a'))).toBe(erlaubt ? 200 : 403);
    }
  });
  it('Reservieren: nicht für Mitarbeiter', async () => {
    expect(await status(reserve.POST as any, 'mitarbeiter', req('POST', {}))).toBe(403);
    expect(await status(reserve.POST as any, null, req('POST', {}))).toBe(403);
    aktuellerUser = null;
    expect((await (reserve.POST as any)(req('POST', {}))).status).toBe(401);
  });
});
