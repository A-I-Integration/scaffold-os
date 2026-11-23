// ============================================================
// SCAFFOLD OS – PostgREST-Adapter auf ECHTER PostgreSQL (nur für den End-to-End-Test der Faktura)
//
// Die Routen sprechen unverändert `fetch(.../rest/v1/...)`. Dieser Adapter beantwortet diese Aufrufe mit einer echten PostgreSQL-Datenbank:
// Tabellenzugriffe sind echte SQL-Anweisungen, `rpc/<funktion>` ruft die ECHTE SQL-Funktion aus supabase/*.sql auf (Zeilensperren,
// Transaktionen, Constraints gelten wirklich). NICHT echt ist nur die HTTP-Schicht von PostgREST selbst (Filtersyntax, Statuscodes).
// Unterstützt nur, was die Routen verwenden: select/order/limit, Filter eq/neq/gt/gte/lt/lte/is/in/ilike, POST/PATCH/DELETE, rpc.
// ============================================================
import type { Pool } from 'pg'

const ID = /^[a-z_][a-z0-9_]*$/
const ident = (s: string) => { if (!ID.test(s)) throw new Error('Ungültiger Name: ' + s); return '"' + s + '"' }

export function baueEchtesRest(pool: Pool) {
  const spaltenTypen = new Map<string, Record<string, string>>()
  async function typen(tabelle: string) {
    if (!spaltenTypen.has(tabelle)) {
      const r = await pool.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1`, [tabelle])
      spaltenTypen.set(tabelle, Object.fromEntries(r.rows.map((x) => [x.column_name, x.data_type])))
    }
    return spaltenTypen.get(tabelle)!
  }
  const wert = (t: Record<string, string>, spalte: string, v: unknown) =>
    v !== null && typeof v === 'object' && (t[spalte] === 'jsonb' || t[spalte] === 'json') ? JSON.stringify(v) : v

  function where(params: URLSearchParams, start: number): { sql: string; werte: unknown[] } {
    const teile: string[] = []; const werte: unknown[] = []
    for (const [k, v] of params.entries()) {
      if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue
      const punkt = v.indexOf('.'); const op = v.slice(0, punkt); const rest = v.slice(punkt + 1)
      const c = ident(k)
      const p = () => { werte.push(rest); return '$' + (start + werte.length) }
      if (op === 'eq') teile.push(`${c} = ${p()}`)
      else if (op === 'neq') teile.push(`${c} <> ${p()}`)
      else if (op === 'gt') teile.push(`${c} > ${p()}`)
      else if (op === 'gte') teile.push(`${c} >= ${p()}`)
      else if (op === 'lt') teile.push(`${c} < ${p()}`)
      else if (op === 'lte') teile.push(`${c} <= ${p()}`)
      else if (op === 'ilike') teile.push(`${c}::text ilike ${p()}`)
      else if (op === 'is') teile.push(rest === 'null' ? `${c} is null` : rest === 'true' ? `${c} is true` : `${c} is false`)
      else if (op === 'in') { const liste = rest.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')); werte.push(liste); teile.push(`${c}::text = any($${start + werte.length}::text[])`) }
      else throw new Error('Filter nicht unterstützt: ' + k + '=' + v)
    }
    return { sql: teile.length ? ' where ' + teile.join(' and ') : '', werte }
  }
  const json = (b: unknown, status = 200) => new Response(b === undefined ? null : JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
  const fehler = (e: any) => json({ message: e.message, code: e.code, details: e.detail ?? null, hint: e.hint ?? null }, e.code === '23505' ? 409 : 400)

  return async (eingabe: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const u = new URL(String(eingabe)); const methode = (init?.method ?? 'GET').toUpperCase()
    const pfad = u.pathname.split('/rest/v1/')[1] ?? ''
    const prefer = String((init?.headers as Record<string, string> | undefined)?.Prefer ?? '')
    try {
      if (pfad.startsWith('rpc/')) {
        const name = pfad.slice(4); const body = JSON.parse(String(init?.body ?? '{}'))
        const f = await pool.query(`select p.proargnames, p.proargtypes::oid[] as arg_oids, p.prorettype::regtype::text as ret, (select typtype from pg_type where oid = p.prorettype) as rettyp,
                                   (select array_agg(format_type(o, null) order by ord) from unnest(p.proargtypes::oid[]) with ordinality as t(o, ord)) as arg_typen
                                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname=$1`, [name])
        if (!f.rows.length) return json({ message: `Could not find the function public.${name}`, code: 'PGRST202' }, 404)
        const fn = f.rows[0]; const namen: string[] = fn.proargnames || []; const typenListe: string[] = fn.arg_typen || []
        const args: string[] = []; const werte: unknown[] = []
        for (const k of Object.keys(body)) {
          const i = namen.indexOf(k); if (i < 0) return json({ message: `Could not find the function public.${name}(${Object.keys(body).join(', ')})`, code: 'PGRST202' }, 404)
          const t = typenListe[i]; const v = body[k]
          werte.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v)
          args.push(`${ident(k)} := $${werte.length}::${t}`)
        }
        const aufruf = `public.${ident(name)}(${args.join(', ')})`
        const sql = fn.ret === 'void' ? `select ${aufruf}` : fn.rettyp === 'c' ? `select to_jsonb(r) as r from ${aufruf} r` : `select to_jsonb(${aufruf}) as r`
        const r = await pool.query(sql, werte)
        if (fn.ret === 'void') return new Response(null, { status: 204 })
        return json(r.rows[0]?.r ?? null)
      }

      const tabelle = ident(pfad); const t = await typen(pfad)
      if (methode === 'GET') {
        const w = where(u.searchParams, 0)
        const sel = u.searchParams.get('select'); const spalten = !sel || sel === '*' ? '*' : sel.split(',').map((s) => ident(s.trim().split(':')[0].split('(')[0])).join(', ')
        const ord = u.searchParams.get('order'); const lim = u.searchParams.get('limit')
        const order = ord ? ' order by ' + ord.split(',').map((o) => { const [c, d] = o.split('.'); return ident(c) + (d === 'desc' ? ' desc' : ' asc') }).join(', ') : ''
        const r = await pool.query(`select ${spalten} from public.${tabelle}${w.sql}${order}${lim ? ' limit ' + Number(lim) : ''}`, w.werte)
        return json(r.rows)
      }
      if (methode === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')); const zeilen = Array.isArray(body) ? body : [body]
        if (!zeilen.length) return json([], 201)
        const spalten = Object.keys(zeilen[0]); const werte: unknown[] = []
        const values = zeilen.map((z) => '(' + spalten.map((s) => { werte.push(wert(t, s, z[s])); return '$' + werte.length }).join(', ') + ')').join(', ')
        const konflikt = u.searchParams.get('on_conflict')
        const upsert = konflikt && prefer.includes('merge-duplicates') ? ` on conflict (${konflikt.split(',').map(ident).join(', ')}) do update set ${spalten.map((s) => `${ident(s)} = excluded.${ident(s)}`).join(', ')}` : ''
        const r = await pool.query(`insert into public.${tabelle} (${spalten.map(ident).join(', ')}) values ${values}${upsert} returning *`, werte)
        return prefer.includes('return=representation') ? json(r.rows, 201) : new Response(null, { status: 201 })
      }
      if (methode === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}')); const spalten = Object.keys(body); const werte = spalten.map((s) => wert(t, s, body[s]))
        const w = where(u.searchParams, werte.length)
        const r = await pool.query(`update public.${tabelle} set ${spalten.map((s, i) => `${ident(s)} = $${i + 1}`).join(', ')}${w.sql} returning *`, [...werte, ...w.werte])
        return prefer.includes('return=representation') ? json(r.rows) : new Response(null, { status: 204 })
      }
      if (methode === 'DELETE') {
        const w = where(u.searchParams, 0)
        const r = await pool.query(`delete from public.${tabelle}${w.sql} returning *`, w.werte)
        return prefer.includes('return=representation') ? json(r.rows) : new Response(null, { status: 204 })
      }
      return json({ message: 'Methode nicht unterstützt' }, 405)
    } catch (e: any) { return fehler(e) }
  }
}
