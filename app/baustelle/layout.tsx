import type { Metadata } from 'next';

// Öffentliche Baustellenmappe (QR-Code am Gerüst): nicht in Suchmaschinen aufnehmen.
export const metadata: Metadata = {
  title: 'Baustellenunterlagen · SCAFFOLD OS',
  robots: { index: false, follow: false },
};

export default function BaustelleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
