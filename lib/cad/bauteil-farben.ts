// Farben der Gerüst-Bauteile im Farbmodus „Nach Bauteil“ (3D und Legende).
// Jede Bauteilart hat eine eigene, gut unterscheidbare Farbe.

export const BAUTEIL_FARBEN: Record<string, string> = {
  frame: '#2563eb',
  deck: '#f59e0b',
  railing: '#dc2626',
  diagonal: '#7c3aed',
  footplate: '#6b7280',
  coupling: '#0d9488',
  anchor: '#16a34a',
  console: '#db2777',
  stair: '#84cc16',
  net: '#06b6d4',
  safety_net: '#06b6d4',
  sheeting: '#94a3b8',
  elevator: '#f59e0b',
  board: '#92400e',
  protection_roof: '#f97316',
  load_plate: '#78716c',
  ladder: '#0ea5e9',
  corner_brace: '#4f46e5',
}

export type FarbModus = 'real' | 'bauteil' | 'praesentation'

export function bauteilFarbe(type: string): string {
  return BAUTEIL_FARBEN[type] ?? '#888888'
}
