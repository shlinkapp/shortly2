"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { Archive, ArrowLeft, BarChart2, ExternalLink, Inbox, Link2, Mail, Pencil, Plus, Save, Settings2, Shield, Trash2, Users } from "lucide-react"
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
  telegramBotUsername: string
  userMaxLinksPerHour: number
}

interface SiteDomain {
  id: string
  host: string
  supportsShortLinks: boolean
  shortLinkMinSlugLength: number
  supportsTempEmail: boolean
  tempEmailMinLocalPartLength: number
  isActive: boolean
  isDefaultShortDomain: boolean
  isDefaultEmailDomain: boolean
  createdAt: number
}

interface DomainFormState {
  host: string
  supportsShortLinks: boolean
  shortLinkMinSlugLength: number
  supportsTempEmail: boolean
  tempEmailMinLocalPartLength: number
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

interface MessageHeaderRecord {
  name: string
  value: string
}

interface MessageContactRecord {
  name?: string | null
  address?: string | null
}

interface MessageAttachmentRecord {
  id: string
  filename: string
  mimeType: string
  size: number
}

interface AdminMailboxMessageDetail {
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
  cc: MessageContactRecord[]
  replyTo: MessageContactRecord[]
  headers: MessageHeaderRecord[]
  attachments: MessageAttachmentRecord[]
  hasText: boolean
  hasHtml: boolean
  hasAttachments: boolean
}

interface ArchivedInboundEmailDetail {
  id: string
  toEmail: string
  messageId: string | null
  from: string
  fromName: string | null
  subject: string
  text: string
  html: string
  receivedAt: string | number
  cc: MessageContactRecord[]
  replyTo: MessageContactRecord[]
  headers: MessageHeaderRecord[]
  attachments: MessageAttachmentRecord[]
  failureReason: string
  hasText: boolean
  hasHtml: boolean
  hasAttachments: boolean
}

type MessageDetailTab = "text" | "html" | "source"
type AdminEmailSelection =
  | { kind: "message"; summary: AdminMailboxMessage }
  | { kind: "archive"; summary: ArchivedInboundEmail }
type AdminEmailDetailRecord = AdminMailboxMessageDetail | ArchivedInboundEmailDetail

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
  shortLinkMinSlugLength: 1,
  supportsTempEmail: false,
  tempEmailMinLocalPartLength: 1,
  isActive: true,
  isDefaultShortDomain: false,
  isDefaultEmailDomain: false,
}

const adminReporter = createClientErrorReporter("admin_client")

function getDeleteLinkSuccessState(remainingItems: number, currentPage: number) {
  if (remainingItems > 0) {
    return { nextPage: currentPage, shouldRefetch: false }
  }

  if (currentPage > 1) {
    return { nextPage: currentPage - 1, shouldRefetch: true }
  }

  return { nextPage: 1, shouldRefetch: true }
}

function getDomainDeleteHelpText(domain: SiteDomain) {
  if (domain.isDefaultShortDomain || domain.isDefaultEmailDomain) {
    return "默认域名不能直接删除，请先切换默认域名。"
  }

  return "删除后将无法恢复。"
}

function getDefaultDetailTab(): MessageDetailTab {
  return "text"
}

function formatMessageContact(contact: MessageContactRecord) {
  if (contact.name && contact.address) {
    return `${contact.name} <${contact.address}>`
  }

  return contact.address || contact.name || ""
}

const iframeSandbox = "allow-popups-to-escape-sandbox"
const iframeSrcDocPrefix = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><base target=\"_blank\"><style>body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;line-height:1.6;padding:16px;margin:0;word-break:break-word}img{max-width:100%;height:auto}pre{white-space:pre-wrap}table{max-width:100%;border-collapse:collapse}a{color:#2563eb}</style></head><body>"
const iframeSrcDocSuffix = "</body></html>"

function buildIframeSrcDoc(html: string) {
  return `${iframeSrcDocPrefix}${html}${iframeSrcDocSuffix}`
}

function getOpenMessageSubjectButtonClassName() {
  return "truncate text-left text-sm text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
}

function getOpenMessageSubjectMobileButtonClassName() {
  return "w-full text-left text-sm text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
}

function getMessageDetailDialogClassName() {
  return "flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col gap-0"
}

