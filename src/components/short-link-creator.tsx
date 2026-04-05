"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import {
  createClientErrorReporter,
  getResponseErrorMessage,
  getUserFacingErrorMessage,
  readOptionalJson,
} from "@/lib/client-feedback"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SHORT_LINK_EXPIRES_IN_OPTIONS, type ShortLinkExpiresIn } from "@/lib/short-link-expiration"
import { toast } from "sonner"
import { Scissors, Copy, ExternalLink, LogIn, X } from "lucide-react"
import Link from "next/link"

interface ShortDomainOption {
  host: string
  isDefault: boolean
}

interface DomainsResponse {
  shortDomains: ShortDomainOption[]
}

interface CreatorUser {
  name: string
  email: string
  image?: string | null
  role?: string
}

interface ShortenResult {
  shortUrl: string
  slug: string
  domain: string
  maxClicks?: number
}

type ShortLinkCreatorMode = "homepage" | "dashboard"

interface ShortLinkCreatorProps {
  user: CreatorUser | null
  onCreated?: (result: ShortenResult) => void | Promise<void>
  mode?: ShortLinkCreatorMode
}

const shortLinkCreatorReporter = createClientErrorReporter("short_link_creator")

const creatorModeMeta: Record<
  ShortLinkCreatorMode,
  {
    showContainer: boolean
    getTitle: (user: CreatorUser | null) => string
    getDescription: (user: CreatorUser | null) => string
    showLoginHint: boolean
  }
> = {
  homepage: {
    showContainer: false,
    getTitle: () => "快速创建短链",
    getDescription: (user) =>
      user
        ? "输入长链接后即可快速生成短链；你当前已登录，也可以继续使用更多高级规则。"
        : "先快速生成可分享的短链；登录后再按需启用自定义后缀、有效期和访问限制。",
    showLoginHint: true,
  },
  dashboard: {
    showContainer: true,
    getTitle: () => "创建短链",
    getDescription: () => "粘贴长链接并设置可选项；创建后的短链会显示在右侧，方便继续管理。",
    showLoginHint: false,
  },
}

