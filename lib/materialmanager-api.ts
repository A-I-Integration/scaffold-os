import { z } from 'zod'

// Prüfung der Abschnitte, die der Materialmanager speichert (gleiche Regeln für API und Tests).
export const MAX_ABSCHNITTE = 30
export const abschnittSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1, 'Jeder Abschnitt braucht einen Namen.').max(60),
  mengen: z.record(z.string().min(1).max(200), z.number().finite().min(0).max(1_000_000)),
})
export const abschnitteSchema = z.array(abschnittSchema).max(MAX_ABSCHNITTE).superRefine((liste, ctx) => {
  const ids = new Set<string>()
  liste.forEach((a, i) => {
    if (ids.has(a.id)) ctx.addIssue({ code: 'custom', message: 'Abschnitts-IDs müssen eindeutig sein.', path: [i, 'id'] })
    ids.add(a.id)
  })
})
