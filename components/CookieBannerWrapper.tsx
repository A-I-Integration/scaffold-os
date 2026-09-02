'use client'

// CookieBannerWrapper.tsx – Client Component Wrapper
//
// Warum nötig: next/dynamic mit ssr:false darf NICHT direkt in
// Server Components (App Router) verwendet werden. Dieser Wrapper
// ist eine Client Component und kapselt den dynamic() Import.
// ============================================================

import dynamic from 'next/dynamic'

const CookieBanner = dynamic(() => import('@/components/CookieBanner'), {
  ssr: false,
  loading: () => null,
})

export default function CookieBannerWrapper() {
  return <CookieBanner />
}
