// ============================================================
// SCAFFOLD OS – Nachträge serverseitig ändern, ohne dass gleichzeitige Änderungen verloren gehen
//
// Ablauf je Änderung: Liste + Versionsnummer lesen → Änderung anwenden → per nachtraege_setzen (SQL, phase-114) nur dann
// schreiben, wenn die Version noch stimmt; sonst frisch lesen und erneut (höchstens MAX_VERSUCHE). Bleibt der Konflikt,
// meldet der Aufrufer „bitte erneut versuchen“ – es wird nie still überschrieben.
// ============================================================
import { z } from 'zod'
import {
  neuerNachtrag, normalisiereNachtraege, setzeNachtragBetrag, setzeNachtragStatus,
  type Nachtrag,
} from '@/lib/nachtrag'

export const MAX_VERSUCHE = 6

const foto = z.object({ url: z.string().url().max(2000), file_name: z.string().max(200) })
const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const verlaengerung = z.object({ wochen: z.number().finite().min(0).max(1000), preisProWoche: z.number().finite().min(0).max(1e7), bis: datum.optional() })
const regie = z.array(z.object({
  bezeichnung: z.string().max(200), personen: z.number().finite().min(0).max(1000), stunden: z.number().finite().min(0).max(10000), satz: z.number().finite().min(0).max(10000),
})).max(50)

export const nachtragOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('anlegen'), id: z.string().uuid(),
    datum, titel: z.string().trim().min(1).max(300), grund: z.string().max(2000),
    betrag: z.number().finite().min(0).max(1e8), fotos: z.array(foto).max(20).default([]),
    vorOrt: z.boolean().optional(), art: z.enum(['verlaengerung', 'regie']).optional(), verlaengerung: verlaengerung.optional(), regie: regie.optional(),
  }),
  z.object({ op: z.literal('status'), id: z.string().min(1).max(80), status: z.enum(['offen', 'bestaetigt', 'abgelehnt']) }),
  z.object({ op: z.literal('betrag'), id: z.string().min(1).max(80), betrag: z.number().finite().gt(0).max(1e8) }),
  z.object({ op: z.literal('loeschen'), id: z.string().min(1).max(80) }),
])
export type NachtragOp = z.infer<typeof nachtragOpSchema>

export class NachtragFehler extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

/** Wendet die Änderung auf die frisch gelesene Liste an (rein). Wirft NachtragFehler bei unzulässigen Änderungen. */
export function wendeNachtragOpAn(aktuell: Nachtrag[], op: NachtragOp, heute: string, jetzt: Date = new Date()): Nachtrag[] {
  switch (op.op) {
    case 'anlegen': {
      if (aktuell.some((n) => n.id === op.id)) return aktuell // doppelt abgeschickt (Doppelklick, Wiederholung): nichts zweimal anlegen
      const { op: _o, id, ...eingabe } = op
      void _o
      return [...aktuell, neuerNachtrag(aktuell, eingabe, id, jetzt)]
    }
    case 'status': {
      if (!aktuell.some((n) => n.id === op.id)) throw new NachtragFehler('Dieser Nachtrag existiert nicht mehr.', 404)
      return setzeNachtragStatus(aktuell, op.id, op.status, heute)
    }
    case 'betrag': {
      const n = aktuell.find((x) => x.id === op.id)
      if (!n) throw new NachtragFehler('Dieser Nachtrag existiert nicht mehr.', 404)
      if (n.status !== 'offen') throw new NachtragFehler('Der Betrag lässt sich nur bei offenen Nachträgen ändern.', 409)
      return setzeNachtragBetrag(aktuell, op.id, op.betrag)
    }
    case 'loeschen': {
      const n = aktuell.find((x) => x.id === op.id)
      if (!n) return aktuell // schon gelöscht
      if (n.status !== 'offen') throw new NachtragFehler('Nur offene Nachträge lassen sich löschen.', 409)
      return aktuell.filter((x) => x.id !== op.id)
    }
  }
}

const conf = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return { url, headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` } }
}

/** Führt die Änderung mit Versionsprüfung aus und liefert die neue Liste. */
export async function aendereNachtraege(projectId: string, op: NachtragOp, heute: string): Promise<Nachtrag[]> {
  const { url, headers } = conf()
  for (let versuch = 0; versuch < MAX_VERSUCHE; versuch++) {
    const res = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=data,nachtraege_version`, { headers })
    if (!res.ok) throw new Error(await res.text())
    const zeile = (await res.json())?.[0] as { data?: { nachtraege?: unknown } | null; nachtraege_version?: number } | undefined
    if (!zeile) throw new NachtragFehler('Auftrag nicht gefunden.', 404)
    const version = Number.isInteger(zeile.nachtraege_version) ? (zeile.nachtraege_version as number) : 0
    const neu = wendeNachtragOpAn(normalisiereNachtraege(zeile.data?.nachtraege), op, heute)

    const set = await fetch(`${url}/rest/v1/rpc/nachtraege_setzen`, {
      method: 'POST', headers, body: JSON.stringify({ p_project: projectId, p_erwartet: version, p_neu: neu }),
    })
    if (!set.ok) throw new Error(await set.text())
    if ((await set.json()) === true) return neu
  }
  throw new NachtragFehler('Gleichzeitig wurde etwas geändert. Bitte noch einmal versuchen.', 409)
}
