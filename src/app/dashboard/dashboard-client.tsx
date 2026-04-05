"use client"

import { useState, useEffect, useCallback, type ReactNode } from "react"
import { UserMenu } from "@/components/user-menu"
import { ShortLinkCreator } from "@/components/short-link-creator"
import { TempEmailManager } from "@/components/temp-email-manager"
import {
  createClientErrorReporter,
  getResponseErrorMessage,
  getUserFacingErrorMessage,
  readOptionalJson,
} from "@/lib/client-feedback"
import { formatDate } from "@/lib/utils"
import { getLogEventLabel } from "@/lib/log-events"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { Copy, Trash2, BarChart2, ExternalLink, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { PasskeyManager } from "@/components/passkey-manager"
import { ApiManagementPanel } from "@/components/api-management"
import { useMediaQuery } from "@/lib/use-media-query"

interface ShortLink {
  id: string
  slug: string
  domain: string
  shortUrl: string
  originalUrl: string
  clicks: number
  maxClicks: number | null
  expiresAt: string | null
  hasClickLimit: boolean
  hasExpiration: boolean
  isExpired: boolean
  expiredByClicks: boolean
  expiredByDate: boolean
  createdAt: number
}

interface ClickLog {
  id: string
  eventType: string
  referrer: string | null
  userAgent: string | null
  ipAddress: string | null
  statusCode: number | null
  createdAt: number
}

interface DashboardClientProps {
  user: {
    name: string
    email: string
    image?: string | null
    role?: string
  }
  initialTab?: string
}

const dashboardTabs = new Set(["links", "temp-email", "api", "security"])
const dashboardReporter = createClientErrorReporter("dashboard_client")

const tabMeta: Record<string, { label: string; description: string }> = {
  links: {
    label: "短链工作台",
    description: "先创建新短链，再在右侧集中复制、查看访问记录和删除。",
  },
  "temp-email": {
    label: "临时邮箱",
    description: "创建收件地址，集中查看验证码、注册邮件和通知。",
  },
  api: {
    label: "API 与集成",
    description: "管理 API Key，获取最常用调用示例和 ShareX 配置。",
  },
  security: {
    label: "账号安全",
    description: "管理 Passkey，提升账号登录安全性。",
  },
}

function getLinksPanelDescription(totalItems: number) {
  return totalItems > 0
    ? `共 ${totalItems} 条短链，可在这里复制、查看访问记录或删除。`
    : "你创建的短链会显示在这里，方便随时复制和管理。"
}

function getLinksEmptyStateMessage(page: number) {
  return page > 1
    ? "这一页暂时没有短链记录，可以返回上一页继续查看。"
    : "先在左侧输入长链接，生成第一条短链吧。"
}

function getLogsEmptyStateMessage(selectedLink: ShortLink | null) {
  return selectedLink
    ? "这条短链还没有访问记录；等有人打开后会显示在这里。"
    : "选择一条短链后，就能在这里查看访问时间、状态码和来源。"
}

function getLogsPanelDescription(selectedLink: ShortLink | null) {
  return selectedLink
    ? "查看这条短链的访问时间、状态码和访问来源；需要时可立即刷新。"
    : "选择一条短链后，就能在这里查看访问时间、状态码和来源。"
}

function getDeleteSuccessState(remainingItems: number, currentPage: number) {
  if (remainingItems > 0) {
    return {
      nextPage: currentPage,
      shouldRefetch: false,
    }
  }

  if (currentPage > 1) {
    return {
      nextPage: currentPage - 1,
      shouldRefetch: true,
    }
  }

  return {
    nextPage: 1,
    shouldRefetch: true,
  }
}

function DashboardSection({
  title,
  description,
  badge,
  children,
}: {
  title: string
  description: string
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {badge}
      </div>
      {children}
    </section>
  )
}

export function DashboardClient({ user, initialTab }: DashboardClientProps) {
  const [links, setLinks] = useState<ShortLink[]>([])
  const [loading, setLoading] = useState(true)
  const [linksError, setLinksError] = useState<string | null>(null)
  const [logsDialogOpen, setLogsDialogOpen] = useState(false)
  const [selectedLink, setSelectedLink] = useState<ShortLink | null>(null)
  const [logs, setLogs] = useState<ClickLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(
    initialTab && dashboardTabs.has(initialTab) ? initialTab : "links"
  )
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [pendingDeleteLink, setPendingDeleteLink] = useState<ShortLink | null>(null)
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null)
  const isDesktop = useMediaQuery("(min-width: 768px)")

  useEffect(() => {
    if (initialTab && dashboardTabs.has(initialTab)) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  function getLogBadgeVariant(eventType: string): "secondary" | "destructive" | "outline" {
    if (eventType.includes("blocked") || eventType.includes("deleted")) {
      return "destructive"
    }
    if (eventType === "redirect_success") {
      return "secondary"
    }
    return "outline"
  }

  const fetchLinks = useCallback(async (currentPage: number, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true)
    }
    setLinksError(null)
    try {
      const res = await fetch(`/api/links?page=${currentPage}&limit=10`)
      if (res.ok) {
        const body = await res.json() as {
          data?: ShortLink[]
          total?: number
          page?: number
          limit?: number
          totalPages?: number
        }
        setLinks(body.data || [])
        setTotalPages(body.totalPages || 1)
        setTotalItems(body.total || 0)
      } else {
        const body = await readOptionalJson<{ error?: string }>(res)
        const message = getResponseErrorMessage(body, "加载短链记录失败")
        dashboardReporter.warn("fetch_links_failed_response", { page: currentPage, status: res.status })
        setLinksError(message)
        if (!options?.silent) {
          toast.error(message)
        }
      }
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "加载短链记录失败")
      dashboardReporter.report("fetch_links_failed_exception", error, { page: currentPage })
      setLinksError(message)
      if (!options?.silent) {
        toast.error(message)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLinks(page)
  }, [fetchLinks, page])

  async function handleDelete(id: string) {
    setDeletingLinkId(id)
    try {
      const res = await fetch(`/api/links/${id}`, { method: "DELETE" })
      if (res.ok) {
        const remainingItems = Math.max(0, totalItems - 1)
        const deleteState = getDeleteSuccessState(links.length - 1, page)

        toast.success("短链已删除")
        setLinks((prev) => prev.filter((l) => l.id !== id))
        setTotalItems(remainingItems)
        setPendingDeleteLink(null)

        if (deleteState.nextPage !== page) {
          setPage(deleteState.nextPage)
          return
        }

        if (deleteState.shouldRefetch) {
          await fetchLinks(deleteState.nextPage, { silent: true })
        }
      } else {
        const body = await readOptionalJson<{ error?: string }>(res)
        dashboardReporter.warn("delete_link_failed_response", { linkId: id, status: res.status })
        toast.error(getResponseErrorMessage(body, "删除短链失败"))
      }
    } catch (error) {
      dashboardReporter.report("delete_link_failed_exception", error, { linkId: id })
      toast.error(getUserFacingErrorMessage(error, "删除短链失败"))
    } finally {
      setDeletingLinkId(null)
    }
  }

  async function handleViewLogs(link: ShortLink) {
    setSelectedLink(link)
    setLogs([])
    setLogsError(null)
    setLogsDialogOpen(true)
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/logs/${link.id}`)
      if (res.ok) {
        const body = await res.json()
        setLogs(Array.isArray(body) ? body : (body.data || []))
      } else {
        const body = await readOptionalJson<{ error?: string }>(res)
        const message = getResponseErrorMessage(body, "加载点击日志失败")
        dashboardReporter.warn("view_logs_failed_response", { linkId: link.id, status: res.status })
        setLogsError(message)
        toast.error(message)
      }
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "加载点击日志失败")
      dashboardReporter.report("view_logs_failed_exception", error, { linkId: link.id })
      setLogsError(message)
      toast.error(message)
    } finally {
      setLogsLoading(false)
    }
  }

  async function handleRefreshLinks() {
    await fetchLinks(page)
  }

  async function handleRefreshLogs() {
    if (!selectedLink) {
      return
    }

    await handleViewLogs(selectedLink)
  }

  async function handleCopy(shortUrl: string) {
    try {
      await navigator.clipboard.writeText(shortUrl)
      toast.success("短链已复制")
    } catch {
      toast.error("复制失败，请手动复制")
    }
  }

  async function handleCreated() {
    setPage(1)
    await fetchLinks(1)
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="返回首页" className="text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="font-semibold">用户后台</h1>
          </div>
          <UserMenu user={user} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:py-8">
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">欢迎回来，{user.name || user.email}</h2>
            <p className="text-sm text-muted-foreground">在这里处理你最常用的任务：创建短链、查看邮件、管理 API Key 和登录安全。</p>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid h-auto grid-cols-2 gap-2 rounded-lg bg-muted p-1 lg:grid-cols-4">
              <TabsTrigger value="links" className="w-full">短链工作台</TabsTrigger>
              <TabsTrigger value="temp-email" className="w-full">临时邮箱</TabsTrigger>
              <TabsTrigger value="api" className="w-full">API 与集成</TabsTrigger>
              <TabsTrigger value="security" className="w-full">账号安全</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{tabMeta[activeTab]?.label || "用户后台"}</p>
            <p className="mt-1">{tabMeta[activeTab]?.description}</p>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="links" className="mt-0">
            <DashboardSection
              title="短链工作台"
              description="先创建新短链，再在右侧列表里复制、查看访问记录或删除。"
              badge={totalItems > 0 ? <Badge variant="outline">共 {totalItems} 条</Badge> : undefined}
            >
              <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
                <ShortLinkCreator
                  user={user}
                  mode="dashboard"
                  onCreated={handleCreated}
                />

                <Card>
                  <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-base">短链记录</CardTitle>
                      <CardDescription>{getLinksPanelDescription(totalItems)}</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleRefreshLinks} disabled={loading}>
                      刷新列表
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="rounded-lg border border-dashed px-4 py-16 text-center text-sm text-muted-foreground">
                        <p>正在加载短链记录...</p>
                        <p className="mt-2 text-xs">加载完成后可在这里复制短链、查看访问记录或删除。</p>
                      </div>
                    ) : linksError ? (
                      <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-16 text-center text-sm text-destructive">
                        <p className="font-medium">短链记录加载失败</p>
                        <p className="mt-2">{linksError}</p>
                        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={handleRefreshLinks}>
                          重试加载
                        </Button>
                      </div>
                    ) : links.length === 0 ? (
                      <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
                        <p>{page > 1 ? "这一页暂时没有短链记录。" : "你还没有创建短链。"}</p>
                        <p className="mt-2">{getLinksEmptyStateMessage(page)}</p>
                      </div>
                    ) : isDesktop ? (
                      <div className="overflow-x-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[120px]">短链</TableHead>
                              <TableHead className="min-w-[160px]">目标</TableHead>
                              <TableHead className="hidden w-20 text-center sm:table-cell">点击</TableHead>
                              <TableHead className="hidden w-28 text-center lg:table-cell">点击限制</TableHead>
                              <TableHead className="hidden w-32 xl:table-cell">过期时间</TableHead>
                              <TableHead className="w-20 text-center">状态</TableHead>
                              <TableHead className="hidden w-28 2xl:table-cell">创建时间</TableHead>
                              <TableHead className="w-28 text-right">操作</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {links.map((link) => (
                              <TableRow key={link.id}>
                                <TableCell className="font-mono text-sm">
                                  <div className="flex items-center gap-1">
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs text-muted-foreground">{link.domain}</p>
                                      <span className="block max-w-[160px] truncate">/{link.slug}</span>
                                    </div>
                                    <button
                                      onClick={() => handleCopy(link.shortUrl)}
                                      className="shrink-0 text-muted-foreground hover:text-foreground"
                                      title="复制短链"
                                      aria-label={`复制短链 ${link.domain}/${link.slug}`}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </button>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex max-w-[200px] items-center gap-1 sm:max-w-xs">
                                    <span className="truncate text-sm text-muted-foreground">
                                      {link.originalUrl}
                                    </span>
                                    <a
                                      href={link.originalUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="shrink-0 text-muted-foreground hover:text-foreground"
                                      title="打开原链接"
                                      aria-label={`打开原链接 ${link.originalUrl}`}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                </TableCell>
                                <TableCell className="hidden text-center sm:table-cell">
                                  <Badge variant="secondary">{link.clicks}</Badge>
                                </TableCell>
                                <TableCell className="hidden text-center lg:table-cell">
                                  {link.hasClickLimit ? (
                                    <Badge variant={link.isExpired ? "destructive" : "outline"}>
                                      {link.clicks}/{link.maxClicks ?? "—"}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">未设置</span>
                                  )}
                                </TableCell>
                                <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                                  {link.hasExpiration ? formatDate(link.expiresAt) : "未设置"}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={link.isExpired ? "destructive" : "secondary"}>
                                    {link.isExpired ? "已失效" : "有效"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="hidden text-sm text-muted-foreground 2xl:table-cell">
                                  {formatDate(link.createdAt)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={() => handleViewLogs(link)}
                                      title="查看日志"
                                      aria-label={`查看短链 ${link.domain}/${link.slug} 的日志`}
                                    >
                                      <BarChart2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={() => setPendingDeleteLink(link)}
                                      className="text-destructive hover:text-destructive"
                                      title="删除短链"
                                      aria-label={`删除短链 ${link.domain}/${link.slug}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {links.map((link) => (
                          <div key={link.id} className="rounded-lg border p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-xs text-muted-foreground">{link.domain}</p>
                                <p className="truncate font-mono text-sm">/{link.slug}</p>
                              </div>
                              <Badge variant={link.isExpired ? "destructive" : "secondary"}>
                                {link.isExpired ? "已失效" : "有效"}
                              </Badge>
                            </div>

                            <div className="mt-3 space-y-2 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">目标链接</p>
                                <a
                                  href={link.originalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block truncate text-muted-foreground hover:text-foreground"
                                >
                                  {link.originalUrl}
                                </a>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">点击 {link.clicks}</Badge>
                                {link.hasClickLimit && (
                                  <Badge variant="outline">限制 {link.clicks}/{link.maxClicks ?? "—"}</Badge>
                                )}
                                <Badge variant="outline">
                                  {link.hasExpiration ? `到期 ${formatDate(link.expiresAt)}` : "长期有效"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">创建于 {formatDate(link.createdAt)}</p>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleCopy(link.shortUrl)}>
                                <Copy className="h-4 w-4" />
                                复制短链
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleViewLogs(link)}>
                                <BarChart2 className="h-4 w-4" />
                                查看日志
                              </Button>
                              <Button variant="outline" size="sm" asChild>
                                <a href={link.originalUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                  打开原链接
                                </a>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setPendingDeleteLink(link)}
                              >
                                <Trash2 className="h-4 w-4" />
                                删除
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {totalPages > 1 && !linksError && (
                      <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <div>共 {totalItems} 条短链，当前为第 {page} / {totalPages} 页</div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                          >
                            上一页
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                          >
                            下一页
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </DashboardSection>
          </TabsContent>

          <TabsContent value="temp-email" className="mt-0">
            <DashboardSection
              title="临时邮箱工作台"
              description="创建收件地址、复制邮箱并查看收到的邮件。适合接收验证码、注册通知和一次性邮件。"
            >
              <TempEmailManager />
            </DashboardSection>
          </TabsContent>

          <TabsContent value="security" className="mt-0">
            <DashboardSection
              title="账号安全"
              description="为账号添加 Passkey，减少密码依赖并提升登录安全。"
            >
              <PasskeyManager />
            </DashboardSection>
          </TabsContent>

          <TabsContent value="api" className="mt-0">
            <DashboardSection
              title="API 与集成"
              description="管理 API Key，并按最常见的调用路径快速接入 Shortly。"
            >
              <ApiManagementPanel />
            </DashboardSection>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              点击日志
              {selectedLink && (
                <span className="ml-2 block font-mono text-sm text-muted-foreground sm:inline">
                  {selectedLink.domain}/{selectedLink.slug}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>{getLogsPanelDescription(selectedLink)}</DialogDescription>
          </DialogHeader>
          <div className="mb-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleRefreshLogs} disabled={logsLoading || !selectedLink}>
              刷新日志
            </Button>
          </div>
          {logsLoading ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              正在加载点击日志...
            </div>
          ) : logsError ? (
            <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-10 text-center text-sm text-destructive">
              <p className="font-medium">点击日志加载失败</p>
              <p className="mt-2">{logsError}</p>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={handleRefreshLogs}>
                重试加载
              </Button>
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              <p>{getLogsEmptyStateMessage(selectedLink)}</p>
              {selectedLink && <p className="mt-2 text-xs">你可以稍后刷新日志，或先复制短链发出去测试访问。</p>}
            </div>
          ) : isDesktop ? (
            <div className="max-h-80 overflow-y-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">时间</TableHead>
                    <TableHead className="min-w-[120px]">事件</TableHead>
                    <TableHead className="w-20 text-center">状态码</TableHead>
                    <TableHead className="min-w-[140px]">来源</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>浏览器</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant={getLogBadgeVariant(log.eventType)}>
                          {getLogEventLabel(log.eventType)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {log.statusCode ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm">
                        {log.referrer || <span className="text-muted-foreground">直接访问</span>}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                        {log.ipAddress || "—"}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                        {log.userAgent?.split(" ").slice(-1)[0] || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Badge variant={getLogBadgeVariant(log.eventType)}>
                      {getLogEventLabel(log.eventType)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <p>状态码：{log.statusCode ?? "—"}</p>
                    <p className="truncate">来源：{log.referrer || "直接访问"}</p>
                    <p className="truncate">IP：{log.ipAddress || "—"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDeleteLink} onOpenChange={(open) => !open && setPendingDeleteLink(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除短链？</DialogTitle>
            <DialogDescription>
              删除后将无法恢复。
              {pendingDeleteLink && (
                <span className="mt-2 block font-mono text-xs text-muted-foreground">
                  {pendingDeleteLink.domain}/{pendingDeleteLink.slug}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteLink(null)} disabled={!!deletingLinkId}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => pendingDeleteLink && handleDelete(pendingDeleteLink.id)}
              disabled={!!deletingLinkId}
            >
              {deletingLinkId ? "删除中..." : "删除短链"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
