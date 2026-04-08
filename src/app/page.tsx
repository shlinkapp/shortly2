import { auth } from "@/lib/auth"
import { initDb } from "@/lib/db"
import { getAvatarUrl } from "@/lib/gravatar"
import { resolveCanonicalAppUrl } from "@/lib/http"
import { getSiteSettings } from "@/lib/site-settings"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowRight, Copyright, Link2, Mail } from "lucide-react"

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
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="text-sm font-medium tracking-wide text-foreground">
            {siteName}
          </Link>
          {user ? (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
                <Link href="/dashboard?tab=temp-email">临时邮箱</Link>
              </Button>
              <UserMenu user={user} />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
                <Link href="/login">登录</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/register">注册</Link>
              </Button>
            </div>
          )}
        </header>

        <section className="mt-16 space-y-6 sm:mt-20">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">短链接 + 临时邮箱</p>
          <h1 className="max-w-3xl text-balance text-[clamp(2rem,6vw,3.2rem)] font-semibold tracking-[-0.03em]">
            简单、快速、好用的链接与邮箱工具
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            一个页面完成常用能力：创建可管理短链，生成临时邮箱地址，集中查看访问与收信状态。登录后即可在后台统一维护。
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {user ? (
              <>
                <Button asChild>
                  <Link href="/dashboard">
                    进入用户后台
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                {user.role === "admin" && (
                  <Button variant="outline" asChild>
                    <Link href="/admin">进入管理员后台</Link>
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button asChild>
                  <Link href="/login">
                    登录开始使用
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/register">免费注册</Link>
                </Button>
              </>
            )}
          </div>
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border bg-card p-5">
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md border bg-muted/40">
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </div>
            <h2 className="text-base font-medium">短链接</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              生成稳定短链，支持自定义后缀、有效期和点击上限，适合分享、活动与对外投放场景。
            </p>
          </article>

          <article className="rounded-xl border bg-card p-5">
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md border bg-muted/40">
              <Mail className="h-4 w-4" aria-hidden="true" />
            </div>
            <h2 className="text-base font-medium">临时邮箱</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              快速创建临时邮箱地址，集中查看收件内容与来源，减少主邮箱暴露，适合测试和临时验证。
            </p>
          </article>
        </section>

        <footer className="mt-auto pt-14 text-xs text-muted-foreground/80">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <span className="inline-flex items-center gap-1">
              <Copyright className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{new Date().getFullYear()} {siteName}.</span>
            </span>
            <Link
              href="https://github.com/uvexz/shortly"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Open Source
            </Link>
          </div>
        </footer>
      </div>
    </main>
  )
}
