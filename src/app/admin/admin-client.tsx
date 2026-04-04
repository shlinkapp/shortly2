"use client"

import { useState, useEffect, useCallback } from "react"
import { UserMenu } from "@/components/user-menu"
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
  originalUrl: string
  clicks: number
  maxClicks: number | null
  expiresAt: string | null
  hasClickLimit: boolean
  hasExpiration: boolean
  isExpired: boolean
  createdAt: number
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

export function AdminClient({ user }: AdminClientProps) {
  const [activeTab, setActiveTab] = useState("links")
  const [links, setLinks] = useState<AdminLink[]>([])
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

  function getLogBadgeVariant(eventType: string): "secondary" | "destructive" | "outline" {
    if (eventType.includes("blocked") || eventType.includes("deleted")) {
      return "destructive"
    }
    if (eventType === "redirect_success") {
      return "secondary"
    }
    return "outline"
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [linksRes, usersRes, settingsRes, domainsRes] = await Promise.all([
        fetch("/api/admin/links"),
        fetch("/api/admin/users"),
        fetch("/api/admin/settings"),
        fetch("/api/admin/domains"),
      ])
      if (linksRes.ok) {
        const data = await linksRes.json()
        setLinks(Array.isArray(data) ? data : data.data || [])
      }
      if (usersRes.ok) setUsers(await usersRes.json())
      if (settingsRes.ok) {
        const s = await settingsRes.json()
        setSettings({
          siteName: s.siteName,
          siteUrl: s.siteUrl,
          allowAnonymous: s.allowAnonymous,
          anonMaxLinksPerHour: s.anonMaxLinksPerHour,
          anonMaxClicks: s.anonMaxClicks,
          userMaxLinksPerHour: s.userMaxLinksPerHour,
        })
      }
      if (domainsRes.ok) {
        const data = await domainsRes.json()
        setDomains(Array.isArray(data) ? data : data.data || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const fetchEmailData = useCallback(async (search?: string) => {
    setLoadingEmailData(true)
    try {
      const query = search?.trim() ? `?page=1&limit=50&search=${encodeURIComponent(search.trim())}` : "?page=1&limit=50"
      const [mailboxesRes, messagesRes, archivesRes] = await Promise.all([
        fetch(`/api/admin/emails/mailboxes${query}`),
        fetch(`/api/admin/emails/messages${query}`),
        fetch(`/api/admin/emails/archives${query}`),
      ])

      if (mailboxesRes.ok) {
        const body = await mailboxesRes.json() as PaginatedResponse<AdminMailbox>
        setMailboxes(body.data || [])
      }
      if (messagesRes.ok) {
        const body = await messagesRes.json() as PaginatedResponse<AdminMailboxMessage>
        setMessages(body.data || [])
      }
      if (archivesRes.ok) {
        const body = await archivesRes.json() as PaginatedResponse<ArchivedInboundEmail>
        setArchives(body.data || [])
      }
      setEmailDataLoaded(true)
    } catch {
      toast.error("加载临时邮箱数据失败")
    } finally {
      setLoadingEmailData(false)
    }
  }, [])

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

  async function handleDeleteLink(id: string) {
    const res = await fetch(`/api/admin/links/${id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("短链已删除")
      setLinks((prev) => prev.filter((l) => l.id !== id))
      setPendingDeleteLink(null)
    } else {
      toast.error("删除短链失败")
    }
  }

  async function handleDeleteDomain(domain: SiteDomain) {
    const res = await fetch(`/api/admin/domains/${domain.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("域名已删除")
      setDomains((prev) => prev.filter((item) => item.id !== domain.id))
      setPendingDeleteDomain(null)
      return
    }

    const body = await res.json().catch(() => null)
    toast.error(body?.error || "删除域名失败")
  }

  async function handleViewLogs(link: AdminLink) {
    setSelectedLink(link)
    setLogsDialogOpen(true)
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/logs/${link.id}`)
      if (res.ok) {
        const body = await res.json()
        setLogs(Array.isArray(body) ? body : (body.data || []))
      } else {
        setLogs([])
      }
    } finally {
      setLogsLoading(false)
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
        toast.error("保存设置失败")
      }
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
        const body = await res.json().catch(() => null)
        toast.error(body?.error || "保存域名失败")
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

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 grid h-auto grid-cols-2 gap-2 rounded-lg bg-muted p-1 lg:grid-cols-4">
            <TabsTrigger value="links" className="w-full">链接 ({links.length})</TabsTrigger>
            <TabsTrigger value="users" className="w-full">用户 ({users.length})</TabsTrigger>
            <TabsTrigger value="emails" className="w-full">临时邮箱</TabsTrigger>
            <TabsTrigger value="settings" className="w-full">设置</TabsTrigger>
          </TabsList>

          <TabsContent value="links">
            {loading ? (
              <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
                正在加载短链...
              </div>
            ) : links.length === 0 ? (
              <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
                暂无链接记录。
              </div>
            ) : isDesktop ? (
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
                        <TableCell className="font-mono text-sm">/{link.slug}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 max-w-[160px] sm:max-w-[200px]">
                            <span className="truncate text-sm text-muted-foreground">
                              {link.originalUrl}
                            </span>
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
                        <p className="font-mono text-sm">/{link.slug}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {link.userEmail || "匿名用户"}
                        </p>
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
          </TabsContent>

          <TabsContent value="users">
            {loading ? (
              <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
                正在加载用户列表...
              </div>
            ) : users.length === 0 ? (
              <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
                暂无用户记录。
              </div>
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
                        <TableCell className="text-sm text-muted-foreground truncate max-w-[160px]">
                          {u.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm hidden sm:table-cell">
                          {u.linkCount}
                        </TableCell>
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
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {u.role}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">链接 {u.linkCount}</Badge>
                      <Badge variant="outline">加入于 {formatDate(u.createdAt)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="emails">
            {loadingEmailData && !emailDataLoaded ? (
              <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
                正在加载临时邮箱数据...
              </div>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle>临时邮箱总览</CardTitle>
                      <CardDescription>查看所有邮箱、已收到的邮件，以及未匹配到邮箱的归档邮件。</CardDescription>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      <Input
                        aria-label="搜索邮箱、用户、主题、发件人"
                        placeholder="搜索邮箱、用户、主题、发件人"
                        value={emailSearch}
                        onChange={(e) => setEmailSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            void fetchEmailData(emailSearch)
                          }
                        }}
                        className="w-full sm:w-72"
                      />
                      <Button variant="outline" onClick={() => void fetchEmailData(emailSearch)} className="w-full sm:w-auto">
                        搜索
                      </Button>
                    </div>
                  </CardHeader>
                </Card>

                <div className="grid gap-6 xl:grid-cols-1">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Mail className="h-4 w-4" />
                        邮箱列表 ({mailboxes.length})
                      </CardTitle>
                      <CardDescription>这里会显示所有已创建的临时邮箱。</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {mailboxes.length === 0 ? (
                        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                          暂无邮箱。
                        </div>
                      ) : isDesktop ? (
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
                                {mailbox.userEmail && (
                                  <p className="truncate text-xs text-muted-foreground">{mailbox.userEmail}</p>
                                )}
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
                      <CardDescription>这里显示已成功投递到用户邮箱的邮件。</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {messages.length === 0 ? (
                        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                          暂无邮件。
                        </div>
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
                                      <p className="truncate text-xs text-muted-foreground">
                                        {getMailboxOwnerLabel(message)}
                                      </p>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="max-w-[280px]">
                                      <p className="truncate text-sm font-medium">
                                        {message.fromName || message.from}
                                      </p>
                                      <p className="truncate text-xs text-muted-foreground">
                                        {message.subject || "(无主题)"}
                                      </p>
                                      <p className="mt-1 truncate text-xs text-muted-foreground">
                                        {getEmailPreview(message.text, message.html)}
                                      </p>
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
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {getEmailPreview(message.text, message.html)}
                                </p>
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
                      <CardDescription>这里显示未匹配到邮箱的邮件及其归档原因。</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {archives.length === 0 ? (
                        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                          暂无归档邮件。
                        </div>
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
                                      <p className="truncate text-sm font-medium">
                                        {archive.fromName || archive.from}
                                      </p>
                                      <p className="truncate text-xs text-muted-foreground">
                                        {archive.subject || "(无主题)"}
                                      </p>
                                      <p className="mt-1 truncate text-xs text-muted-foreground">
                                        {getEmailPreview(archive.text, archive.html)}
                                      </p>
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
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {getEmailPreview(archive.text, archive.html)}
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">{formatDate(archive.receivedAt)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings">
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
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, allowAnonymous: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border"
                    />
                    <Label htmlFor="allowAnonymous">允许匿名创建短链</Label>
                  </div>
                  {settings.allowAnonymous && (
                    <>
                      <div className="flex flex-col gap-1.5 pt-2 border-t mt-2">
                        <Label htmlFor="anonMaxLinksPerHour">匿名用户每小时最大创建数</Label>
                        <Input
                          id="anonMaxLinksPerHour"
                          type="number"
                          min="1"
                          value={settings.anonMaxLinksPerHour}
                          onChange={(e) =>
                            setSettings((s) => ({
                              ...s,
                              anonMaxLinksPerHour: parseInt(e.target.value) || 0,
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          控制匿名访问者每小时最多可创建多少条短链。
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="anonMaxClicks">匿名用户最大点击数</Label>
                        <Input
                          id="anonMaxClicks"
                          type="number"
                          min="1"
                          value={settings.anonMaxClicks}
                          onChange={(e) =>
                            setSettings((s) => ({
                              ...s,
                              anonMaxClicks: parseInt(e.target.value) || 0,
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          控制匿名创建的短链在失效前最多允许多少次访问。
                        </p>
                      </div>
                    </>
                  )}
                  <div className="flex flex-col gap-1.5 pt-2 border-t mt-2">
                    <Label htmlFor="userMaxLinksPerHour">用户每小时最大创建数</Label>
                    <Input
                      id="userMaxLinksPerHour"
                      type="number"
                      min="1"
                      value={settings.userMaxLinksPerHour}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          userMaxLinksPerHour: parseInt(e.target.value) || 0,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      控制登录用户每小时最多可创建多少条短链。
                    </p>
                  </div>
                  <Button onClick={handleSaveSettings} disabled={savingSettings} className="w-fit mt-2">
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
                  <Button onClick={openCreateDomainDialog} size="sm" className="w-full sm:w-auto">
                    <Plus className="h-4 w-4" />
                    新增域名
                  </Button>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                      正在加载域名配置...
                    </div>
                  ) : domains.length === 0 ? (
                    <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                      暂无域名配置。
                    </div>
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

      <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              日志记录 —{" "}
              <span className="font-mono">/{selectedLink?.slug}</span>
            </DialogTitle>
          </DialogHeader>
          {logsLoading ? (
            <div className="py-8 text-center text-muted-foreground">加载中...</div>
          ) : logs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">暂无日志</div>
          ) : isDesktop ? (
            <div className="max-h-80 overflow-y-auto overflow-x-auto">
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
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant={getLogBadgeVariant(log.eventType)}>
                          {getLogEventLabel(log.eventType)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground hidden sm:table-cell">
                        {log.statusCode ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate">
                        {log.referrer || <span className="text-muted-foreground">直接访问</span>}
                      </TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate text-muted-foreground hidden md:table-cell">
                        {log.ipAddress || "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate text-muted-foreground hidden lg:table-cell">
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
          )}        </DialogContent>
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
              onClick={() => pendingDeleteLink && handleDeleteLink(pendingDeleteLink.id)}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDeleteDomain} onOpenChange={(open) => !open && setPendingDeleteDomain(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除域名？</DialogTitle>
            <DialogDescription>
              删除后将无法恢复。
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
              onClick={() => pendingDeleteDomain && handleDeleteDomain(pendingDeleteDomain)}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
