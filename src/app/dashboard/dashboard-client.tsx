"use client"

import { useState, useEffect, useCallback } from "react"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { toast } from "sonner"
import { ArrowLeft, BarChart2, CheckCircle2, Copy, ExternalLink, KeyRound, Link2, Mail, RefreshCw, Shield, Trash2, TrendingUp, Zap } from "lucide-react"
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

  const activeTabLabel =
    activeTab === "links"
      ? "短链管理"
      : activeTab === "temp-email"
        ? "临时邮箱"
        : activeTab === "api"
          ? "API 管理"
          : "安全"

  return (
    <>
      <SidebarProvider defaultOpen>
        <Sidebar collapsible="icon" variant="inset">
          <SidebarHeader className="gap-1 p-3">
            <Button
              variant="ghost"
              asChild
              className="h-10 justify-start gap-2 px-2 text-sidebar-foreground hover:text-sidebar-foreground"
            >
              <Link href="/" aria-label="返回首页">
                <ArrowLeft className="h-4 w-4" />
                <span className="font-medium">返回首页</span>
              </Link>
            </Button>
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>导航</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      type="button"
                      isActive={activeTab === "links"}
                      onClick={() => setActiveTab("links")}
                      tooltip="短链"
                    >
                      <Link2 className="h-4 w-4" />
                      <span>短链</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      type="button"
                      isActive={activeTab === "temp-email"}
                      onClick={() => setActiveTab("temp-email")}
                      tooltip="临时邮箱"
                    >
                      <Mail className="h-4 w-4" />
                      <span>临时邮箱</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      type="button"
                      isActive={activeTab === "api"}
                      onClick={() => setActiveTab("api")}
                      tooltip="API 管理"
                    >
                      <KeyRound className="h-4 w-4" />
                      <span>API</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      type="button"
                      isActive={activeTab === "security"}
                      onClick={() => setActiveTab("security")}
                      tooltip="安全"
                    >
                      <Shield className="h-4 w-4" />
                      <span>安全</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarSeparator />
          <SidebarFooter className="p-3">
            <div className="rounded-xl border bg-sidebar-accent/30 p-2">
              <UserMenu
                user={user}
                layout="panel"
                align="start"
                className="text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50"
              />
            </div>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur-xl">
            <div className="flex h-14 items-center px-[var(--page-gutter)] sm:h-16">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="-ml-2 h-9 w-9" />
                <div className="h-4 w-px bg-border/60" />
                <h1 className="text-sm font-semibold tracking-tight text-foreground/80">{activeTabLabel}</h1>
              </div>
            </div>
          </header>

          <main className="flex-1 px-[var(--page-gutter)] py-5 sm:py-6 lg:py-8">
            {activeTab === "links" && (
              <div className="mx-auto w-full max-w-[92rem] space-y-8 sm:space-y-10">
                <section className="rounded-xl border bg-card p-4 sm:p-5">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Links workspace</p>
                      <h2 className="text-2xl font-semibold tracking-tight">短链创建与记录管理</h2>
                      <p className="text-sm leading-6 text-muted-foreground">
                        创建入口放在工作区顶部，下面直接管理最近生成的短链，复制、查看日志和删除保持在同一视线内。
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 lg:min-w-[28rem]">
                      <div className="rounded-lg border bg-background px-3 py-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Link2 className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">Total</span>
                        </div>
                        <p className="mt-1 text-lg font-semibold tabular-nums">{totalItems}</p>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <TrendingUp className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">Clicks</span>
                        </div>
                        <p className="mt-1 text-lg font-semibold tabular-nums">{links.reduce((acc, link) => acc + link.clicks, 0)}</p>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">Active</span>
                        </div>
                        <p className="mt-1 text-lg font-semibold tabular-nums">{links.filter((link) => !link.isExpired).length}</p>
                      </div>
                    </div>
                  </div>
                </section>

                <ShortLinkCreator
                  user={user}
                  mode="dashboard"
                  onCreated={handleCreated}
                />

                <section className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold tracking-tight">短链记录</h2>
                        {totalItems > 0 && (
                          <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">
                           {totalItems} Links
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">最近创建的短链、状态和日志入口。</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefreshLinks}
                      disabled={loading}
                      className="h-9 w-full sm:w-auto"
                    >
                      <RefreshCw className={`h-4 w-4${loading ? " animate-spin" : ""}`} />
                      刷新
                    </Button>
                  </div>

                  <div className="relative">
                      {loading ? (
                        <div className="flex h-56 items-center justify-center rounded-xl border border-dashed bg-muted/5 text-sm text-muted-foreground sm:h-64">
                          正在加载记录...
                        </div>
                      ) : linksError ? (
                        <div className="flex h-56 flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-destructive/5 px-6 text-center sm:h-64">
                          <p className="text-sm text-destructive">{linksError}</p>
                          <Button type="button" variant="outline" size="sm" onClick={handleRefreshLinks}>
                            重试
                          </Button>
                        </div>
                      ) : links.length === 0 ? (
                        <div className="flex h-56 items-center justify-center rounded-xl border border-dashed bg-muted/5 px-4 text-center text-sm text-muted-foreground sm:h-64">
                          {page > 1 ? "这一页没有短链。" : "创建台准备好了，先生成第一条短链。"}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {isDesktop ? (
                            <div className="overflow-hidden rounded-xl border bg-card">
                              <Table>
                                <TableHeader className="bg-muted/30">
                                  <TableRow className="hover:bg-transparent">
                                    <TableHead className="h-10 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">短链</TableHead>
                                    <TableHead className="h-10 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">目标</TableHead>
                                    <TableHead className="h-10 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">状态</TableHead>
                                    <TableHead className="h-10 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">操作</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {links.map((link) => (
                                    <TableRow key={link.id} className="group/row transition-colors">
                                      <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                          <div className="flex items-center gap-1">
                                            <span className="font-mono text-sm font-semibold text-foreground">/{link.slug}</span>
                                            <Button
                                              variant="ghost"
                                              size="icon-sm"
                                              onClick={() => handleCopy(link.shortUrl)}
                                              className="h-6 w-6 opacity-0 transition-opacity group-hover/row:opacity-100"
                                            >
                                              <Copy className="h-3.3 w-3.3" />
                                            </Button>
                                          </div>
                                          <span className="truncate text-[10px] text-muted-foreground/70">{link.domain}</span>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex max-w-[240px] items-center gap-1.5">
                                          <span className="truncate text-xs text-muted-foreground" title={link.originalUrl}>
                                            {link.originalUrl}
                                          </span>
                                          <a
                                            href={link.originalUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-primary"
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                          </a>
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <Badge
                                          variant="outline"
                                          className={`h-5 px-2 text-[10px] font-medium transition-colors ${
                                            link.isExpired
                                              ? "border-destructive/30 bg-destructive/5 text-destructive"
                                              : "border-primary/20 bg-primary/5 text-primary"
                                          }`}
                                        >
                                          {link.isExpired ? "已失效" : "有效"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-right font-mono">
                                        <div className="flex items-center justify-end gap-3">
                                          <div className="flex flex-col items-end gap-0.5 mr-2">
                                            <span className="text-xs font-bold">{link.clicks}</span>
                                            <span className="text-[9px] text-muted-foreground uppercase opacity-60">CLICKS</span>
                                          </div>
                                          <div className="flex gap-1 opacity-0 transition-all group-hover/row:opacity-100 translate-x-1 group-hover/row:translate-x-0">
                                            <Button
                                              variant="ghost"
                                              size="icon-sm"
                                              onClick={() => handleViewLogs(link)}
                                              className="h-8 w-8 rounded-lg hover:bg-muted/80"
                                            >
                                              <BarChart2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon-sm"
                                              onClick={() => setPendingDeleteLink(link)}
                                              className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
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
                                <div key={link.id} className="rounded-xl border bg-card p-4 transition-all hover:border-primary/20 sm:p-5">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <p className="font-mono text-sm font-bold">/{link.slug}</p>
                                      <p className="truncate text-[10px] text-muted-foreground">{link.domain}</p>
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className={link.isExpired ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-primary/20 bg-primary/5 text-primary"}
                                    >
                                      {link.isExpired ? "已失效" : "有效"}
                                    </Badge>
                                  </div>
                                  <p className="mt-3 truncate text-xs text-muted-foreground">{link.originalUrl}</p>
                                  <div className="mt-5 flex items-center justify-between border-t pt-4">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-bold">{link.clicks}</span>
                                      <span className="text-[10px] text-muted-foreground uppercase opacity-60 font-medium">点击次数</span>
                                    </div>
                                    <div className="flex gap-1">
                                       <Button variant="ghost" size="icon-sm" onClick={() => handleCopy(link.shortUrl)}>
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon-sm" onClick={() => handleViewLogs(link)}>
                                        <BarChart2 className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon-sm" onClick={() => setPendingDeleteLink(link)} className="text-destructive">
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {totalPages > 1 && !linksError && (
                            <div className="flex items-center justify-between border-t pt-6">
                              <p className="text-xs text-muted-foreground font-medium uppercase tracking-tight">
                                页码 {page} / {totalPages}
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={page <= 1}
                                  onClick={() => setPage((p) => p - 1)}
                                  className="h-8 rounded-lg border bg-card px-4 text-[11px] font-bold uppercase transition-all hover:bg-muted active:scale-95 disabled:opacity-50"
                                >
                                  上一页
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={page >= totalPages}
                                  onClick={() => setPage((p) => p + 1)}
                                  className="h-8 rounded-lg border bg-card px-4 text-[11px] font-bold uppercase transition-all hover:bg-muted active:scale-95 disabled:opacity-50"
                                >
                                  下一页
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "temp-email" && (
              <div className="mx-auto w-full max-w-[92rem]">
                <TempEmailManager />
              </div>
            )}
            {activeTab === "security" && (
              <div className="mx-auto w-full max-w-[92rem]">
                <PasskeyManager />
              </div>
            )}
            {activeTab === "api" && (
              <div className="mx-auto w-full max-w-[92rem]">
                <ApiManagementPanel />
              </div>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>

      <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
        <DialogContent className="flex max-h-[min(92vh,44rem)] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border p-0 shadow-none sm:max-w-4xl">
          <DialogHeader className="p-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight">点击日志诊断</DialogTitle>
                <DialogDescription className="mt-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                  REAL-TIME TRAFFIC ANALYSIS
                </DialogDescription>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleRefreshLogs} 
                disabled={logsLoading || !selectedLink}
                className="h-9 rounded-xl bg-muted/50 font-bold text-[11px] uppercase tracking-wider"
              >
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${logsLoading ? "animate-spin" : ""}`} />
                刷新数据
              </Button>
            </div>
            {selectedLink && (
              <div className="mt-4 flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <code className="font-mono text-xs font-bold text-primary">
                  {selectedLink.domain}/{selectedLink.slug}
                </code>
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-auto px-5 pb-5 sm:px-6 sm:pb-6">
            {logsLoading ? (
              <div className="flex h-64 flex-col items-center justify-center space-y-4 text-center">
                <div className="h-8 w-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">正在拉取日志...</p>
              </div>
            ) : logsError ? (
              <div className="flex h-64 flex-col items-center justify-center space-y-4 text-center">
                <p className="text-sm font-bold text-destructive uppercase tracking-widest">{logsError}</p>
                <Button type="button" variant="outline" size="sm" onClick={handleRefreshLogs} className="rounded-xl font-bold">
                  重试请求
                </Button>
              </div>
            ) : logs.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center space-y-2 rounded-xl border border-dashed bg-muted/5 text-center text-muted-foreground">
                <Zap className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm font-bold uppercase tracking-widest">暂无记录</p>
                <p className="text-xs">该链接尚未产生任何点击事件</p>
              </div>
            ) : isDesktop ? (
              <div className="overflow-hidden rounded-xl border bg-card">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className="h-10 text-[10px] font-bold uppercase tracking-wider">时间戳</TableHead>
                      <TableHead className="h-10 text-[10px] font-bold uppercase tracking-wider">事件类型</TableHead>
                      <TableHead className="h-10 text-center text-[10px] font-bold uppercase tracking-wider">HTTP</TableHead>
                      <TableHead className="h-10 text-[10px] font-bold uppercase tracking-wider">来源渠道 (Referrer)</TableHead>
                      <TableHead className="h-10 text-[10px] font-bold uppercase tracking-wider text-right pr-6">访问信息</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id} className="group/row transition-colors hover:bg-muted/20">
                        <TableCell className="whitespace-nowrap py-4 text-[11px] font-medium text-muted-foreground tabular-nums">
                          {formatDate(log.createdAt)}
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge 
                            variant="outline" 
                            className={`rounded-lg border-none px-2 py-0.5 text-[10px] font-bold uppercase ${
                              log.eventType === "click" ? "bg-emerald-500/10 text-emerald-600" :
                              log.eventType === "blocked" ? "bg-rose-500/10 text-rose-600" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {getLogEventLabel(log.eventType)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center py-4 font-mono text-[11px] font-bold text-muted-foreground/60">
                          {log.statusCode ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[200px] py-4">
                          <p className="truncate text-[11px] font-medium">
                            {log.referrer || <span className="text-muted-foreground/40 italic">DIRECT</span>}
                          </p>
                        </TableCell>
                        <TableCell className="text-right pr-6 py-4">
                          <div className="space-y-0.5">
                            <p className="text-[11px] font-bold tabular-nums text-foreground/80">{log.ipAddress || "0.0.0.0"}</p>
                            <p className="truncate text-[9px] font-bold uppercase tracking-tighter text-muted-foreground/40">
                              {log.userAgent?.split(" ").slice(-1)[0] || "UNKNOWN"}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="space-y-4 rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between border-b pb-3">
                      <Badge variant="outline" className="text-[10px] font-bold uppercase bg-muted/50">
                        {getLogEventLabel(log.eventType)}
                      </Badge>
                      <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{formatDate(log.createdAt)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-[11px]">
                      <div>
                        <p className="font-bold text-muted-foreground uppercase tracking-widest text-[9px] mb-1">Status</p>
                        <p className="font-mono font-bold">{log.statusCode ?? "—"}</p>
                      </div>
                      <div>
                        <p className="font-bold text-muted-foreground uppercase tracking-widest text-[9px] mb-1">Origin</p>
                        <p className="truncate">{log.referrer || "DIRECT"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="font-bold text-muted-foreground uppercase tracking-widest text-[9px] mb-1">Network Info</p>
                        <p className="font-mono">{log.ipAddress || "—"}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDeleteLink} onOpenChange={(open) => !open && setPendingDeleteLink(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm rounded-xl border p-6 text-center shadow-none sm:p-8">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <Trash2 className="h-7 w-7" />
          </div>
          <DialogHeader className="items-center">
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">确认彻底移除？</DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
              此操作将销毁该短链及其所有统计数据。
              {pendingDeleteLink && (
                <span className="mt-4 block rounded-xl bg-muted/50 p-3 font-mono text-xs font-bold text-foreground">
                  {pendingDeleteLink.domain}/{pendingDeleteLink.slug}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <Button variant="ghost" onClick={() => setPendingDeleteLink(null)} disabled={!!deletingLinkId} className="h-11 rounded-lg bg-muted/30 text-[11px] font-bold uppercase tracking-widest">
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => pendingDeleteLink && handleDelete(pendingDeleteLink.id)}
              disabled={!!deletingLinkId}
              className="h-11 rounded-lg text-[11px] font-bold uppercase tracking-widest"
            >
              {deletingLinkId ? "同步中..." : "确定销毁"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
