// Dateiname für das gespeicherte Bild der 3D-Ansicht, z. B. „CAD-Ansicht-Praesentation-2026-10-23.png“.
export function ansichtDateiname(farbModus: string, datum: Date): string {
  const modus = farbModus === 'praesentation' ? 'Praesentation' : farbModus === 'bauteil' ? 'Nach-Bauteil' : farbModus === 'statik' ? 'Statik' : 'Real'
  const tag = `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, '0')}-${String(datum.getDate()).padStart(2, '0')}`
  return `CAD-Ansicht-${modus}-${tag}.png`
}
