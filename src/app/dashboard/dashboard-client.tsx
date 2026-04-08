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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { ArrowLeft, BarChart2, Copy, ExternalLink, KeyRound, Link2, Mail, Shield, Trash2 } from "lucide-react"
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
          <div className="rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 p-1.5">
            <UserMenu
              user={user}
              layout="panel"
              align="start"
              className="text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
            />
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
          <div className="flex h-14 items-center px-4 sm:px-6">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <h1 className="text-sm font-medium">{activeTabLabel}</h1>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {activeTab === "links" && (
            <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <ShortLinkCreator
                user={user}
                mode="dashboard"
                onCreated={handleCreated}
              />

              <Card>
                <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">短链记录</CardTitle>
                    {totalItems > 0 && <Badge variant="outline">{totalItems}</Badge>}
                  </div>
                  <Button variant="outline" size="sm" onClick={handleRefreshLinks} disabled={loading}>
                    刷新
                  </Button>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="py-14 text-center text-sm text-muted-foreground">正在加载...</div>
                  ) : linksError ? (
                    <div className="space-y-4 py-12 text-center text-sm text-destructive">
                      <p>{linksError}</p>
                      <Button type="button" variant="outline" size="sm" onClick={handleRefreshLinks}>
                        重试
                      </Button>
                    </div>
                  ) : links.length === 0 ? (
                    <div className="py-14 text-center text-sm text-muted-foreground">
                      {page > 1 ? "这一页没有短链。" : "还没有短链。"}
                    </div>
                  ) : isDesktop ? (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[120px]">短链</TableHead>
                            <TableHead className="min-w-[160px]">目标</TableHead>
                            <TableHead className="hidden w-20 text-center sm:table-cell">点击</TableHead>
                            <TableHead className="hidden w-28 text-center lg:table-cell">限制</TableHead>
                            <TableHead className="hidden w-32 xl:table-cell">到期</TableHead>
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
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                                {link.hasExpiration ? formatDate(link.expiresAt) : "—"}
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
                            <a
                              href={link.originalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate text-muted-foreground hover:text-foreground"
                            >
                              {link.originalUrl}
                            </a>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">点击 {link.clicks}</Badge>
                              {link.hasClickLimit && (
                                <Badge variant="outline">限制 {link.clicks}/{link.maxClicks ?? "—"}</Badge>
                              )}
                              <Badge variant="outline">
                                {link.hasExpiration ? `到期 ${formatDate(link.expiresAt)}` : "长期有效"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{formatDate(link.createdAt)}</p>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleCopy(link.shortUrl)}>
                              <Copy className="h-4 w-4" />
                              复制
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleViewLogs(link)}>
                              <BarChart2 className="h-4 w-4" />
                              日志
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                              <a href={link.originalUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                                打开
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
                      <div>{page} / {totalPages}</div>
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
          )}

          {activeTab === "temp-email" && <TempEmailManager />}
          {activeTab === "security" && <PasskeyManager />}
          {activeTab === "api" && <ApiManagementPanel />}
        </main>
      </SidebarInset>
      </SidebarProvider>

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
            <DialogDescription>查看访问记录。</DialogDescription>
          </DialogHeader>
          <div className="mb-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleRefreshLogs} disabled={logsLoading || !selectedLink}>
              刷新
            </Button>
          </div>
          {logsLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">正在加载...</div>
          ) : logsError ? (
            <div className="space-y-4 py-10 text-center text-sm text-destructive">
              <p>{logsError}</p>
              <Button type="button" variant="outline" size="sm" onClick={handleRefreshLogs}>
                重试
              </Button>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {selectedLink ? "还没有访问记录。" : "先选择一条短链。"}
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
    </>
  )
}
