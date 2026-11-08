// Minimaler Nachbau der Supabase-REST-Schnittstelle (PostgREST) im Speicher,
// damit Kettentests die echten Buchungsfunktionen ohne Datenbank durchlaufen lassen können.
// Unterstützt nur, was die Lager-Routen brauchen: GET/POST/PATCH, Filter eq./gt., order=…asc.

type Zeile = Record<string, unknown>
export type Tabellen = Record<string, Zeile[]>

export function baueFakeRest(daten: Tabellen) {
  let zaehler = 0
  const passt = (z: Zeile, filter: [string, string][]) =>
    filter.every(([spalte, wert]) => {
      const [op, ...rest] = wert.split('.')
      const v = rest.join('.')
      if (op === 'eq') return String(z[spalte]) === v
      if (op === 'gt') return Number(z[spalte]) > Number(v)
      return true
    })

  const handler = async (eingabe: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const u = new URL(String(eingabe))
    const tabelle = u.pathname.split('/rest/v1/')[1]
    daten[tabelle] = daten[tabelle] ?? []
    const filter = [...u.searchParams.entries()].filter(([k]) => !['select', 'order', 'limit'].includes(k))
    const methode = (init?.method ?? 'GET').toUpperCase()
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })

    if (methode === 'GET') {
      const treffer = daten[tabelle].filter((z) => passt(z, filter))
      if (u.searchParams.get('order')?.startsWith('created_at')) treffer.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      return json(treffer.map((z) => ({ ...z })))
    }
    if (methode === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}'))
      const neu = { id: `${tabelle}-${++zaehler}`, created_at: new Date(2026, 0, 1, 0, 0, zaehler).toISOString(), ...body }
      daten[tabelle].push(neu)
      return json([neu])
    }
    if (methode === 'PATCH') {
      const body = JSON.parse(String(init?.body ?? '{}'))
      const treffer = daten[tabelle].filter((z) => passt(z, filter))
      treffer.forEach((z) => Object.assign(z, body))
      return json(treffer.map((z) => ({ ...z })))
    }
    return new Response('nicht unterstützt', { status: 400 })
  }
  return handler
}
