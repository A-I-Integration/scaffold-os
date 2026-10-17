import type { Metadata } from 'next'

// Statiker-Bereich: nie von Suchmaschinen erfassen
export const metadata: Metadata = {
  title: 'Statiker-Bereich',
  robots: { index: false, follow: false },
}

export default function StatikerLayout({ children }: { children: React.ReactNode }) {
  return children
}
