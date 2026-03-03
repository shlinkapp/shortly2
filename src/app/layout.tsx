import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"
import { db, initDb } from "@/lib/db"
import { siteSetting } from "@/lib/schema"
import { eq } from "drizzle-orm"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export async function generateMetadata(): Promise<Metadata> {
  await initDb()
  const settings = await db
    .select({ siteName: siteSetting.siteName })
    .from(siteSetting)
    .where(eq(siteSetting.id, "default"))
    .get()

  return {
    title: settings?.siteName || "Shortly",
    description: "Simple URL shortener",
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
