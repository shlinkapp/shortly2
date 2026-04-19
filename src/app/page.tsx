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
import { ArrowRight, ChevronRight, Link2, Mail, Sparkles, Zap, ShieldCheck, Globe, BarChart3 } from "lucide-react"

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
    <main className="relative min-h-screen bg-background selection:bg-primary selection:text-primary-foreground">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[88rem] flex-col px-[var(--page-gutter)] py-5 sm:py-6 lg:py-8">
        {/* Navigation */}
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="group flex items-center gap-2 text-xl font-bold tracking-tighter">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform group-hover:scale-105">
              <Zap className="h-5 w-5 fill-current" />
            </div>
            <span className="hidden sm:inline-block text-2xl tracking-[-0.05em]">{siteName}</span>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-6">
            {user ? (
              <>
                <div className="hidden items-center gap-6 md:flex">
                  <Link href="/dashboard?tab=links" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">短链接</Link>
                  <Link href="/dashboard?tab=temp-email" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">临时邮箱</Link>
                </div>
                <div className="h-5 w-px bg-border mx-2 hidden sm:block" />
                <UserMenu user={user} />
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild className="hidden font-bold sm:flex">
                  <Link href="/login">登录</Link>
                </Button>
                <Button size="sm" asChild className="h-10 px-5 font-bold shadow-sm transition-transform hover:-translate-y-0.5 active:scale-95 sm:px-6">
                  <Link href="/register">免费开始</Link>
                </Button>
              </>
            )}
          </nav>
        </header>

        {/* Hero Section */}
        <section className="relative mt-14 flex flex-col items-center text-center sm:mt-20 lg:mt-24">
          <div className="inline-flex animate-in fade-in slide-in-from-top-4 duration-1000 items-center gap-2 rounded-lg border border-primary/10 bg-primary/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-primary sm:text-xs">
            <Sparkles className="h-4 w-4 fill-primary/20" />
            <span>智能链入 · 隐私直达</span>
          </div>

          <h1 className="mt-8 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200 max-w-5xl text-balance text-[clamp(2.75rem,9vw,6rem)] font-[900] leading-[0.92] tracking-[-0.055em] sm:mt-10 lg:leading-[0.88]">
            Redefine <br />
            <span className="text-primary">Efficiency.</span>
          </h1>

          <p className="mt-6 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300 max-w-[42rem] text-pretty text-base font-medium leading-relaxed text-muted-foreground sm:mt-8 sm:text-xl lg:text-2xl">
            提供简单、快速、极致隐私的链接压缩与临时邮箱工具。
            一处入口，全能管理。
          </p>

          <div className="mt-8 flex w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500 flex-col gap-3 sm:mt-10 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
            {user ? (
              <Button size="lg" asChild className="h-12 px-7 text-base font-black shadow-lg shadow-primary/10 transition-transform hover:-translate-y-1 active:scale-95 sm:h-14 sm:px-9 sm:text-lg">
                <Link href="/dashboard">
                  进入系统控制台
                  <ArrowRight className="ml-2 h-6 w-6" />
                </Link>
              </Button>
            ) : (
              <>
                <Button size="lg" asChild className="h-12 px-7 text-base font-black shadow-lg shadow-primary/10 transition-transform hover:-translate-y-1 active:scale-95 sm:h-14 sm:px-9 sm:text-lg">
                  <Link href="/register">
                    立即免费加入
                    <ArrowRight className="ml-2 h-6 w-6" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild className="h-12 border px-7 text-base font-black transition-transform hover:-translate-y-1 active:scale-95 sm:h-14 sm:px-9 sm:text-lg">
                  <Link href="/login">了解产品特性</Link>
                </Button>
              </>
            )}
          </div>
        </section>

        {/* Trust Section */}
        <section className="mt-14 animate-in fade-in zoom-in-95 duration-1000 delay-700 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:mt-16 sm:gap-x-10">
          <div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5" /> 隐私保护</div>
          <div className="flex items-center gap-2 font-bold"><Globe className="h-5 w-5" /> 全球分发</div>
          <div className="flex items-center gap-2 font-bold"><BarChart3 className="h-5 w-5" /> 精准数据分析</div>
          <div className="flex items-center gap-2 font-bold"><Zap className="h-5 w-5" /> 毫秒级响应</div>
        </section>

        {/* Features Section - Asymmetric Bento-style Layout */}
        <section className="mt-16 grid gap-5 sm:mt-24 sm:gap-6 lg:mt-28 lg:grid-cols-12">
          {/* Main Feature: Short Link */}
          <article className="group relative col-span-12 flex flex-col overflow-hidden rounded-xl border bg-card/70 p-5 transition-shadow hover:shadow-sm sm:p-8 lg:p-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
              <div className="max-w-xl">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm sm:h-14 sm:w-14">
                  <Link2 className="h-8 w-8" />
                </div>
                <h2 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">智能短链接</h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg lg:text-xl">
                  不仅仅是缩短链接。支持自定义后缀、可视化数据分析、点击限制及过期自动作废，让您的每一条分享都尽在掌控。
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-primary/10 px-3 py-1.5 text-xs font-black text-primary uppercase tracking-tighter">自定义后缀</span>
                  <span className="rounded-md bg-primary/10 px-3 py-1.5 text-xs font-black text-primary uppercase tracking-tighter">数据统计</span>
                  <span className="rounded-md bg-primary/10 px-3 py-1.5 text-xs font-black text-primary uppercase tracking-tighter">自动过期</span>
                </div>
              </div>
              <div className="w-full flex-shrink-0 lg:max-w-sm">
                <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-background/50 p-5 shadow-inner sm:p-6">
                   <div className="space-y-4">
                      <div className="h-2 w-1/2 rounded bg-muted animate-pulse" />
                      <div className="h-8 w-full rounded-lg bg-primary/5 border border-dashed border-primary/20 flex items-center px-4 font-mono text-xs text-primary">Shortly.link/XyZ7_</div>
                      <div className="h-2 w-full rounded bg-muted" />
                      <div className="h-2 w-3/4 rounded bg-muted" />
                      <div className="pt-4 flex justify-between">
                         <div className="h-8 w-8 rounded-full bg-primary/10" />
                         <div className="h-8 w-8 rounded-full bg-primary/10" />
                         <div className="h-8 w-24 rounded-full bg-primary shadow-sm" />
                      </div>
                   </div>
                </div>
              </div>
            </div>
            <div className="mt-8 flex items-center gap-2 text-sm font-black text-primary opacity-100 sm:opacity-0 sm:-translate-x-4 sm:transition-all sm:group-hover:translate-x-0 sm:group-hover:opacity-100">
              <span className="uppercase tracking-widest">立即创建您的短链接</span>
              <ChevronRight className="h-5 w-5" />
            </div>
          </article>

          {/* Sub Feature: Temp Mail */}
          <article className="group relative col-span-12 flex flex-col overflow-hidden rounded-xl border bg-card/70 p-5 transition-shadow hover:shadow-sm sm:p-8 lg:p-10">
            <div className="flex flex-col gap-8 lg:flex-row-reverse lg:items-center lg:justify-between lg:gap-12">
              <div className="max-w-xl">
                 <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-sm sm:h-14 sm:w-14">
                  <Mail className="h-8 w-8" />
                </div>
                <h2 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">隐私临时邮箱</h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg lg:text-xl">
                  彻底告别垃圾邮件。快速生成随机邮箱地址，实时在线收信，用于注册测试或临时验证，完美保护您的主邮箱隐私。
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-accent/20 px-3 py-1.5 text-xs font-black text-accent-foreground uppercase tracking-tighter">一键生成</span>
                  <span className="rounded-md bg-accent/20 px-3 py-1.5 text-xs font-black text-accent-foreground uppercase tracking-tighter">实时查收</span>
                  <span className="rounded-md bg-accent/20 px-3 py-1.5 text-xs font-black text-accent-foreground uppercase tracking-tighter">过期自毁</span>
                </div>
              </div>
              <div className="w-full flex-shrink-0 lg:max-w-md">
                 <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-background/50 p-5 shadow-inner sm:p-6">
                    <div className="space-y-4">
                       <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-accent/20" />
                          <div className="h-3 w-32 rounded bg-muted" />
                       </div>
                       <div className="h-4 w-full rounded bg-muted/60" />
                       <div className="h-4 w-5/6 rounded bg-muted/30" />
                       <div className="h-20 w-full rounded-xl border-t border-muted/50 mt-4 bg-muted/5 flex items-center justify-center">
                          <Zap className="h-8 w-8 text-accent/20 animate-pulse" />
                       </div>
                    </div>
                 </div>
              </div>
            </div>
            <div className="mt-8 flex items-center justify-start gap-2 text-sm font-black text-accent-foreground opacity-100 sm:justify-end sm:translate-x-4 sm:opacity-0 sm:transition-all sm:group-hover:translate-x-0 sm:group-hover:opacity-100">
              <span className="uppercase tracking-widest text-primary">立即获取临时邮箱</span>
              <ChevronRight className="h-5 w-5 text-primary" />
            </div>
          </article>
        </section>

        {/* Footer */}
        <footer className="mt-16 border-t py-10 sm:mt-24 sm:py-12 lg:mt-28">
          <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-2xl font-black tracking-tighter uppercase">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Zap className="h-6 w-6 fill-current" />
                </div>
                <span>{siteName}</span>
              </div>
              <p className="text-sm font-medium text-muted-foreground/60 max-w-sm leading-relaxed">
                致力于打造最极致的效率工具体验。开源、透明、隐私优先。由热爱技术的开发者为开发者而设计。
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-x-10 gap-y-10 sm:gap-x-16">
               <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-foreground">项目</h4>
                  <nav className="flex flex-col gap-3 text-sm font-bold text-muted-foreground">
                    <Link href="https://github.com/uvexz/shortly" target="_blank" className="hover:text-primary transition-colors">GitHub 源码</Link>
                    <Link href="#" className="hover:text-primary transition-colors">更新日志</Link>
                    <Link href="#" className="hover:text-primary transition-colors">反馈建议</Link>
                  </nav>
               </div>
               <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-foreground">法律</h4>
                  <nav className="flex flex-col gap-3 text-sm font-bold text-muted-foreground">
                    <Link href="#" className="hover:text-primary transition-colors">隐私政策</Link>
                    <Link href="#" className="hover:text-primary transition-colors">服务条款</Link>
                    <Link href="#" className="hover:text-primary transition-colors">Cookie 说明</Link>
                  </nav>
               </div>
            </div>
          </div>
          <div className="mt-12 flex flex-col gap-6 border-t border-border/60 pt-8 sm:flex-row sm:items-center sm:justify-between">
             <div className="text-[xs] font-bold text-muted-foreground opacity-40">
                © {new Date().getFullYear()} {siteName}. All rights reserved globally.
             </div>
             <div className="flex gap-6 grayscale transition-all hover:grayscale-0">
                <div className="h-6 w-6 rounded bg-muted/20" />
                <div className="h-6 w-6 rounded bg-muted/20" />
                <div className="h-6 w-6 rounded bg-muted/20" />
             </div>
          </div>
        </footer>
      </div>
    </main>
  )
}
