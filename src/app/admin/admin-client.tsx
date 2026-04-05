"use client"

import { useState, useEffect, useCallback, type ReactNode } from "react"
import { UserMenu } from "@/components/user-menu"
import {
  createClientErrorReporter,
  getResponseErrorMessage,
  getUserFacingErrorMessage,
  readOptionalJson,
} from "@/lib/client-feedback"
import { formatDate } from "@/lib/utils"
import { getLogEventLabel } from "@/lib/log-events"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { Trash2, ExternalLink, ArrowLeft, Save, Shield, BarChart2, Pencil, Plus, Mail, Inbox, Archive } from "lucide-react"
import Link from "next/link"
import { useMediaQuery } from "@/lib/use-media-query"

interface AdminLink {
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
  userId: string | null
  userName: string | null
  userEmail: string | null
}

interface LinkLog {
  id: string
  eventType: string
  referrer: string | null
  userAgent: string | null
  ipAddress: string | null
  statusCode: number | null
  createdAt: number
}

interface AdminUser {
  id: string
  name: string
  email: string
  role: string
  emailVerified: boolean
  createdAt: number
  linkCount: number
}

interface SiteSettings {
  siteName: string
  siteUrl: string
  allowAnonymous: boolean
  anonMaxLinksPerHour: number
  anonMaxClicks: number
  userMaxLinksPerHour: number
}

interface SiteDomain {
  id: string
  host: string
  supportsShortLinks: boolean
  supportsTempEmail: boolean
  isActive: boolean
  isDefaultShortDomain: boolean
  isDefaultEmailDomain: boolean
  createdAt: number
}

interface DomainFormState {
  host: string
  supportsShortLinks: boolean
  supportsTempEmail: boolean
  isActive: boolean
  isDefaultShortDomain: boolean
  isDefaultEmailDomain: boolean
}

interface AdminMailbox {
  id: string
  emailAddress: string
  domain: string
  isActive: boolean
  createdAt: string | number
  userId: string
  userName: string | null
  userEmail: string | null
  unreadCount: number
  messageCount: number
}

interface AdminMailboxMessage {
  id: string
  mailboxId: string
  mailboxEmailAddress: string
  userId: string
  userName: string | null
  userEmail: string | null
  messageId: string | null
  from: string
  fromName: string | null
  subject: string
  text: string
  html: string
  receivedAt: string | number
  isRead: boolean
  hasAttachments: boolean
}

