import { auth } from "@/lib/auth"
import { initDb } from "@/lib/db"
import { getAvatarUrl } from "@/lib/gravatar"
import { resolveCanonicalAppUrl } from "@/lib/http"
import { getSiteSettings } from "@/lib/site-settings"
import { UrlShortener } from "@/components/url-shortener"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Copyright, Github } from "lucide-react"

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const headersList = await headers()
  const canonicalAppUrl = resolveCanonicalAppUrl(headersList)

  if (canonicalAppUrl) {
    const targetUrl = new URL(canonicalAppUrl)
    const homepageSearchParams = await searchParams

    for (const [key, value] of Object.entries(homepageSearchParams)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          targetUrl.searchParams.append(key, item)
        }
        continue
      }

      if (value !== undefined) {
        targetUrl.searchParams.set(key, value)
      }
    }

    redirect(targetUrl.toString())
  }

  await initDb()
  const [settings, session] = await Promise.all([
    getSiteSettings(),
    auth.api.getSession({ headers: headersList }),
  ])
  const siteName = settings?.siteName?.trim() || "Shortly"
  const user = session?.user
    ? {
      name: session.user.name,
      email: session.user.email,
      image: getAvatarUrl(session.user.email, session.user.image),
      role: (session.user as { role?: string }).role,
    }
    : null

  return (
    <main className="relative flex min-h-screen flex-col px-4 py-8 sm:py-10">
      <div className="flex items-center justify-end">
        {user ? (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
              <Link href="/dashboard?tab=temp-email">临时邮箱</Link>
            </Button>
            <UserMenu user={user} />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
              <Link href="/login">登录</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">注册</Link>
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center py-10 sm:py-16">
        <UrlShortener user={user} siteName={siteName} />
      </div>

      <footer className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground/80">
        <span className="inline-flex items-center gap-1">
          <Copyright className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{new Date().getFullYear()} {siteName}.</span>
        </span>
        <Link
          href="https://github.com/uvexz/shortly"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline"
        >
          <Github className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Open Source</span>
        </Link>
      </footer>
    </main>
  )
}
