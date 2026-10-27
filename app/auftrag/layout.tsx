import type { Metadata } from 'next';

// Öffentlicher Auftragsstand für den Auftraggeber: nicht in Suchmaschinen aufnehmen.
export const metadata: Metadata = {
  title: 'Auftragsstand · SCAFFOLD OS',
  robots: { index: false, follow: false },
};

export default function AuftragLayout({ children }: { children: React.ReactNode }) {
  return children;
}