export function ShortLinkCreator({
  user,
  onCreated,
  mode = "dashboard",
}: ShortLinkCreatorProps) {
  const isHomepageMode = mode === "homepage"
  const modeMeta = creatorModeMeta[mode]
  const resolvedTitle = modeMeta.getTitle(user)
  const resolvedDescription = modeMeta.getDescription(user)
  const resolvedShowLoginHint = modeMeta.showLoginHint
  const showContainer = modeMeta.showContainer
  const submitLabel = isHomepageMode ? "立即生成短链" : "创建短链"
  const loginCtaLabel = isHomepageMode ? "登录后解锁更多能力" : "登录后使用更多选项"
  const successHint = isHomepageMode
    ? "现在可以复制短链、立即打开验证，或继续缩短下一条链接。"
    : "现在可以复制短链、打开测试，或继续创建下一条。"
  const anonymousResultHint = user
    ? null
    : isHomepageMode
      ? "匿名创建的链接会使用默认域名，并受访问次数限制。登录后可自定义更多规则。"
      : "匿名创建的链接会使用默认域名，并受访问次数限制。登录后可自定义更多规则。"

  const [url, setUrl] = useState("")
  const [customSlug, setCustomSlug] = useState("")
  const [maxClicks, setMaxClicks] = useState<string>("")
  const [expiresIn, setExpiresIn] = useState<ShortLinkExpiresIn | "none">("none")
  const [showOptions, setShowOptions] = useState(false)
  const [result, setResult] = useState<ShortenResult | null>(null)
  const [domainsLoading, setDomainsLoading] = useState(false)
  const [shortDomains, setShortDomains] = useState<ShortDomainOption[]>([])
  const [selectedDomain, setSelectedDomain] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!user) return

    let cancelled = false
    setDomainsLoading(true)

    void (async () => {
      try {
        const res = await fetch("/api/domains")
        const body = await readOptionalJson<DomainsResponse & { error?: string }>(res)
        if (!res.ok) {
          shortLinkCreatorReporter.warn("fetch_domains_failed_response", { status: res.status })
          if (!cancelled) {
            toast.error(getResponseErrorMessage(body, "加载短链域名失败"))
          }
          return
        }

        if (cancelled) return
        const domains = body?.shortDomains || []
        setShortDomains(domains)
        setSelectedDomain((current) => current || domains.find((item) => item.isDefault)?.host || domains[0]?.host || "")
      } catch (error) {
        shortLinkCreatorReporter.report("fetch_domains_failed_exception", error)
        if (!cancelled) {
          toast.error(getUserFacingErrorMessage(error, "加载短链域名失败"))
        }
      } finally {
        if (!cancelled) {
          setDomainsLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  const canSubmit = useMemo(() => {
    if (!url.trim()) return false
    if (user && !domainsLoading && shortDomains.length < 1) return false
    if (user && shortDomains.length > 0 && !selectedDomain) return false
    return true
  }, [domainsLoading, selectedDomain, shortDomains.length, url, user])

  function handleUrlChange(value: string) {
    setUrl(value)
    setShowOptions(!!value.trim())
    if (!value.trim()) setResult(null)
  }

  function handleShorten() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/shorten", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: url.trim(),
            customSlug: customSlug.trim() || undefined,
            domain: user ? selectedDomain || undefined : undefined,
            maxClicks: maxClicks ? parseInt(maxClicks, 10) : undefined,
            expiresIn: expiresIn === "none" ? undefined : expiresIn,
          }),
        })
        const data = await readOptionalJson<ShortenResult & { error?: string }>(res)
        if (!res.ok) {
          shortLinkCreatorReporter.warn("create_short_link_failed_response", {
            status: res.status,
            isAuthenticated: Boolean(user),
          })
          toast.error(getResponseErrorMessage(data, "创建短链失败"))
          return
        }
        if (!data) {
          toast.error("创建短链失败")
          return
        }
        setResult(data)
        toast.success("短链已创建")
        await onCreated?.(data)
      } catch (error) {
        shortLinkCreatorReporter.report("create_short_link_failed_exception", error, {
          isAuthenticated: Boolean(user),
        })
        toast.error(getUserFacingErrorMessage(error, "创建短链失败，请稍后重试"))
      }
    })
  }

  async function handleCopy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.shortUrl)
      toast.success("短链已复制")
    } catch (error) {
      shortLinkCreatorReporter.report("copy_short_link_failed_exception", error)
      toast.error(getUserFacingErrorMessage(error, "复制失败，请手动复制"))
    }
  }

  function handleReset() {
    setUrl("")
    setCustomSlug("")
    setMaxClicks("")
    setExpiresIn("none")
    setShowOptions(false)
    setResult(null)
  }

  const content = (
    <div className={`flex w-full flex-col gap-4 ${showContainer ? "max-w-none" : "max-w-2xl"}`}>
      <div className="space-y-2">
        <Input
          id="short-link-url"
          type="url"
          placeholder="粘贴需要缩短的长链接"
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && showOptions) handleShorten()
          }}
          className="h-12 text-base"
          autoFocus={!showContainer}
        />
      </div>

      {showOptions && (
        <div className="animate-in fade-in slide-in-from-top-1 flex flex-col gap-4 rounded-lg border bg-muted/20 p-4 duration-200">
          {user ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="short-link-domain" className="text-sm font-medium">短链域名</label>
                  <Select value={selectedDomain} onValueChange={setSelectedDomain} disabled={domainsLoading || shortDomains.length < 1}>
                    <SelectTrigger id="short-link-domain" aria-label="短链域名" className="h-10 w-full bg-background">
                      <SelectValue placeholder={domainsLoading ? "加载短链域名中..." : "选择短链域名"} />
                    </SelectTrigger>
                    <SelectContent>
                      {shortDomains.map((domain) => (
                        <SelectItem key={domain.host} value={domain.host}>
                          {domain.host}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">默认使用管理员配置的短链域名；你也可以在这里切换到其他可用域名。</p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="short-link-custom-slug" className="text-sm font-medium">自定义后缀</label>
                  <Input
                    id="short-link-custom-slug"
                    placeholder="例如：summer-sale"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value)}
                    className="h-10 bg-background"
                    maxLength={50}
                  />
                  <p className="text-xs text-muted-foreground">不填写时系统会自动生成；适合活动页、品牌词或便于记忆的链接。</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="short-link-max-clicks" className="text-sm font-medium">最大点击次数</label>
                  <Input
                    id="short-link-max-clicks"
                    type="number"
                    placeholder="不填则不限制"
                    value={maxClicks}
                    onChange={(e) => setMaxClicks(e.target.value)}
                    className="h-10 bg-background"
                    min="1"
                  />
                  <p className="text-xs text-muted-foreground">适合限量传播、一次性口令或需要在达到阈值后自动失效的场景。</p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="short-link-expires-in" className="text-sm font-medium">有效期</label>
                  <Select
                    value={expiresIn}
                    onValueChange={(value) => setExpiresIn(value as ShortLinkExpiresIn | "none")}
                  >
                    <SelectTrigger id="short-link-expires-in" aria-label="有效期" className="h-10 w-full bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不设置有效期</SelectItem>
                      {SHORT_LINK_EXPIRES_IN_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">适合短期活动、临时分享或需要自动回收的链接。</p>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed bg-background px-4 py-3 text-sm text-center text-muted-foreground">
              登录后可获取个性化短链接、临时邮箱等高级功能。
            </div>
          )}

          {!result && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={handleShorten}
                disabled={isPending || !canSubmit}
                className="h-10 flex-1"
              >
                <Scissors className="h-4 w-4" />
                {isPending ? "创建中..." : submitLabel}
              </Button>
              {!user && (
                <Button variant="outline" asChild className="h-10 shrink-0">
                  <Link href="/login">
                    <LogIn className="h-4 w-4" />
                    {loginCtaLabel}
                  </Link>
                </Button>
              )}
            </div>
          )}

          {user && !domainsLoading && shortDomains.length < 1 && (
            <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              当前没有可用的短链域名，请先让管理员启用短链域名后再创建。
            </div>
          )}

          {result && (
            <div className="space-y-3 rounded-lg border bg-background p-4">
              <div>
                <p className="text-sm font-medium">短链已创建</p>
                <p className="mt-1 text-xs text-muted-foreground">{successHint}</p>
              </div>
              <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 px-3 py-3 sm:flex-row sm:items-center">
                <a
                  href={result.shortUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline"
                >
                  {result.shortUrl}
                </a>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                    <Copy className="h-4 w-4" />
                    复制
                  </Button>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={result.shortUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      打开
                    </a>
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
                    <X className="h-4 w-4" />
                    继续新建
                  </Button>
                </div>
              </div>
              {anonymousResultHint && (
                <p className="text-xs text-muted-foreground">{anonymousResultHint}</p>
              )}
              {!user && result.maxClicks && (
                <p className="text-xs font-medium text-destructive">
                  匿名用户生成的链接在 {result.maxClicks} 次访问后失效，登录后可解除该限制。
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {!user && !showOptions && resolvedShowLoginHint && (
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground hover:underline">
            登录
          </Link>{" "}
          后可获取个性化短链接、临时邮箱等高级功能。
        </p>
      )}
    </div>
  )

  if (!showContainer) {
    return content
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{resolvedTitle}</CardTitle>
        <CardDescription>{resolvedDescription}</CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}
