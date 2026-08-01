import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import AuthNav from "@/components/AuthNav"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "SCAFFOLD OS",
  description: "Digitales Aufmaß & KI-Planung",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="de">
      <body className={inter.className}>
        <AuthNav />
        {children}
      </body>
    </html>
  )
}