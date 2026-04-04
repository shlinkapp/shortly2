import { auth } from "@/lib/auth"
import { initDb } from "@/lib/db"
import { getAvatarUrl } from "@/lib/gravatar"
import { UrlShortener } from "@/components/url-shortener"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { headers } from "next/headers"
import Link from "next/link"
import { Copyright, Github } from "lucide-react"

export default async function HomePage() {
  await initDb()
  const session = await auth.api.getSession({ headers: await headers() })
  const user = session?.user
    ? {
      name: session.user.name,
      email: session.user.email,
      image: getAvatarUrl(session.user.email, session.user.image),
      role: (session.user as { role?: string }).role,
    }
    : null

  return (
    <main className="relative flex min-h-screen flex-col px-4 py-16">
      <div className="absolute top-4 right-4">
        {user ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard?tab=temp-email">临时邮箱</Link>
            </Button>
            <UserMenu user={user} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">登录</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">注册</Link>
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center">
        <UrlShortener user={user} />
      </div>

      <footer className="fixed right-0 bottom-4 left-0 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Copyright className="h-4 w-4" aria-hidden="true" />
          <span>{new Date().getFullYear()} Shortly.</span>
        </span>
        <Link
          href="https://github.com/shlinkapp/shortly2"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
        >
          <Github className="h-4 w-4" aria-hidden="true" />
          <span>Open Source</span>
        </Link>
      </footer>
    </main>
  )
}