function buildAdminEmailSource(detail: AdminEmailDetailRecord, selection: AdminEmailSelection) {
  const lines: string[] = []

  if (detail.messageId) {
    lines.push(`Message-ID: ${detail.messageId}`)
  }
  lines.push(`From: ${detail.fromName ? `${detail.fromName} <${detail.from}>` : detail.from}`)
  if (selection.kind === "message" && "mailboxEmailAddress" in detail) {
    lines.push(`To: ${detail.mailboxEmailAddress}`)
  } else if (selection.kind === "archive" && "toEmail" in detail) {
    lines.push(`To: ${detail.toEmail}`)
  }
  if (detail.replyTo.length > 0) {
    lines.push(`Reply-To: ${detail.replyTo.map(formatMessageContact).filter(Boolean).join(", ")}`)
  }
  if (detail.cc.length > 0) {
    lines.push(`Cc: ${detail.cc.map(formatMessageContact).filter(Boolean).join(", ")}`)
  }
  lines.push(`Subject: ${detail.subject || "(无主题)"}`)
  lines.push(`Date: ${formatDate(detail.receivedAt)}`)

  if (selection.kind === "message" && "mailboxEmailAddress" in detail) {
    lines.push(`Mailbox: ${detail.mailboxEmailAddress}`)
    lines.push(`User: ${detail.userName || detail.userEmail || detail.userId}`)
    lines.push(`Read: ${detail.isRead ? "yes" : "no"}`)
  } else if (selection.kind === "archive" && "failureReason" in detail) {
    lines.push(`Failure-Reason: ${detail.failureReason}`)
  }

  for (const header of detail.headers) {
    if (!header?.name || !header?.value) continue
    lines.push(`${header.name}: ${header.value}`)
  }

  if (detail.attachments.length > 0) {
    lines.push(`Attachments: ${detail.attachments.map((attachment) => attachment.filename).join(", ")}`)
  }

  lines.push("", "--- TEXT ---", detail.text || "(无纯文本内容)", "", "--- HTML ---", detail.html || "(无 HTML 内容)")

  return lines.join("\n")
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
  const [selectedEmailItem, setSelectedEmailItem] = useState<AdminEmailSelection | null>(null)
  const [emailDetail, setEmailDetail] = useState<AdminEmailDetailRecord | null>(null)
  const [emailDetailError, setEmailDetailError] = useState<string | null>(null)
  const [loadingEmailDetail, setLoadingEmailDetail] = useState(false)
  const [emailDetailTab, setEmailDetailTab] = useState<MessageDetailTab>("text")
  const latestEmailDetailRequestIdRef = useRef(0)
  const [settings, setSettings] = useState<SiteSettings>({
    siteName: "Shortly",
    siteUrl: "http://localhost:3000",
    telegramBotUsername: "",
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
        telegramBotUsername: s.telegramBotUsername || "",
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

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (activeTab === "emails" && !emailDataLoaded && !loadingEmailData) {
      void fetchEmailData()
    }
  }, [activeTab, emailDataLoaded, loadingEmailData, fetchEmailData])

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

  async function handleSearchEmails() {
    await fetchEmailData(emailSearch)
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
      shortLinkMinSlugLength: domain.shortLinkMinSlugLength,
      supportsTempEmail: domain.supportsTempEmail,
      tempEmailMinLocalPartLength: domain.tempEmailMinLocalPartLength,
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

  async function handleRefreshLogs() {
    if (!selectedLink) return
    await handleViewLogs(selectedLink)
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
    setDomainForm((prev) => {
      const next = { ...prev, [key]: value }

      if (key === "supportsShortLinks" && !value) {
        next.shortLinkMinSlugLength = 1
        next.isDefaultShortDomain = false
      }

      if (key === "supportsTempEmail" && !value) {
        next.tempEmailMinLocalPartLength = 1
        next.isDefaultEmailDomain = false
      }

      if (key === "isActive" && !value) {
        next.isDefaultShortDomain = false
        next.isDefaultEmailDomain = false
      }

      return next
    })
  }

  function getEmailPreview(text: string, html: string) {
    return (text || html || "").replace(/\s+/g, " ").trim() || "无正文"
  }

  function getMailboxOwnerLabel(item: { userName: string | null, userEmail: string | null }) {
    return item.userName || item.userEmail || "未知用户"
  }

  const emailDetailSource = useMemo(() => {
    if (!selectedEmailItem || !emailDetail) {
      return ""
    }

    return buildAdminEmailSource(emailDetail, selectedEmailItem)
  }, [emailDetail, selectedEmailItem])

  async function openEmailDetail(selection: AdminEmailSelection) {
    const requestId = latestEmailDetailRequestIdRef.current + 1
    latestEmailDetailRequestIdRef.current = requestId
    setSelectedEmailItem(selection)
    setEmailDetail(null)
    setEmailDetailError(null)
    setLoadingEmailDetail(true)
    setEmailDetailTab(getDefaultDetailTab())

    const endpoint = selection.kind === "message"
      ? `/api/admin/emails/messages/${selection.summary.id}`
      : `/api/admin/emails/archives/${selection.summary.id}`

    try {
      const res = await fetch(endpoint)
      if (!res.ok) {
        const body = await readOptionalJson<{ error?: string }>(res)
        const message = getResponseErrorMessage(body, "加载邮件详情失败")
        adminReporter.warn("fetch_admin_email_detail_failed_response", {
          kind: selection.kind,
          itemId: selection.summary.id,
          status: res.status,
        })
        if (latestEmailDetailRequestIdRef.current !== requestId) {
          return
        }
        setEmailDetailError(message)
        return
      }

      const body = await res.json() as { data?: AdminEmailDetailRecord }
      if (latestEmailDetailRequestIdRef.current !== requestId) {
        return
      }
      setEmailDetail(body.data || null)
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "加载邮件详情失败")
      adminReporter.report("fetch_admin_email_detail_failed_exception", error, {
        kind: selection.kind,
        itemId: selection.summary.id,
      })
      if (latestEmailDetailRequestIdRef.current !== requestId) {
        return
      }
      setEmailDetailError(message)
    } finally {
      if (latestEmailDetailRequestIdRef.current === requestId) {
        setLoadingEmailDetail(false)
      }
    }
  }

  function handleEmailDetailDialogOpenChange(open: boolean) {
    if (open) {
      return
    }

    latestEmailDetailRequestIdRef.current += 1
    setSelectedEmailItem(null)
    setEmailDetail(null)
    setEmailDetailError(null)
    setLoadingEmailDetail(false)
    setEmailDetailTab(getDefaultDetailTab())
  }

  const activeTabLabel =
    activeTab === "links"
      ? "链接管理"
      : activeTab === "users"
        ? "用户管理"
        : activeTab === "emails"
          ? "邮箱排查"
          : "站点设置"

  return (
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
            <SidebarGroupLabel>管理导航</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    isActive={activeTab === "links"}
                    onClick={() => handleChangeTab("links")}
                    tooltip="链接管理"
                  >
                    <Link2 className="h-4 w-4" />
                    <span>链接</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    isActive={activeTab === "users"}
                    onClick={() => handleChangeTab("users")}
                    tooltip="用户管理"
                  >
                    <Users className="h-4 w-4" />
                    <span>用户</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    isActive={activeTab === "emails"}
                    onClick={() => handleChangeTab("emails")}
                    tooltip="邮箱排查"
                  >
                    <Mail className="h-4 w-4" />
                    <span>邮箱</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    isActive={activeTab === "settings"}
                    onClick={() => handleChangeTab("settings")}
                    tooltip="站点设置"
                  >
                    <Settings2 className="h-4 w-4" />
                    <span>设置</span>
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
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <h1 className="text-sm font-medium">{activeTabLabel}</h1>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Tabs value={activeTab} onValueChange={handleChangeTab} className="space-y-6">
            <TabsContent value="links" className="mt-0">
            <Card>
              <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">链接</CardTitle>
                <Button variant="outline" size="sm" onClick={handleRefreshLinks} disabled={loading}>刷新</Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="py-14 text-center text-sm text-muted-foreground">正在加载...</div>
                ) : dataError ? (
                  <div className="space-y-4 py-14 text-center text-sm text-destructive">
                    <p>{dataError}</p>
                    <Button type="button" variant="outline" size="sm" onClick={handleRefreshLinks}>重试</Button>
                  </div>
                ) : links.length === 0 ? (
                  <div className="py-14 text-center text-sm text-muted-foreground">
                    {linksPage > 1 ? "这一页没有记录。" : "还没有链接。"}
                  </div>
                ) : (
                  <>
                    {isDesktop ? (
                      <div className="overflow-x-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[100px]">短链</TableHead>
                              <TableHead className="min-w-[160px]">目标</TableHead>
                              <TableHead className="hidden sm:table-cell">用户</TableHead>
                              <TableHead className="w-20 text-center hidden sm:table-cell">点击</TableHead>
                              <TableHead className="w-28 text-center hidden md:table-cell">限制</TableHead>
                              <TableHead className="w-32 hidden lg:table-cell">到期</TableHead>
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
                                  {link.userEmail || <span className="italic">匿名</span>}
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
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                                  {link.hasExpiration ? formatDate(link.expiresAt) : "—"}
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
                                <p className="mt-1 truncate text-xs text-muted-foreground">{link.userEmail || "匿名"}</p>
                              </div>
                              <Badge variant={link.isExpired ? "destructive" : "secondary"}>
                                {link.isExpired ? "已失效" : "有效"}
                              </Badge>
                            </div>

                            <div className="mt-3 space-y-2 text-sm">
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
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">点击 {link.clicks}</Badge>
                                <Badge variant="outline">
                                  {link.hasClickLimit ? `限制 ${link.clicks}/${link.maxClicks ?? "—"}` : "不限点击"}
                                </Badge>
                                <Badge variant="outline">
                                  {link.hasExpiration ? `到期 ${formatDate(link.expiresAt)}` : "长期有效"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{formatDate(link.createdAt)}</p>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleViewLogs(link)}>
                                <BarChart2 className="h-4 w-4" />
                                日志
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

                    {linksTotalPages > 1 && !dataError && (
                      <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <div>{linksPage} / {linksTotalPages}</div>
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
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="mt-0">
            <Card>
              <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">用户</CardTitle>
                <Button variant="outline" size="sm" onClick={handleRefreshUsers} disabled={loading}>刷新</Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="py-14 text-center text-sm text-muted-foreground">正在加载...</div>
                ) : dataError ? (
                  <div className="space-y-4 py-14 text-center text-sm text-destructive">
                    <p>{dataError}</p>
                    <Button type="button" variant="outline" size="sm" onClick={handleRefreshUsers}>重试</Button>
                  </div>
                ) : users.length === 0 ? (
                  <div className="py-14 text-center text-sm text-muted-foreground">还没有用户。</div>
                ) : isDesktop ? (
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
                          <Badge variant="outline">{formatDate(u.createdAt)}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="emails" className="mt-0 space-y-6">
            <Card>
              <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">邮箱排查</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleRefreshEmailData} disabled={loadingEmailData}>刷新</Button>
                  <Button variant="outline" size="sm" onClick={handleResetEmailSearch} disabled={loadingEmailData && !emailDataLoaded}>清空</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex w-full flex-col gap-2 sm:flex-row">
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
              </CardContent>
            </Card>

            {loadingEmailData && !emailDataLoaded ? (
              <div className="py-14 text-center text-sm text-muted-foreground">正在加载...</div>
            ) : emailDataError ? (
              <div className="space-y-4 py-14 text-center text-sm text-destructive">
                <p>{emailDataError}</p>
                <Button type="button" variant="outline" size="sm" onClick={handleRefreshEmailData}>重试</Button>
              </div>
            ) : emailDataLoaded && mailboxes.length === 0 && messages.length === 0 && archives.length === 0 ? (
              <div className="py-14 text-center text-sm text-muted-foreground">
                {emailSearch.trim() ? "没有匹配结果。" : "还没有邮箱数据。"}
              </div>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Mail className="h-4 w-4" />
                      邮箱 ({mailboxes.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {mailboxes.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">没有邮箱。</div>
                    ) : isDesktop ? (
                      <div className="overflow-x-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[180px]">邮箱</TableHead>
                              <TableHead className="min-w-[140px]">用户</TableHead>
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
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Inbox className="h-4 w-4" />
                      正常邮件 ({messages.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {messages.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">没有邮件。</div>
                    ) : isDesktop ? (
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
                                    <button
                                      type="button"
                                      className={getOpenMessageSubjectButtonClassName()}
                                      onClick={() => void openEmailDetail({ kind: "message", summary: message })}
                                    >
                                      {message.subject || "(无主题)"}
                                    </button>
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
                              <button
                                type="button"
                                className={getOpenMessageSubjectMobileButtonClassName()}
                                onClick={() => void openEmailDetail({ kind: "message", summary: message })}
                              >
                                {message.subject || "(无主题)"}
                              </button>
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{getEmailPreview(message.text, message.html)}</p>
                              <p className="mt-2 text-xs text-muted-foreground">{formatDate(message.receivedAt)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Archive className="h-4 w-4" />
                      归档邮件 ({archives.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {archives.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">没有归档邮件。</div>
                    ) : isDesktop ? (
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
                                    <button
                                      type="button"
                                      className={getOpenMessageSubjectButtonClassName()}
                                      onClick={() => void openEmailDetail({ kind: "archive", summary: archive })}
                                    >
                                      {archive.subject || "(无主题)"}
                                    </button>
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
                              <button
                                type="button"
                                className={getOpenMessageSubjectMobileButtonClassName()}
                                onClick={() => void openEmailDetail({ kind: "archive", summary: archive })}
                              >
                                {archive.subject || "(无主题)"}
                              </button>
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{getEmailPreview(archive.text, archive.html)}</p>
                              <p className="mt-2 text-xs text-muted-foreground">{formatDate(archive.receivedAt)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
              <Card>
                <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">站点设置</CardTitle>
                  <Button variant="outline" size="sm" onClick={handleRefreshSettings} disabled={loading}>刷新</Button>
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
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="telegramBotUsername">TG Bot 用户名</Label>
                    <Input
                      id="telegramBotUsername"
                      placeholder="例如：shortly_bot（可填写 @shortly_bot）"
                      value={settings.telegramBotUsername}
                      onChange={(e) => setSettings((s) => ({ ...s, telegramBotUsername: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      设置后，用户后台 API 页面会显示机器人绑定提示：`/setkey &lt;api_key&gt;`。
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="userMaxLinksPerHour">用户每小时创建数（短链 / 临时邮箱）</Label>
                    <Input
                      id="userMaxLinksPerHour"
                      type="number"
                      min="1"
                      value={settings.userMaxLinksPerHour}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, userMaxLinksPerHour: parseInt(e.target.value) || 0 }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      该上限同时应用于短链创建和临时邮箱创建。
                    </p>
                  </div>
                  <Button onClick={handleSaveSettings} disabled={savingSettings} className="mt-2 w-fit">
                    <Save className="h-4 w-4" />
                    {savingSettings ? "保存中..." : "保存"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">域名</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handleRefreshDomains} disabled={loading}>
                      刷新
                    </Button>
                    <Button onClick={openCreateDomainDialog} size="sm" className="w-full sm:w-auto">
                      <Plus className="h-4 w-4" />
                      新增
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="py-14 text-center text-sm text-muted-foreground">正在加载...</div>
                  ) : dataError ? (
                    <div className="space-y-4 py-14 text-center text-sm text-destructive">
                      <p>{dataError}</p>
                      <Button type="button" variant="outline" size="sm" onClick={handleRefreshDomains}>重试</Button>
                    </div>
                  ) : domains.length === 0 ? (
                    <div className="py-14 text-center text-sm text-muted-foreground">还没有域名。</div>
                  ) : (
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
                                  {domain.supportsShortLinks && (
                                    <Badge variant="secondary">短链 ≥ {domain.shortLinkMinSlugLength}</Badge>
                                  )}
                                  {domain.supportsTempEmail && (
                                    <Badge variant="secondary">邮箱前缀 ≥ {domain.tempEmailMinLocalPartLength}</Badge>
                                  )}
                                  {!domain.supportsShortLinks && !domain.supportsTempEmail && (
                                    <span className="text-sm text-muted-foreground">—</span>
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
          </TabsContent>
        </Tabs>
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

            {domainForm.supportsShortLinks && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="domainShortLinkMinSlugLength">短链最短后缀长度</Label>
                <Input
                  id="domainShortLinkMinSlugLength"
                  type="number"
                  min="1"
                  max="50"
                  value={domainForm.shortLinkMinSlugLength}
                  onChange={(e) =>
                    updateDomainForm("shortLinkMinSlugLength", Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)))
                  }
                />
                <p className="text-xs text-muted-foreground">自定义短链后缀少于该长度时将被拒绝。</p>
              </div>
            )}

            {domainForm.supportsTempEmail && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="domainTempEmailMinLocalPartLength">邮箱前缀最短长度</Label>
                <Input
                  id="domainTempEmailMinLocalPartLength"
                  type="number"
                  min="1"
                  max="64"
                  value={domainForm.tempEmailMinLocalPartLength}
                  onChange={(e) =>
                    updateDomainForm("tempEmailMinLocalPartLength", Math.min(64, Math.max(1, parseInt(e.target.value, 10) || 1)))
                  }
                />
                <p className="text-xs text-muted-foreground">邮箱地址中 @ 前的前缀少于该长度时将被拒绝。</p>
              </div>
            )}

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

      <Dialog open={!!selectedEmailItem} onOpenChange={handleEmailDetailDialogOpenChange}>
        <DialogContent className={getMessageDetailDialogClassName()}>
          <DialogHeader className="border-b pb-4 pr-8">
            <DialogTitle className="truncate">{selectedEmailItem?.summary.subject || "(无主题)"}</DialogTitle>
            <DialogDescription className="space-y-2 pt-2 text-xs sm:text-sm">
              {selectedEmailItem?.kind === "message" ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">正常邮件</Badge>
                    {emailDetail && "isRead" in emailDetail && (
                      <Badge variant={emailDetail.isRead ? "outline" : "secondary"}>{emailDetail.isRead ? "已读" : "未读"}</Badge>
                    )}
                    {emailDetail?.hasAttachments && <Badge variant="outline">附件 {emailDetail.attachments.length}</Badge>}
                  </div>
                  <div className="space-y-1 text-muted-foreground">
                    <p>发件人：{selectedEmailItem.summary.fromName || selectedEmailItem.summary.from}</p>
                    <p>收件邮箱：{selectedEmailItem.summary.mailboxEmailAddress}</p>
                    <p>所属用户：{getMailboxOwnerLabel(selectedEmailItem.summary)}</p>
                    <p>时间：{formatDate(selectedEmailItem.summary.receivedAt)}</p>
                  </div>
                </>
              ) : selectedEmailItem ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="destructive">{selectedEmailItem.summary.failureReason}</Badge>
                    {emailDetail?.hasAttachments && <Badge variant="outline">附件 {emailDetail.attachments.length}</Badge>}
                  </div>
                  <div className="space-y-1 text-muted-foreground">
                    <p>发件人：{selectedEmailItem.summary.fromName || selectedEmailItem.summary.from}</p>
                    <p>目标邮箱：{selectedEmailItem.summary.toEmail}</p>
                    <p>时间：{formatDate(selectedEmailItem.summary.receivedAt)}</p>
                  </div>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden py-4">
            {loadingEmailDetail ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">正在加载邮件详情...</div>
            ) : emailDetailError ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-sm text-destructive">
                <p>{emailDetailError}</p>
                {selectedEmailItem && (
                  <Button type="button" variant="outline" size="sm" onClick={() => void openEmailDetail(selectedEmailItem)}>
                    重试
                  </Button>
                )}
              </div>
            ) : emailDetail ? (
              <Tabs value={emailDetailTab} onValueChange={(value) => setEmailDetailTab(value as MessageDetailTab)} className="flex h-full flex-col gap-4">
                <TabsList className="w-fit">
                  <TabsTrigger value="text">TXT</TabsTrigger>
                  <TabsTrigger value="html">HTML</TabsTrigger>
                  <TabsTrigger value="source">源码</TabsTrigger>
                </TabsList>

                <TabsContent value="text" className="mt-0 flex-1 overflow-hidden">
                  <div className="h-full overflow-auto rounded-lg border bg-muted/20 p-4">
                    {emailDetail.hasText ? (
                      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">{emailDetail.text}</pre>
                    ) : (
                      <div className="text-sm text-muted-foreground">该邮件没有纯文本内容。</div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="html" className="mt-0 flex-1 overflow-hidden">
                  <div className="h-full overflow-hidden rounded-lg border bg-background">
                    {emailDetail.hasHtml ? (
                      <iframe
                        title="邮件 HTML 预览"
                        srcDoc={buildIframeSrcDoc(emailDetail.html)}
                        sandbox={iframeSandbox}
                        className="h-full w-full border-0"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">该邮件没有 HTML 内容。</div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="source" className="mt-0 flex-1 overflow-hidden">
                  <div className="h-full overflow-auto rounded-lg border bg-muted/20 p-4">
                    <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-foreground">{emailDetailSource}</pre>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">没有可显示的邮件详情。</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={logsDialogOpen} onOpenChange={closeLogsDialog}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              日志
              {selectedLink && <span className="ml-2 font-mono text-sm text-muted-foreground">/{selectedLink.slug}</span>}
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
              <Button type="button" variant="outline" size="sm" onClick={handleRefreshLogs}>重试</Button>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {selectedLink ? "还没有日志。" : "先选择一条短链。"}
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
      </SidebarInset>
    </SidebarProvider>
  )
}
