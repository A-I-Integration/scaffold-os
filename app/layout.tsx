import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import SidebarLayout from "@/components/SidebarLayout"

const inter = Inter({ subsets: ["latin"] })

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
        <SidebarLayout>{children}</SidebarLayout>
      </body>
    </html>
  )
}