interface ArchivedInboundEmail {
  id: string
  toEmail: string
  messageId: string | null
  from: string
  fromName: string | null
  subject: string
  text: string
  html: string
  receivedAt: string | number
  failureReason: string
  hasAttachments: boolean
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface AdminClientProps {
  user: {
    name: string
    email: string
    image?: string | null
    role: string
  }
}

const initialDomainForm: DomainFormState = {
  host: "",
  supportsShortLinks: false,
  supportsTempEmail: false,
  isActive: true,
  isDefaultShortDomain: false,
  isDefaultEmailDomain: false,
}

const adminReporter = createClientErrorReporter("admin_client")

const adminTabMeta: Record<string, { label: string; description: string }> = {
  links: {
    label: "链接管理",
    description: "查看全站短链、检查状态，并统一处理删除与日志排查。",
  },
  users: {
    label: "用户管理",
    description: "快速查看用户规模、角色分布和活跃情况。",
  },
  emails: {
    label: "临时邮箱总览",
    description: "搜索邮箱、查看已投递邮件，并排查未命中邮箱的归档邮件。",
  },
  settings: {
    label: "站点设置",
    description: "管理基础站点参数与域名能力配置。",
  },
}

function getLogsPanelDescription(selectedLink: AdminLink | null) {
  return selectedLink
    ? "查看这条短链的访问状态、来源和失败事件；需要时可立即刷新。"
    : "选择一条短链后，就能在这里查看访问状态、来源和失败事件。"
}

function getLogsEmptyStateMessage(selectedLink: AdminLink | null) {
  return selectedLink
    ? "这条短链还没有日志记录；等有人访问后会显示在这里。"
    : "选择一条短链后，就能在这里查看访问日志。"
}

function getDeleteLinkSuccessState(remainingItems: number, currentPage: number) {
  if (remainingItems > 0) {
    return { nextPage: currentPage, shouldRefetch: false }
  }

  if (currentPage > 1) {
    return { nextPage: currentPage - 1, shouldRefetch: true }
  }

  return { nextPage: 1, shouldRefetch: true }
}

function getEmailSearchSummary(search: string) {
  const keyword = search.trim()
  return keyword ? `当前筛选关键词：${keyword}` : "未设置筛选，默认显示最近的邮箱、已投递邮件和归档邮件。"
}

function getEmailOverviewDescription(search: string) {
  const keyword = search.trim()
  return keyword ? `当前结果匹配“${keyword}”相关的邮箱、邮件主题、发件人和用户。` : "这里会显示邮箱列表、正常投递邮件和归档邮件。"
}

function getDomainDeleteHelpText(domain: SiteDomain) {
  if (domain.isDefaultShortDomain || domain.isDefaultEmailDomain) {
    return "默认域名不能直接删除，请先切换默认域名。"
  }

  return "删除后将无法恢复。"
}

function getDomainEmptyStateDescription() {
  return "先添加一个短链域名或邮箱域名，再分配默认用途。"
}

function getLinksEmptyStateDescription(currentPage: number) {
  return currentPage > 1
    ? "这一页暂无链接记录，可以返回上一页继续查看。"
    : "链接列表会显示全站短链、所属用户和状态信息。"
}

function getUsersEmptyStateDescription() {
  return "新用户注册后会在这里出现。"
}

function getEmailEmptyStateDescription(search: string) {
  return search.trim()
    ? "没有匹配当前关键词的邮箱或邮件，试试更换关键词或清空搜索。"
    : "这里会显示邮箱列表、正常投递邮件和归档邮件。"
}

function AdminSection({
  title,
  description,
  badge,
  actions,
  children,
}: {
  title: string
  description: string
  badge?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{title}</h2>
            {badge}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

export function AdminClient({ user }: AdminClientProps) {
  const [activeTab, setActiveTab] = useState("links")
  const [links, setLinks] = useState<AdminLink[]>([])
  const [linksPage, setLinksPage] = useState(1)
  const [linksLimit, setLinksLimit] = useState(50)
  const [linksTotal, setLinksTotal] = useState(0)
  const [linksTotalPages, setLinksTotalPages] = useState(1)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [domains, setDomains] = useState<SiteDomain[]>([])
  const [mailboxes, setMailboxes] = useState<AdminMailbox[]>([])
  const [messages, setMessages] = useState<AdminMailboxMessage[]>([])
  const [archives, setArchives] = useState<ArchivedInboundEmail[]>([])
  const [emailSearch, setEmailSearch] = useState("")
  const [loadingEmailData, setLoadingEmailData] = useState(false)
  const [emailDataLoaded, setEmailDataLoaded] = useState(false)
  const [settings, setSettings] = useState<SiteSettings>({
    siteName: "Shortly",
    siteUrl: "http://localhost:3000",
    allowAnonymous: true,
    anonMaxLinksPerHour: 3,
    anonMaxClicks: 10,
    userMaxLinksPerHour: 50,
  })
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingDomain, setSavingDomain] = useState(false)
  const [logsDialogOpen, setLogsDialogOpen] = useState(false)
  const [domainDialogOpen, setDomainDialogOpen] = useState(false)
  const [pendingDeleteLink, setPendingDeleteLink] = useState<AdminLink | null>(null)
  const [pendingDeleteDomain, setPendingDeleteDomain] = useState<SiteDomain | null>(null)
  const [selectedLink, setSelectedLink] = useState<AdminLink | null>(null)
  const [editingDomain, setEditingDomain] = useState<SiteDomain | null>(null)
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const [domainForm, setDomainForm] = useState<DomainFormState>(initialDomainForm)
  const [logs, setLogs] = useState<LinkLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [emailDataError, setEmailDataError] = useState<string | null>(null)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null)
  const [deletingDomainId, setDeletingDomainId] = useState<string | null>(null)

  function getLogBadgeVariant(eventType: string): "secondary" | "destructive" | "outline" {
    if (eventType.includes("blocked") || eventType.includes("deleted")) {
      return "destructive"
    }
    if (eventType === "redirect_success") {
      return "secondary"
    }
    return "outline"
  }

  const fetchData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true)
    }
    setDataError(null)
    try {
      const [linksRes, usersRes, settingsRes, domainsRes] = await Promise.all([
        fetch(`/api/admin/links?page=${linksPage}&limit=${linksLimit}`),
        fetch("/api/admin/users"),
        fetch("/api/admin/settings"),
        fetch("/api/admin/domains"),
      ])

      if (!linksRes.ok || !usersRes.ok || !settingsRes.ok || !domainsRes.ok) {
        const message = "加载管理后台数据失败"
        adminReporter.warn("fetch_data_failed_response", {
          linksOk: linksRes.ok,
          usersOk: usersRes.ok,
          settingsOk: settingsRes.ok,
          domainsOk: domainsRes.ok,
        })
        setDataError(message)
        if (!options?.silent) {
          toast.error(message)
        }
        return
      }

      const body = await linksRes.json() as PaginatedResponse<AdminLink>
      setLinks(body.data || [])
      setLinksPage(body.page || 1)
      setLinksLimit(body.limit || 50)
      setLinksTotal(body.total || 0)
      setLinksTotalPages(body.totalPages || 1)

      setUsers(await usersRes.json())

      const s = await settingsRes.json()
      setSettings({
        siteName: s.siteName,
        siteUrl: s.siteUrl,
        allowAnonymous: s.allowAnonymous,
        anonMaxLinksPerHour: s.anonMaxLinksPerHour,
        anonMaxClicks: s.anonMaxClicks,
        userMaxLinksPerHour: s.userMaxLinksPerHour,
      })

      const data = await domainsRes.json()
      setDomains(Array.isArray(data) ? data : data.data || [])
    } catch (error) {
      const message = "加载管理后台数据失败"
      adminReporter.report("fetch_data_failed_exception", error)
      setDataError(message)
      if (!options?.silent) {
        toast.error(message)
      }
    } finally {
      setLoading(false)
    }
  }, [linksLimit, linksPage])

  async function handleRefreshLinks() {
    await fetchData({ silent: true })
  }

  async function handleRefreshUsers() {
    await fetchData({ silent: true })
  }

  async function handleRefreshSettings() {
    await fetchData({ silent: true })
  }

  async function handleRefreshDomains() {
    await fetchData({ silent: true })
  }

  async function handleRefreshLogs() {
    if (!selectedLink) {
      return
    }

    await handleViewLogs(selectedLink)
  }

  async function handleRefreshEmailData() {
    await fetchEmailData(emailSearch)
  }

  function handleResetEmailSearch() {
    setEmailSearch("")
    void fetchEmailData("")
  }

  function handleChangeTab(nextTab: string) {
    setActiveTab(nextTab)
    setDataError(null)
    if (nextTab !== "emails") {
      setEmailDataError(null)
    }
  }

  function renderStateMessage({
    loading: isLoading,
    error,
    empty,
    loadingText,
    emptyTitle,
    emptyDescription,
    errorTitle,
    retryAction,
  }: {
    loading: boolean
    error?: string | null
    empty: boolean
    loadingText: string
    emptyTitle: string
    emptyDescription: string
    errorTitle: string
    retryAction: () => void
  }) {
    if (isLoading) {
      return (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          {loadingText}
        </div>
      )
    }

    if (error) {
      return (
        <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-16 text-center text-sm text-destructive">
          <p className="font-medium">{errorTitle}</p>
          <p className="mt-2">{error}</p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={retryAction}>
            重试加载
          </Button>
        </div>
      )
    }

    if (empty) {
      return (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          <p>{emptyTitle}</p>
          <p className="mt-2">{emptyDescription}</p>
        </div>
      )
    }

    return null
  }

  function renderCompactStateMessage({
    empty,
    emptyTitle,
    emptyDescription,
  }: {
    empty: boolean
    emptyTitle: string
    emptyDescription: string
  }) {
    if (!empty) {
      return null
    }

    return (
      <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        <p>{emptyTitle}</p>
        <p className="mt-2">{emptyDescription}</p>
      </div>
    )
  }

  async function handleDeleteLinkConfirm(link: AdminLink) {
    setDeletingLinkId(link.id)
    try {
      const res = await fetch(`/api/admin/links/${link.id}`, { method: "DELETE" })
      if (res.ok) {
        const remainingItems = Math.max(0, linksTotal - 1)
        const deleteState = getDeleteLinkSuccessState(links.length - 1, linksPage)

        toast.success("短链已删除")
        setLinks((prev) => prev.filter((item) => item.id !== link.id))
        setLinksTotal(remainingItems)
        setPendingDeleteLink(null)

        if (deleteState.nextPage !== linksPage) {
          setLinksPage(deleteState.nextPage)
          return
        }

        if (deleteState.shouldRefetch) {
          await fetchData({ silent: true })
        }
      } else {
        const body = await readOptionalJson<{ error?: string }>(res)
        adminReporter.warn("delete_link_failed_response", { linkId: link.id, status: res.status })
        toast.error(getResponseErrorMessage(body, "删除短链失败"))
      }
    } catch (error) {
      adminReporter.report("delete_link_failed_exception", error, { linkId: link.id })
      toast.error(getUserFacingErrorMessage(error, "删除短链失败"))
    } finally {
      setDeletingLinkId(null)
    }
  }

  async function handleDeleteDomainConfirm(domain: SiteDomain) {
    setDeletingDomainId(domain.id)
    try {
      const res = await fetch(`/api/admin/domains/${domain.id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("域名已删除")
        setDomains((prev) => prev.filter((item) => item.id !== domain.id))
        setPendingDeleteDomain(null)
        return
      }

      const body = await readOptionalJson<{ error?: string }>(res)
      adminReporter.warn("delete_domain_failed_response", { domainId: domain.id, status: res.status })
      toast.error(getResponseErrorMessage(body, "删除域名失败"))
    } catch (error) {
      adminReporter.report("delete_domain_failed_exception", error, { domainId: domain.id })
      toast.error("删除域名失败")
    } finally {
      setDeletingDomainId(null)
    }
  }

  const linksState = renderStateMessage({
    loading,
    error: dataError,
    empty: links.length === 0,
    loadingText: "正在加载短链...",
    emptyTitle: linksPage > 1 ? "这一页暂无链接记录。" : "暂无链接记录。",
    emptyDescription: getLinksEmptyStateDescription(linksPage),
    errorTitle: "管理后台数据加载失败",
    retryAction: handleRefreshLinks,
  })

  const usersState = renderStateMessage({
    loading,
    error: dataError,
    empty: users.length === 0,
    loadingText: "正在加载用户列表...",
    emptyTitle: "暂无用户记录。",
    emptyDescription: getUsersEmptyStateDescription(),
    errorTitle: "管理后台数据加载失败",
    retryAction: handleRefreshUsers,
  })

  const domainsState = renderStateMessage({
    loading,
    error: dataError,
    empty: domains.length === 0,
    loadingText: "正在加载域名配置...",
    emptyTitle: "暂无域名配置。",
    emptyDescription: getDomainEmptyStateDescription(),
    errorTitle: "管理后台数据加载失败",
    retryAction: handleRefreshDomains,
  })

  const emailState = renderStateMessage({
    loading: loadingEmailData && !emailDataLoaded,
    error: emailDataError,
    empty: emailDataLoaded && mailboxes.length === 0 && messages.length === 0 && archives.length === 0,
    loadingText: "正在加载临时邮箱数据...",
    emptyTitle: emailSearch.trim() ? "没有匹配的临时邮箱数据。" : "暂无临时邮箱数据。",
    emptyDescription: getEmailEmptyStateDescription(emailSearch),
    errorTitle: "临时邮箱数据加载失败",
    retryAction: handleRefreshEmailData,
  })

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const fetchEmailData = useCallback(async (search?: string, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoadingEmailData(true)
    }
    setEmailDataError(null)
    try {
      const query = search?.trim() ? `?page=1&limit=50&search=${encodeURIComponent(search.trim())}` : "?page=1&limit=50"
      const [mailboxesRes, messagesRes, archivesRes] = await Promise.all([
        fetch(`/api/admin/emails/mailboxes${query}`),
        fetch(`/api/admin/emails/messages${query}`),
        fetch(`/api/admin/emails/archives${query}`),
      ])

      if (!mailboxesRes.ok || !messagesRes.ok || !archivesRes.ok) {
        const message = "加载临时邮箱数据失败"
        adminReporter.warn("fetch_email_data_failed_response", {
          mailboxesOk: mailboxesRes.ok,
          messagesOk: messagesRes.ok,
          archivesOk: archivesRes.ok,
        })
        setEmailDataError(message)
        if (!options?.silent) {
          toast.error(message)
        }
        return
      }

      const mailboxesBody = await mailboxesRes.json() as PaginatedResponse<AdminMailbox>
      const messagesBody = await messagesRes.json() as PaginatedResponse<AdminMailboxMessage>
      const archivesBody = await archivesRes.json() as PaginatedResponse<ArchivedInboundEmail>
      setMailboxes(mailboxesBody.data || [])
      setMessages(messagesBody.data || [])
      setArchives(archivesBody.data || [])
      setEmailDataLoaded(true)
    } catch (error) {
      const message = "加载临时邮箱数据失败"
      adminReporter.report("fetch_email_data_failed_exception", error)
      setEmailDataError(message)
      if (!options?.silent) {
        toast.error(message)
      }
    } finally {
      setLoadingEmailData(false)
    }
  }, [])

  async function handleSearchEmails() {
    await fetchEmailData(emailSearch)
  }

  useEffect(() => {
    if (activeTab === "emails" && !emailDataLoaded && !loadingEmailData) {
      void fetchEmailData()
    }
  }, [activeTab, emailDataLoaded, loadingEmailData, fetchEmailData])

  function getEmailPreview(text: string, html: string) {
    return (text || html || "").replace(/\s+/g, " ").trim() || "无正文"
  }

  function getMailboxOwnerLabel(item: { userName: string | null, userEmail: string | null }) {
    return item.userName || item.userEmail || "未知用户"
  }

  function resetDomainForm() {
    setEditingDomain(null)
    setDomainForm(initialDomainForm)
  }

  function openCreateDomainDialog() {
    resetDomainForm()
    setDomainDialogOpen(true)
  }

  function openEditDomainDialog(domain: SiteDomain) {
    setEditingDomain(domain)
    setDomainForm({
      host: domain.host,
      supportsShortLinks: domain.supportsShortLinks,
      supportsTempEmail: domain.supportsTempEmail,
      isActive: domain.isActive,
      isDefaultShortDomain: domain.isDefaultShortDomain,
      isDefaultEmailDomain: domain.isDefaultEmailDomain,
    })
    setDomainDialogOpen(true)
  }

  async function handleViewLogs(link: AdminLink) {
    setSelectedLink(link)
    setLogsDialogOpen(true)
    setLogsLoading(true)
    setLogsError(null)
    try {
      const res = await fetch(`/api/admin/links/${link.id}?page=1&pageSize=50`)
      if (res.ok) {
        const body = await res.json()
        setLogs(Array.isArray(body) ? body : (body.data || []))
      } else {
        const body = await readOptionalJson<{ error?: string }>(res)
        const message = getResponseErrorMessage(body, "加载日志失败")
        adminReporter.warn("view_logs_failed_response", { linkId: link.id, status: res.status })
        setLogs([])
        setLogsError(message)
        toast.error(message)
      }
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "加载日志失败")
      adminReporter.report("view_logs_failed_exception", error, { linkId: link.id })
      setLogs([])
      setLogsError(message)
      toast.error(message)
    } finally {
      setLogsLoading(false)
    }
  }

  function closeLogsDialog(open: boolean) {
    setLogsDialogOpen(open)
    if (!open) {
      setLogsError(null)
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        toast.success("设置已保存")
      } else {
        const body = await readOptionalJson<{ error?: string }>(res)
        adminReporter.warn("save_settings_failed_response", { status: res.status })
        toast.error(getResponseErrorMessage(body, "保存设置失败"))
      }
    } catch (error) {
      adminReporter.report("save_settings_failed_exception", error)
      toast.error(getUserFacingErrorMessage(error, "保存设置失败"))
    } finally {
      setSavingSettings(false)
    }
  }

  async function handleSaveDomain() {
    setSavingDomain(true)
    try {
      const url = editingDomain ? `/api/admin/domains/${editingDomain.id}` : "/api/admin/domains"
      const method = editingDomain ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(domainForm),
      })

      if (!res.ok) {
        const body = await readOptionalJson<{ error?: string }>(res)
        adminReporter.warn("save_domain_failed_response", {
          domainId: editingDomain?.id ?? null,
          status: res.status,
          method,
        })
        toast.error(getResponseErrorMessage(body, "保存域名失败"))
        return
      }

      const body = await res.json()
      const saved = body.data as SiteDomain
      setDomains((prev) => {
        if (editingDomain) {
          return prev
            .map((item) => (item.id === saved.id ? saved : item))
            .sort((a, b) => a.host.localeCompare(b.host))
        }
        return [...prev, saved].sort((a, b) => a.host.localeCompare(b.host))
      })
      toast.success(editingDomain ? "域名已更新" : "域名已创建")
      setDomainDialogOpen(false)
      resetDomainForm()
    } catch (error) {
      adminReporter.report("save_domain_failed_exception", error, {
        domainId: editingDomain?.id ?? null,
        method: editingDomain ? "PATCH" : "POST",
      })
      toast.error(getUserFacingErrorMessage(error, "保存域名失败"))
    } finally {
      setSavingDomain(false)
    }
  }

  function updateDomainForm<K extends keyof DomainFormState>(key: K, value: DomainFormState[K]) {
    setDomainForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="返回首页" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <h1 className="font-semibold">管理后台</h1>
            </div>
          </div>
          <UserMenu user={user} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:py-8">
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">欢迎回来，{user.name || user.email}</h2>
            <p className="text-sm text-muted-foreground">
              在这里集中处理全站链接、用户、临时邮箱和站点配置。
            </p>
          </div>
          <Tabs value={activeTab} onValueChange={handleChangeTab}>
            <TabsList className="grid h-auto grid-cols-2 gap-2 rounded-lg bg-muted p-1 lg:grid-cols-4">
              <TabsTrigger value="links" className="w-full">链接 ({linksTotal})</TabsTrigger>
              <TabsTrigger value="users" className="w-full">用户 ({users.length})</TabsTrigger>
              <TabsTrigger value="emails" className="w-full">临时邮箱</TabsTrigger>
              <TabsTrigger value="settings" className="w-full">设置</TabsTrigger>
            </TabsList>

            <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{adminTabMeta[activeTab]?.label || "管理后台"}</p>
              <p className="mt-1">{adminTabMeta[activeTab]?.description}</p>
            </div>

            <TabsContent value="links" className="mt-6">
              <AdminSection
                title="短链总览"
                description="统一查看链接状态、访问次数、所属用户，并在需要时快速删除或查看日志。"
                badge={<Badge variant="outline">共 {linksTotal} 条</Badge>}
                actions={<Button variant="outline" size="sm" onClick={handleRefreshLinks} disabled={loading}>刷新列表</Button>}
              >
                {!linksState ? (
                  <>
                    <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                      <span>第 {linksPage} / {linksTotalPages} 页</span>
                      <span>删除、刷新和日志排查都在当前列表完成。</span>
                    </div>
                    {isDesktop ? (
                      <div className="overflow-x-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[100px]">短链</TableHead>
                              <TableHead className="min-w-[160px]">目标</TableHead>
                              <TableHead className="hidden sm:table-cell">用户</TableHead>
                              <TableHead className="w-20 text-center hidden sm:table-cell">点击</TableHead>
                              <TableHead className="w-28 text-center hidden md:table-cell">点击限制</TableHead>
                              <TableHead className="w-32 hidden lg:table-cell">过期时间</TableHead>
                              <TableHead className="w-20 text-center">状态</TableHead>
                              <TableHead className="w-28 hidden xl:table-cell">创建时间</TableHead>
                              <TableHead className="w-20 text-right">操作</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {links.map((link) => (
                              <TableRow key={link.id}>
                                <TableCell className="font-mono text-sm">
                                  <div className="min-w-0">
                                    <p className="truncate text-xs text-muted-foreground">{link.domain}</p>
                                    <span className="block truncate">/{link.slug}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1 max-w-[160px] sm:max-w-[200px]">
                                    <span className="truncate text-sm text-muted-foreground">{link.originalUrl}</span>
                                    <a
                                      href={link.originalUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-muted-foreground hover:text-foreground shrink-0"
                                      aria-label={`打开原链接 ${link.originalUrl}`}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                                  {link.userEmail || <span className="italic">匿名用户</span>}
                                </TableCell>
                                <TableCell className="text-center hidden sm:table-cell">
                                  <Badge variant="secondary">{link.clicks}</Badge>
                                </TableCell>
                                <TableCell className="text-center hidden md:table-cell">
                                  {link.hasClickLimit ? (
                                    <Badge variant={link.isExpired ? "destructive" : "outline"}>
                                      {link.clicks}/{link.maxClicks ?? "—"}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">未设置</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                                  {link.hasExpiration ? formatDate(link.expiresAt) : "未设置"}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={link.isExpired ? "destructive" : "secondary"}>
                                    {link.isExpired ? "已失效" : "有效"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground hidden xl:table-cell">
                                  {formatDate(link.createdAt)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={() => handleViewLogs(link)}
                                      title="查看日志"
                                      aria-label={`查看短链 /${link.slug} 的日志`}
                                    >
                                      <BarChart2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={() => setPendingDeleteLink(link)}
                                      className="text-destructive hover:text-destructive"
                                      title="删除短链"
                                      aria-label={`删除短链 /${link.slug}`}
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
                                <p className="font-mono text-sm">/{link.slug}</p>
                                <p className="mt-1 truncate text-xs text-muted-foreground">{link.userEmail || "匿名用户"}</p>
                              </div>
                              <Badge variant={link.isExpired ? "destructive" : "secondary"}>
                                {link.isExpired ? "已失效" : "有效"}
                              </Badge>
                            </div>

                            <div className="mt-3 space-y-2 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">目标链接</p>
                                <div className="flex items-center gap-1">
                                  <span className="truncate text-muted-foreground">{link.originalUrl}</span>
                                  <a
                                    href={link.originalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 text-muted-foreground hover:text-foreground"
                                    aria-label={`打开原链接 ${link.originalUrl}`}
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">点击 {link.clicks}</Badge>
                                <Badge variant="outline">
                                  {link.hasClickLimit ? `限制 ${link.clicks}/${link.maxClicks ?? "—"}` : "不限点击"}
                                </Badge>
                                <Badge variant="outline">
                                  {link.hasExpiration ? `到期 ${formatDate(link.expiresAt)}` : "长期有效"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">创建于 {formatDate(link.createdAt)}</p>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleViewLogs(link)}>
                                <BarChart2 className="h-4 w-4" />
                                查看日志
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setPendingDeleteLink(link)}
                              >
                                <Trash2 className="h-4 w-4" />
                                删除短链
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {linksTotalPages > 1 && !dataError && (
                      <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <div>共 {linksTotal} 条短链，当前为第 {linksPage} / {linksTotalPages} 页</div>
                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={linksPage <= 1 || loading}
                            onClick={() => setLinksPage((current) => Math.max(1, current - 1))}
                          >
                            上一页
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={linksPage >= linksTotalPages || loading}
                            onClick={() => setLinksPage((current) => Math.min(linksTotalPages, current + 1))}
                          >
                            下一页
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : linksState}
              </AdminSection>
            </TabsContent>

            <TabsContent value="users" className="mt-6">
              <AdminSection
                title="用户总览"
                description="查看用户角色、注册时间和链接数量，帮助快速判断账号规模与使用情况。"
                badge={<Badge variant="outline">共 {users.length} 位</Badge>}
                actions={<Button variant="outline" size="sm" onClick={handleRefreshUsers} disabled={loading}>刷新列表</Button>}
              >
                {!usersState ? (
                  isDesktop ? (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[120px]">名称</TableHead>
                            <TableHead className="min-w-[160px]">邮箱</TableHead>
                            <TableHead className="w-24">角色</TableHead>
                            <TableHead className="w-20 text-center hidden sm:table-cell">链接数</TableHead>
                            <TableHead className="w-32 hidden md:table-cell">加入时间</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.map((u) => (
                            <TableRow key={u.id}>
                              <TableCell className="font-medium">{u.name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground truncate max-w-[160px]">{u.email}</TableCell>
                              <TableCell>
                                <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
                              </TableCell>
                              <TableCell className="text-center text-sm hidden sm:table-cell">{u.linkCount}</TableCell>
                              <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                                {formatDate(u.createdAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {users.map((u) => (
                        <div key={u.id} className="rounded-lg border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium">{u.name}</p>
                              <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                            </div>
                            <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">链接 {u.linkCount}</Badge>
                            <Badge variant="outline">加入于 {formatDate(u.createdAt)}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : usersState}
              </AdminSection>
            </TabsContent>

            <TabsContent value="emails" className="mt-6">
              <AdminSection
                title="临时邮箱总览"
                description="按邮箱、用户、主题或发件人搜索，统一排查投递成功与归档失败的邮件。"
                actions={
                  <>
                    <Button variant="outline" size="sm" onClick={handleRefreshEmailData} disabled={loadingEmailData}>
                      刷新列表
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleResetEmailSearch} disabled={loadingEmailData && !emailDataLoaded}>
                      清空搜索
                    </Button>
                  </>
                }
              >
                <Card>
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle>搜索与排查</CardTitle>
                      <CardDescription>先筛选范围，再查看邮箱列表、正常邮件和归档邮件。</CardDescription>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      <Input
                        aria-label="搜索邮箱、用户、主题、发件人"
                        placeholder="搜索邮箱、用户、主题、发件人"
                        value={emailSearch}
                        onChange={(e) => setEmailSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            void handleSearchEmails()
                          }
                        }}
                        className="w-full sm:w-72"
                      />
                      <Button variant="outline" onClick={() => void handleSearchEmails()} className="w-full sm:w-auto" disabled={loadingEmailData}>
                        搜索
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">搜索范围说明</p>
                      <p className="mt-1">{getEmailSearchSummary(emailSearch)}</p>
                      <p className="mt-2 text-xs">{getEmailOverviewDescription(emailSearch)}</p>
                    </div>
                  </CardContent>
                </Card>

                {emailState ? (
                  emailState
                ) : (
                  <div className="grid gap-6 xl:grid-cols-1">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Mail className="h-4 w-4" />
                          邮箱列表 ({mailboxes.length})
                        </CardTitle>
                        <CardDescription>这里显示所有已创建的临时邮箱。</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {renderCompactStateMessage({
                          empty: mailboxes.length === 0,
                          emptyTitle: "暂无邮箱。",
                          emptyDescription: "换一个关键词搜索，或等待用户创建新的临时邮箱。",
                        }) || (isDesktop ? (
                          <div className="overflow-x-auto rounded-lg border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="min-w-[180px]">邮箱</TableHead>
                                  <TableHead className="min-w-[140px]">归属用户</TableHead>
                                  <TableHead className="w-20">状态</TableHead>
                                  <TableHead className="w-24 text-center">统计</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {mailboxes.map((mailbox) => (
                                  <TableRow key={mailbox.id}>
                                    <TableCell>
                                      <div className="min-w-0">
                                        <p className="truncate font-mono text-sm">{mailbox.emailAddress}</p>
                                        <p className="text-xs text-muted-foreground">{formatDate(mailbox.createdAt)}</p>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="min-w-0 text-sm">
                                        <p className="truncate">{getMailboxOwnerLabel(mailbox)}</p>
                                        {mailbox.userEmail && (
                                          <p className="truncate text-xs text-muted-foreground">{mailbox.userEmail}</p>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant={mailbox.isActive ? "secondary" : "outline"}>
                                        {mailbox.isActive ? "启用" : "停用"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <div className="space-y-1 text-xs text-muted-foreground">
                                        <div>{mailbox.messageCount} 封</div>
                                        <div>{mailbox.unreadCount} 未读</div>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {mailboxes.map((mailbox) => (
                              <div key={mailbox.id} className="rounded-lg border p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate font-mono text-sm">{mailbox.emailAddress}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(mailbox.createdAt)}</p>
                                  </div>
                                  <Badge variant={mailbox.isActive ? "secondary" : "outline"}>
                                    {mailbox.isActive ? "启用" : "停用"}
                                  </Badge>
                                </div>
                                <div className="mt-3 space-y-1 text-sm">
                                  <p className="truncate">{getMailboxOwnerLabel(mailbox)}</p>
                                  {mailbox.userEmail && <p className="truncate text-xs text-muted-foreground">{mailbox.userEmail}</p>}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  <Badge variant="outline">{mailbox.messageCount} 封</Badge>
                                  <Badge variant="outline">{mailbox.unreadCount} 未读</Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Inbox className="h-4 w-4" />
                          正常邮件 ({messages.length})
                        </CardTitle>
                        <CardDescription>这里显示已成功投递到用户邮箱的邮件。</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {renderCompactStateMessage({
                          empty: messages.length === 0,
                          emptyTitle: "暂无邮件。",
                          emptyDescription: "匹配成功的入站邮件会显示在这里。",
                        }) || (isDesktop ? (
                          <div className="overflow-x-auto rounded-lg border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="min-w-[180px]">收件邮箱</TableHead>
                                  <TableHead className="min-w-[180px]">发件人 / 主题</TableHead>
                                  <TableHead className="w-20">状态</TableHead>
                                  <TableHead className="hidden xl:table-cell">时间</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {messages.map((message) => (
                                  <TableRow key={message.id}>
                                    <TableCell>
                                      <div className="min-w-0 text-sm">
                                        <p className="truncate font-mono">{message.mailboxEmailAddress}</p>
                                        <p className="truncate text-xs text-muted-foreground">{getMailboxOwnerLabel(message)}</p>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="max-w-[280px]">
                                        <p className="truncate text-sm font-medium">{message.fromName || message.from}</p>
                                        <p className="truncate text-xs text-muted-foreground">{message.subject || "(无主题)"}</p>
                                        <p className="mt-1 truncate text-xs text-muted-foreground">{getEmailPreview(message.text, message.html)}</p>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex flex-wrap gap-2">
                                        <Badge variant={message.isRead ? "outline" : "secondary"}>
                                          {message.isRead ? "已读" : "未读"}
                                        </Badge>
                                        {message.hasAttachments && <Badge variant="outline">附件</Badge>}
                                      </div>
                                    </TableCell>
                                    <TableCell className="hidden xl:table-cell text-sm text-muted-foreground whitespace-nowrap">
                                      {formatDate(message.receivedAt)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {messages.map((message) => (
                              <div key={message.id} className="rounded-lg border p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate font-mono text-sm">{message.mailboxEmailAddress}</p>
                                    <p className="truncate text-xs text-muted-foreground">{getMailboxOwnerLabel(message)}</p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Badge variant={message.isRead ? "outline" : "secondary"}>
                                      {message.isRead ? "已读" : "未读"}
                                    </Badge>
                                    {message.hasAttachments && <Badge variant="outline">附件</Badge>}
                                  </div>
                                </div>
                                <div className="mt-3 max-w-full">
                                  <p className="truncate text-sm font-medium">{message.fromName || message.from}</p>
                                  <p className="truncate text-xs text-muted-foreground">{message.subject || "(无主题)"}</p>
                                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{getEmailPreview(message.text, message.html)}</p>
                                  <p className="mt-2 text-xs text-muted-foreground">{formatDate(message.receivedAt)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Archive className="h-4 w-4" />
                          归档邮件 ({archives.length})
                        </CardTitle>
                        <CardDescription>这里显示未匹配到邮箱的邮件及其归档原因。</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {renderCompactStateMessage({
                          empty: archives.length === 0,
                          emptyTitle: "暂无归档邮件。",
                          emptyDescription: "未命中邮箱或其他归档场景会显示在这里。",
                        }) || (isDesktop ? (
                          <div className="overflow-x-auto rounded-lg border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="min-w-[180px]">目标邮箱</TableHead>
                                  <TableHead className="min-w-[180px]">发件人 / 主题</TableHead>
                                  <TableHead className="w-24">原因</TableHead>
                                  <TableHead className="hidden xl:table-cell">时间</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {archives.map((archive) => (
                                  <TableRow key={archive.id}>
                                    <TableCell>
                                      <div className="min-w-0 text-sm">
                                        <p className="truncate font-mono">{archive.toEmail}</p>
                                        <p className="truncate text-xs text-muted-foreground">{archive.messageId || "无 Message-ID"}</p>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="max-w-[280px]">
                                        <p className="truncate text-sm font-medium">{archive.fromName || archive.from}</p>
                                        <p className="truncate text-xs text-muted-foreground">{archive.subject || "(无主题)"}</p>
                                        <p className="mt-1 truncate text-xs text-muted-foreground">{getEmailPreview(archive.text, archive.html)}</p>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex flex-wrap gap-2">
                                        <Badge variant="destructive">{archive.failureReason}</Badge>
                                        {archive.hasAttachments && <Badge variant="outline">附件</Badge>}
                                      </div>
                                    </TableCell>
                                    <TableCell className="hidden xl:table-cell text-sm text-muted-foreground whitespace-nowrap">
                                      {formatDate(archive.receivedAt)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {archives.map((archive) => (
                              <div key={archive.id} className="rounded-lg border p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate font-mono text-sm">{archive.toEmail}</p>
                                    <p className="truncate text-xs text-muted-foreground">{archive.messageId || "无 Message-ID"}</p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Badge variant="destructive">{archive.failureReason}</Badge>
                                    {archive.hasAttachments && <Badge variant="outline">附件</Badge>}
                                  </div>
                                </div>
                                <div className="mt-3 max-w-full">
                                  <p className="truncate text-sm font-medium">{archive.fromName || archive.from}</p>
                                  <p className="truncate text-xs text-muted-foreground">{archive.subject || "(无主题)"}</p>
                                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{getEmailPreview(archive.text, archive.html)}</p>
                                  <p className="mt-2 text-xs text-muted-foreground">{formatDate(archive.receivedAt)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </AdminSection>
            </TabsContent>

            <TabsContent value="settings" className="mt-6">
              <AdminSection
                title="站点设置与域名配置"
                description="保存基础参数后，再在右侧维护短链域名和邮箱域名。"
                actions={<Button variant="outline" size="sm" onClick={handleRefreshSettings} disabled={loading}>刷新配置</Button>}
              >
                <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
                  <Card>
                    <CardHeader>
                      <CardTitle>网站设置</CardTitle>
                      <CardDescription>配置您的 Shortly 实例</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="siteName">网站名称</Label>
                        <Input
                          id="siteName"
                          value={settings.siteName}
                          onChange={(e) => setSettings((s) => ({ ...s, siteName: e.target.value }))}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="siteUrl">站点地址</Label>
                        <Input
                          id="siteUrl"
                          type="url"
                          value={settings.siteUrl}
                          onChange={(e) => setSettings((s) => ({ ...s, siteUrl: e.target.value }))}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="allowAnonymous"
                          checked={settings.allowAnonymous}
                          onChange={(e) => setSettings((s) => ({ ...s, allowAnonymous: e.target.checked }))}
                          className="h-4 w-4 rounded border"
                        />
                        <Label htmlFor="allowAnonymous">允许匿名创建短链</Label>
                      </div>
                      {settings.allowAnonymous && (
                        <>
                          <div className="mt-2 border-t pt-2">
                            <div className="flex flex-col gap-1.5">
                              <Label htmlFor="anonMaxLinksPerHour">匿名用户每小时最大创建数</Label>
                              <Input
                                id="anonMaxLinksPerHour"
                                type="number"
                                min="1"
                                value={settings.anonMaxLinksPerHour}
                                onChange={(e) =>
                                  setSettings((s) => ({ ...s, anonMaxLinksPerHour: parseInt(e.target.value) || 0 }))
                                }
                              />
                              <p className="text-xs text-muted-foreground">控制匿名访问者每小时最多可创建多少条短链。</p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="anonMaxClicks">匿名用户最大点击数</Label>
                            <Input
                              id="anonMaxClicks"
                              type="number"
                              min="1"
                              value={settings.anonMaxClicks}
                              onChange={(e) =>
                                setSettings((s) => ({ ...s, anonMaxClicks: parseInt(e.target.value) || 0 }))
                              }
                            />
                            <p className="text-xs text-muted-foreground">控制匿名创建的短链在失效前最多允许多少次访问。</p>
                          </div>
                        </>
                      )}
                      <div className="mt-2 border-t pt-2">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="userMaxLinksPerHour">用户每小时最大创建数</Label>
                          <Input
                            id="userMaxLinksPerHour"
                            type="number"
                            min="1"
                            value={settings.userMaxLinksPerHour}
                            onChange={(e) =>
                              setSettings((s) => ({ ...s, userMaxLinksPerHour: parseInt(e.target.value) || 0 }))
                            }
                          />
                          <p className="text-xs text-muted-foreground">控制登录用户每小时最多可创建多少条短链。</p>
                        </div>
                      </div>
                      <Button onClick={handleSaveSettings} disabled={savingSettings} className="mt-2 w-fit">
                        <Save className="h-4 w-4" />
                        {savingSettings ? "保存中..." : "保存设置"}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle>域名配置</CardTitle>
                        <CardDescription>管理短链接与临时邮箱可用域名</CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={handleRefreshDomains} disabled={loading}>
                          刷新列表
                        </Button>
                        <Button onClick={openCreateDomainDialog} size="sm" className="w-full sm:w-auto">
                          <Plus className="h-4 w-4" />
                          新增域名
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {domainsState || (
                        <div className="overflow-x-auto rounded-lg border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="min-w-[180px]">域名</TableHead>
                                <TableHead className="min-w-[180px]">能力</TableHead>
                                <TableHead className="min-w-[180px]">默认</TableHead>
                                <TableHead className="w-24">状态</TableHead>
                                <TableHead className="w-32 hidden md:table-cell">创建时间</TableHead>
                                <TableHead className="w-24 text-right">操作</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {domains.map((domain) => (
                                <TableRow key={domain.id}>
                                  <TableCell className="font-mono text-sm">{domain.host}</TableCell>
                                  <TableCell>
                                    <div className="flex flex-wrap gap-2">
                                      {domain.supportsShortLinks && <Badge variant="secondary">短链</Badge>}
                                      {domain.supportsTempEmail && <Badge variant="secondary">邮箱</Badge>}
                                      {!domain.supportsShortLinks && !domain.supportsTempEmail && (
                                        <span className="text-sm text-muted-foreground">未启用能力</span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex flex-wrap gap-2">
                                      {domain.isDefaultShortDomain && <Badge>默认短链</Badge>}
                                      {domain.isDefaultEmailDomain && <Badge>默认邮箱</Badge>}
                                      {!domain.isDefaultShortDomain && !domain.isDefaultEmailDomain && (
                                        <span className="text-sm text-muted-foreground">—</span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={domain.isActive ? "secondary" : "outline"}>
                                      {domain.isActive ? "启用" : "停用"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                                    {formatDate(domain.createdAt)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() => openEditDomainDialog(domain)}
                                        title="编辑域名"
                                        aria-label={`编辑域名 ${domain.host}`}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() => setPendingDeleteDomain(domain)}
                                        className="text-destructive hover:text-destructive"
                                        title="删除域名"
                                        aria-label={`删除域名 ${domain.host}`}
                                        disabled={domain.isDefaultShortDomain || domain.isDefaultEmailDomain}
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
                      )}
                    </CardContent>
                  </Card>
                </div>
              </AdminSection>
            </TabsContent>
          </Tabs>
        </section>
      </main>

      <Dialog open={domainDialogOpen} onOpenChange={(open) => {
        setDomainDialogOpen(open)
        if (!open) resetDomainForm()
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDomain ? "编辑域名" : "新增域名"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="domainHost">域名</Label>
              <Input
                id="domainHost"
                placeholder="example.com"
                value={domainForm.host}
                onChange={(e) => updateDomainForm("host", e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={domainForm.supportsShortLinks}
                  onChange={(e) => updateDomainForm("supportsShortLinks", e.target.checked)}
                  className="h-4 w-4 rounded border"
                />
                支持短链接
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={domainForm.supportsTempEmail}
                  onChange={(e) => updateDomainForm("supportsTempEmail", e.target.checked)}
                  className="h-4 w-4 rounded border"
                />
                支持临时邮箱
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={domainForm.isActive}
                  onChange={(e) => updateDomainForm("isActive", e.target.checked)}
                  className="h-4 w-4 rounded border"
                />
                启用域名
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={domainForm.isDefaultShortDomain}
                  onChange={(e) => updateDomainForm("isDefaultShortDomain", e.target.checked)}
                  className="h-4 w-4 rounded border"
                  disabled={!domainForm.supportsShortLinks || !domainForm.isActive}
                />
                默认短链域名
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={domainForm.isDefaultEmailDomain}
                  onChange={(e) => updateDomainForm("isDefaultEmailDomain", e.target.checked)}
                  className="h-4 w-4 rounded border"
                  disabled={!domainForm.supportsTempEmail || !domainForm.isActive}
                />
                默认邮箱域名
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDomainDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSaveDomain} disabled={savingDomain}>
                <Save className="h-4 w-4" />
                {savingDomain ? "保存中..." : editingDomain ? "保存修改" : "创建域名"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={logsDialogOpen} onOpenChange={closeLogsDialog}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              日志记录 — <span className="font-mono">/{selectedLink?.slug}</span>
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
              正在加载日志...
            </div>
          ) : logsError ? (
            <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-10 text-center text-sm text-destructive">
              <p className="font-medium">日志加载失败</p>
              <p className="mt-2">{logsError}</p>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={handleRefreshLogs}>
                重试加载
              </Button>
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              <p>{getLogsEmptyStateMessage(selectedLink)}</p>
              {selectedLink && <p className="mt-2 text-xs">你可以稍后刷新日志，或先打开短链验证访问链路。</p>}
            </div>
          ) : isDesktop ? (
            <div className="max-h-80 overflow-y-auto overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">时间</TableHead>
                    <TableHead className="min-w-[120px]">事件</TableHead>
                    <TableHead className="w-20 text-center hidden sm:table-cell">状态码</TableHead>
                    <TableHead className="min-w-[140px]">来源</TableHead>
                    <TableHead className="hidden md:table-cell">IP</TableHead>
                    <TableHead className="hidden lg:table-cell">浏览器</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant={getLogBadgeVariant(log.eventType)}>{getLogEventLabel(log.eventType)}</Badge>
                      </TableCell>
                      <TableCell className="hidden text-center text-sm text-muted-foreground sm:table-cell">
                        {log.statusCode ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm">
                        {log.referrer || <span className="text-muted-foreground">直接访问</span>}
                      </TableCell>
                      <TableCell className="hidden max-w-[160px] truncate text-sm text-muted-foreground md:table-cell">
                        {log.ipAddress || "—"}
                      </TableCell>
                      <TableCell className="hidden max-w-[160px] truncate text-sm text-muted-foreground lg:table-cell">
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
                    <Badge variant={getLogBadgeVariant(log.eventType)}>{getLogEventLabel(log.eventType)}</Badge>
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
                  /{pendingDeleteLink.slug}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteLink(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => pendingDeleteLink && handleDeleteLinkConfirm(pendingDeleteLink)}
              disabled={!!deletingLinkId}
            >
              {deletingLinkId ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDeleteDomain} onOpenChange={(open) => !open && setPendingDeleteDomain(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除域名？</DialogTitle>
            <DialogDescription>
              {pendingDeleteDomain ? getDomainDeleteHelpText(pendingDeleteDomain) : "删除后将无法恢复。"}
              {pendingDeleteDomain && (
                <span className="mt-2 block font-mono text-xs text-muted-foreground">
                  {pendingDeleteDomain.host}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteDomain(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => pendingDeleteDomain && handleDeleteDomainConfirm(pendingDeleteDomain)}
              disabled={!!deletingDomainId}
            >
              {deletingDomainId ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
