import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import Script from "next/script"
import "./globals.css"
import SidebarLayout from "@/components/SidebarLayout"

const inter = Inter({ subsets: ["latin"] })

// Google-Ads-Tag (Conversion-Tracking) – lädt NUR dort, wo die Env-Var
// NEXT_PUBLIC_GOOGLE_ADS_ID gesetzt ist (= ausschließlich Master-Instanz
// scaffoldos.de). Kunden-Instanzen ohne diese Variable bleiben frei von
// Werbe-Tracking. Consent Mode: standardmäßig „denied" (DSGVO) – erst mit
// Cookie-Einwilligung werden Marketing-Cookies gesetzt.
const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID

export const metadata: Metadata = {
  title: "SCAFFOLD OS",
  description: "Die digitale Baustellenverwaltung für den Gerüstbau",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SCAFFOLD OS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#fbfbfd",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="de">
      <body className={inter.className}>
        {googleAdsId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${googleAdsId}`}
              strategy="afterInteractive"
            />
            <Script id="google-ads-tag" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('consent', 'default', {
                  ad_storage: 'denied',
                  ad_user_data: 'denied',
                  ad_personalization: 'denied',
                  analytics_storage: 'denied',
                });
                gtag('config', '${googleAdsId}');
              `}
            </Script>
          </>
        )}
        <SidebarLayout>{children}</SidebarLayout>
      </body>
    </html>
  )
}