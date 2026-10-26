import type { Metadata } from 'next';

// Öffentliche Prüfseite für Auftraggeber: nicht in Suchmaschinen aufnehmen.
export const metadata: Metadata = {
  title: 'Rechnung prüfen · SCAFFOLD OS',
  robots: { index: false, follow: false },
};

export default function RechnungPruefenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
