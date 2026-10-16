import type { Metadata } from 'next';

// Öffentliche Nur-Lese-Ansicht: nicht in Suchmaschinen aufnehmen.
export const metadata: Metadata = {
  title: '3D-Ansicht · SCAFFOLD OS',
  robots: { index: false, follow: false },
};

export default function AnsichtLayout({ children }: { children: React.ReactNode }) {
  return children;
}
