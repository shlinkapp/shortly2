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
  const [links, setLinks] = useState<AdminLink[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [domains, setDomains] = useState<SiteDomain[]>([])
  const [mailboxes, setMailboxes] = useState<AdminMailbox[]>([])
  const [messages, setMessages] = useState<AdminMailboxMessage[]>([])
  const [archives, setArchives] = useState<ArchivedInboundEmail[]>([])
  const [emailSearch, setEmailSearch] = useState("")
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
  const [selectedLink, setSelectedLink] = useState<AdminLink | null>(null)
  const [editingDomain, setEditingDomain] = useState<SiteDomain | null>(null)
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
    } catch {
      toast.error("加载临时邮箱数据失败")
    }
  }, [])

  useEffect(() => {
    void fetchEmailData()
  }, [fetchEmailData])

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
      toast.success("Link deleted")
      setLinks((prev) => prev.filter((l) => l.id !== id))
    } else {
      toast.error("Failed to delete link")
    }
  }

  async function handleDeleteDomain(domain: SiteDomain) {
    const res = await fetch(`/api/admin/domains/${domain.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Domain deleted")
      setDomains((prev) => prev.filter((item) => item.id !== domain.id))
      return
    }

    const body = await res.json().catch(() => null)
    toast.error(body?.error || "Failed to delete domain")
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
        toast.success("Settings saved")
      } else {
        toast.error("Failed to save settings")
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
        toast.error(body?.error || "Failed to save domain")
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
      toast.success(editingDomain ? "Domain updated" : "Domain created")
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
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
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
        <Tabs defaultValue="links">
          <TabsList className="mb-6">
            <TabsTrigger value="links">链接 ({links.length})</TabsTrigger>
            <TabsTrigger value="users">用户 ({users.length})</TabsTrigger>
            <TabsTrigger value="emails">临时邮箱</TabsTrigger>
            <TabsTrigger value="settings">设置</TabsTrigger>
          </TabsList>

          <TabsContent value="links">
            {loading ? (
              <div className="text-center text-muted-foreground py-16">加载中...</div>
            ) : links.length === 0 ? (
              <div className="text-center text-muted-foreground py-16">暂无链接</div>
            ) : (
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
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                          {link.userEmail || <span className="italic">Anonymous</span>}
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
                              size="sm"
                              onClick={() => handleViewLogs(link)}
                              className="h-8 w-8 p-0"
                              title="View logs"
                            >
                              <BarChart2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteLink(link.id)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              title="Delete"
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
          </TabsContent>

          <TabsContent value="users">
            {loading ? (
              <div className="text-center text-muted-foreground py-16">加载中...</div>
            ) : users.length === 0 ? (
              <div className="text-center text-muted-foreground py-16">暂无用户</div>
            ) : (
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
            )}
          </TabsContent>

          <TabsContent value="emails">
            <div className="space-y-6">
              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>临时邮箱总览</CardTitle>
                    <CardDescription>查看所有邮箱、正常入箱邮件和未匹配收件归档。</CardDescription>
                  </div>
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Input
                      placeholder="搜索邮箱、用户、主题、发件人"
                      value={emailSearch}
                      onChange={(e) => setEmailSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void fetchEmailData(emailSearch)
                        }
                      }}
                      className="sm:w-72"
                    />
                    <Button variant="outline" onClick={() => void fetchEmailData(emailSearch)}>
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
                    <CardDescription>全部已创建的临时邮箱。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {mailboxes.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">暂无邮箱</div>
                    ) : (
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
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Inbox className="h-4 w-4" />
                      正常邮件 ({messages.length})
                    </CardTitle>
                    <CardDescription>已匹配到用户邮箱的入站邮件。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {messages.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">暂无邮件</div>
                    ) : (
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
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Archive className="h-4 w-4" />
                      归档邮件 ({archives.length})
                    </CardTitle>
                    <CardDescription>未匹配邮箱的入站邮件归档。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {archives.length === 0 ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">暂无归档邮件</div>
                    ) : (
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
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
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
                    <Label htmlFor="siteUrl">Site URL</Label>
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
                          How many links an unauthenticated IP can generate per hour.
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
                          How many times an anonymously generated link can be clicked before expiring.
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
                      How many links a logged-in user can generate per hour.
                    </p>
                  </div>
                  <Button onClick={handleSaveSettings} disabled={savingSettings} className="w-fit mt-2">
                    <Save className="h-4 w-4" />
                    {savingSettings ? "保存中..." : "保存设置"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>域名配置</CardTitle>
                    <CardDescription>管理短链接与临时邮箱可用域名</CardDescription>
                  </div>
                  <Button onClick={openCreateDomainDialog} size="sm">
                    <Plus className="h-4 w-4" />
                    新增域名
                  </Button>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center text-muted-foreground py-12">加载中...</div>
                  ) : domains.length === 0 ? (
                    <div className="text-center text-muted-foreground py-12">暂无域名</div>
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
                                    size="sm"
                                    onClick={() => openEditDomainDialog(domain)}
                                    className="h-8 w-8 p-0"
                                    title="Edit"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteDomain(domain)}
                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                    title="Delete"
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
          ) : (
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
                        {log.referrer || <span className="text-muted-foreground">Direct</span>}
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
