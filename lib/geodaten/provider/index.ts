import type { GebaeudeProvider } from '@/lib/geodaten/typen'
import { erstelleNrwProvider } from '@/lib/geodaten/provider/nrw'

/** Alle verfügbaren Provider. Weitere Länder: neue Datei in diesem Ordner + hier eintragen (erst nach Lizenzklärung). */
export function alleProvider(): GebaeudeProvider[] { return [erstelleNrwProvider()] }

export function providerFuerBundesland(land: string | null | undefined, liste: GebaeudeProvider[] = alleProvider()): GebaeudeProvider | null {
  if (!land) return null
  const l = land.trim().toLowerCase()
  return liste.find((p) => p.bundeslaender.some((b) => b.toLowerCase() === l)) ?? null
}
