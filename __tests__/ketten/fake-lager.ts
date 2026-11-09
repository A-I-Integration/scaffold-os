// Nachbau des NEUEN Lagers (bestand/lagerorte + buche_lager) im Speicher für Kettentests, ergänzend zu fake-rest.
// Die echte Datenbanklogik (Sperren, Regeln, Storno, Parallelität) ist separat gegen echtes Postgres getestet
// (supabase/tests/phase-108/109/110). Hier geht es um den Vertrag: was die Buchungsfunktionen senden und wie sie auf Antworten reagieren.
import { baueFakeRest, type Tabellen } from './fake-rest'

type Pos = { inventory_id: string; menge: number; von_lagerort?: string; von_zustand?: string; nach_lagerort?: string; nach_zustand?: string }

export function baueFakeRestMitLager(daten: Tabellen) {
  const basis = baueFakeRest(daten)
  const HAUPT = 'ort-haupt'
  const bestand = new Map<string, number>() // `${inv}|${ort}|${zustand}`
  const orte: { id: string; typ: string; schluessel?: string; project_id?: string }[] = [{ id: HAUPT, typ: 'standort', schluessel: 'HAUPTLAGER' }]
  const k = (i: string, o: string, z: string) => `${i}|${o}|${z}`
  const ortFuer = (p: string) => {
    let o = orte.find((x) => x.project_id === p)
    if (!o) { o = { id: `ort-${p}`, typ: 'baustelle', project_id: p }; orte.push(o) }
    return o
  }
  for (const i of daten.inventory ?? []) if (Number(i.quantity) > 0) bestand.set(k(String(i.id), HAUPT, 'frei'), Number(i.quantity))
  for (const s of daten.site_stock ?? []) {
    const o = ortFuer(String(s.project_id))
    if (Number(s.quantity) > 0) bestand.set(k(String(s.inventory_id), o.id, 'frei'), (bestand.get(k(String(s.inventory_id), o.id, 'frei')) ?? 0) + Number(s.quantity))
    if (Number(s.reserved_quantity) > 0) bestand.set(k(String(s.inventory_id), o.id, 'reserviert'), (bestand.get(k(String(s.inventory_id), o.id, 'reserviert')) ?? 0) + Number(s.reserved_quantity))
  }

  // Altfelder nachführen wie altfeld_anpassen()
  const altfeld = (inv: string, ort: string, zustand: string, delta: number) => {
    const o = orte.find((x) => x.id === ort)!
    if (o.typ === 'standort' && zustand === 'frei') {
      const i = daten.inventory.find((x) => x.id === inv)!
      i.quantity = Math.max(0, Number(i.quantity) + delta)
    } else if (o.typ === 'baustelle' && (zustand === 'frei' || zustand === 'reserviert')) {
      const spalte = zustand === 'frei' ? 'quantity' : 'reserved_quantity'
      daten.site_stock = daten.site_stock ?? []
      const zeilen = daten.site_stock.filter((s) => s.inventory_id === inv && s.project_id === o.project_id)
      if (delta > 0) {
        if (zeilen.length) zeilen[0][spalte] = Number(zeilen[0][spalte] ?? 0) + delta
        else daten.site_stock.push({ id: `site_stock-n${daten.site_stock.length + 1}`, inventory_id: inv, project_id: o.project_id, quantity: spalte === 'quantity' ? delta : 0, reserved_quantity: spalte === 'reserved_quantity' ? delta : 0 })
      } else {
        let rest = -delta
        for (const z of zeilen) { const n = Math.min(rest, Number(z[spalte] ?? 0)); z[spalte] = Number(z[spalte] ?? 0) - n; rest -= n }
      }
    }
  }

  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
  const handler = async (eingabe: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const u = new URL(String(eingabe))
    const pfad = u.pathname.split('/rest/v1/')[1]
    const methode = (init?.method ?? 'GET').toUpperCase()
    if (pfad === 'lagerorte' && methode === 'GET') {
      const sk = u.searchParams.get('schluessel')?.replace(/^eq\./, '')
      return json(orte.filter((o) => !sk || o.schluessel === sk).map((o) => ({ id: o.id, typ: o.typ })))
    }
    if (pfad === 'bestand' && methode === 'GET') {
      const f = (n: string) => u.searchParams.get(n)?.replace(/^eq\./, '')
      const rows = [...bestand.entries()].map(([key, menge]) => { const [inventory_id, lagerort_id, zustand] = key.split('|'); return { inventory_id, lagerort_id, zustand, menge } })
        .filter((r) => r.menge > 0 && (!f('inventory_id') || r.inventory_id === f('inventory_id')) && (!f('lagerort_id') || r.lagerort_id === f('lagerort_id')) && (!f('zustand') || r.zustand === f('zustand')))
      return json(rows)
    }
    if (pfad === 'rpc/lagerort_fuer_projekt') return json(ortFuer(JSON.parse(String(init?.body)).p_project).id)
    if (pfad === 'rpc/buche_lager') {
      const a = JSON.parse(String(init?.body))
      const pos = a.p_positionen as Pos[]
      const probe = new Map(bestand)
      for (const p of pos) {
        if (p.von_lagerort) {
          const have = probe.get(k(p.inventory_id, p.von_lagerort, p.von_zustand!)) ?? 0
          if (have < p.menge) return json({ message: `Nicht genug Bestand: vorhanden ${have}, benötigt ${p.menge}.` }, 400)
          probe.set(k(p.inventory_id, p.von_lagerort, p.von_zustand!), have - p.menge)
        }
      }
      for (const p of pos) {
        if (p.von_lagerort) { bestand.set(k(p.inventory_id, p.von_lagerort, p.von_zustand!), (bestand.get(k(p.inventory_id, p.von_lagerort, p.von_zustand!)) ?? 0) - p.menge); altfeld(p.inventory_id, p.von_lagerort, p.von_zustand!, -p.menge) }
        if (p.nach_lagerort) { bestand.set(k(p.inventory_id, p.nach_lagerort, p.nach_zustand!), (bestand.get(k(p.inventory_id, p.nach_lagerort, p.nach_zustand!)) ?? 0) + p.menge); altfeld(p.inventory_id, p.nach_lagerort, p.nach_zustand!, p.menge) }
      }
      ;(daten.materialbelege = daten.materialbelege ?? []).push({ bewegungsart: a.p_bewegungsart, project_id: a.p_project, positionen: pos, referenz_typ: a.p_referenz_typ })
      return json('beleg-' + daten.materialbelege.length)
    }
    if (pfad === 'rpc/storniere_lager') {
      const a = JSON.parse(String(init?.body))
      const b = (daten.materialbelege ?? [])[Number(String(a.p_beleg).replace('beleg-', '')) - 1]
      if (!b) return json({ message: 'Beleg nicht gefunden.' }, 400)
      const umgekehrt = (b.positionen as Pos[]).map((p) => ({ inventory_id: p.inventory_id, menge: p.menge, von_lagerort: p.nach_lagerort, von_zustand: p.nach_zustand, nach_lagerort: p.von_lagerort, nach_zustand: p.von_zustand }))
      return handler('http://x/rest/v1/rpc/buche_lager', { method: 'POST', body: JSON.stringify({ p_bewegungsart: 'ST', p_positionen: umgekehrt, p_project: b.project_id }) })
    }
    return basis(eingabe, init)
  }
  return handler
}
