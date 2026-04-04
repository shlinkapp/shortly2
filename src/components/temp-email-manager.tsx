"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatDate } from "@/lib/utils"
import { Copy, MailPlus, RefreshCw, Trash2 } from "lucide-react"

interface MailboxRecord {
  id: string
  emailAddress: string
  domain: string
  createdAt: string | number
  unreadCount: number
  messageCount: number
}

interface MailboxResponse {
  data: MailboxRecord[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface MessageRecord {
  id: string
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

interface MessageResponse {
  mailbox: {
    id: string
    emailAddress: string
  }
  data: MessageRecord[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface DomainRecord {
  host: string
  isDefault: boolean
}

interface DomainsResponse {
  emailDomains: DomainRecord[]
  shortDomains: DomainRecord[]
}

const RANDOM_PREFIX_WORDS = [
  "amber",
  "apple",
  "ash",
  "bird",
  "blue",
  "brisk",
  "brook",
  "cloud",
  "copper",
  "dawn",
  "delta",
  "ember",
  "fern",
  "field",
  "flint",
  "forest",
  "glow",
  "gold",
  "grain",
  "harbor",
  "honey",
  "jade",
  "lake",
  "leaf",
  "lily",
  "meadow",
  "mint",
  "mist",
  "moon",
  "nova",
  "ocean",
  "olive",
  "opal",
  "pearl",
  "pine",
  "plum",
  "river",
  "rose",
  "sage",
  "shadow",
  "sky",
  "snow",
  "solar",
  "stone",
  "storm",
  "sun",
  "swift",
  "vale",
  "wave",
  "willow",
]

function getRandomPrefix() {
  return Array.from({ length: 3 }, () => {
    const index = Math.floor(Math.random() * RANDOM_PREFIX_WORDS.length)
    return RANDOM_PREFIX_WORDS[index]
  }).join("-")
}

export function TempEmailManager() {
  const [mailboxes, setMailboxes] = useState<MailboxRecord[]>([])
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [mailboxInput, setMailboxInput] = useState("")
  const [emailDomains, setEmailDomains] = useState<DomainRecord[]>([])
  const [selectedDomain, setSelectedDomain] = useState("")
  const [loadingMailboxes, setLoadingMailboxes] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [creatingMailbox, setCreatingMailbox] = useState(false)
  const [mutatingMessageId, setMutatingMessageId] = useState<string | null>(null)
  const [deletingMailboxId, setDeletingMailboxId] = useState<string | null>(null)
  const [pendingDeleteMailbox, setPendingDeleteMailbox] = useState<MailboxRecord | null>(null)
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState<MessageRecord | null>(null)

  const selectedMailbox = useMemo(
    () => mailboxes.find((item) => item.id === selectedMailboxId) ?? null,
    [mailboxes, selectedMailboxId]
  )

  const mailboxPreview = useMemo(() => {
    const localPart = mailboxInput.trim().toLowerCase().replace(/^@+|@+$/g, "")
    if (!localPart || !selectedDomain) return ""
    return `${localPart}@${selectedDomain}`
  }, [mailboxInput, selectedDomain])

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch("/api/domains")
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.error || "加载邮箱域名失败")
        return
      }

      const body = await res.json() as DomainsResponse
      const domains = body.emailDomains || []
      setEmailDomains(domains)
      setSelectedDomain((current) => current || domains.find((item) => item.isDefault)?.host || domains[0]?.host || "")
    } catch {
      toast.error("加载邮箱域名失败")
    }
  }, [])

  const fetchMailboxes = useCallback(async () => {
    setLoadingMailboxes(true)
    try {
      const res = await fetch("/api/emails?page=1&limit=100")
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.error || "加载邮箱失败")
        return
      }

      const body = await res.json() as MailboxResponse
      const rows = body.data || []
      setMailboxes(rows)
      setSelectedMailboxId((current) => {
        if (current && rows.some((item) => item.id === current)) {
          return current
        }
        return rows[0]?.id ?? null
      })
    } catch {
      toast.error("加载邮箱失败")
    } finally {
      setLoadingMailboxes(false)
    }
  }, [])

  const fetchMessages = useCallback(async (mailboxId: string) => {
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/emails/${mailboxId}/messages?page=1&limit=100`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.error || "加载邮件失败")
        setMessages([])
        return
      }

      const body = await res.json() as MessageResponse
      setMessages(body.data || [])
    } catch {
      toast.error("加载邮件失败")
      setMessages([])
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  useEffect(() => {
    fetchDomains()
    fetchMailboxes()
  }, [fetchDomains, fetchMailboxes])

  useEffect(() => {
    if (!selectedMailboxId) {
      setMessages([])
      return
    }
    fetchMessages(selectedMailboxId)
  }, [fetchMessages, selectedMailboxId])

  function handleGenerateRandomPrefix() {
    setMailboxInput(getRandomPrefix())
  }

  async function handleCreateMailbox() {
    const localPart = mailboxInput.trim().toLowerCase().replace(/^@+|@+$/g, "")
    if (!localPart) {
      toast.error("请输入邮箱前缀")
      return
    }
    if (!selectedDomain) {
      toast.error("暂无可用邮箱域名")
      return
    }

    setCreatingMailbox(true)
    try {
      const res = await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAddress: `${localPart}@${selectedDomain}` }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(body?.error || "创建邮箱失败")
        return
      }

      toast.success("临时邮箱已创建")
      setMailboxInput("")
      await fetchMailboxes()
    } catch {
      toast.error("创建邮箱失败")
    } finally {
      setCreatingMailbox(false)
    }
  }

  async function handleMarkRead(messageId: string) {
    setMutatingMessageId(messageId)
    try {
      const res = await fetch(`/api/emails/messages/${messageId}/read`, { method: "POST" })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(body?.error || "标记已读失败")
        return
      }

      setMessages((prev) => prev.map((item) => (item.id === messageId ? { ...item, isRead: true } : item)))
      setMailboxes((prev) => prev.map((item) => {
        if (item.id !== selectedMailboxId) return item
        return {
          ...item,
          unreadCount: Math.max(0, item.unreadCount - 1),
        }
      }))
      toast.success("邮件已标记为已读")
    } catch {
      toast.error("标记已读失败")
    } finally {
      setMutatingMessageId(null)
    }
  }

  async function handleDeleteMessage(messageId: string, wasUnread: boolean) {
    setMutatingMessageId(messageId)
    try {
      const res = await fetch(`/api/emails/messages/${messageId}`, { method: "DELETE" })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(body?.error || "删除邮件失败")
        return
      }

      setMessages((prev) => prev.filter((item) => item.id !== messageId))
      setMailboxes((prev) => prev.map((item) => {
        if (item.id !== selectedMailboxId) return item
        return {
          ...item,
          messageCount: Math.max(0, item.messageCount - 1),
          unreadCount: wasUnread ? Math.max(0, item.unreadCount - 1) : item.unreadCount,
        }
      }))
      setPendingDeleteMessage(null)
      toast.success("邮件已删除")
    } catch {
      toast.error("删除邮件失败")
    } finally {
      setMutatingMessageId(null)
    }
  }

  async function handleDeleteMailbox(mailbox: MailboxRecord) {
    setDeletingMailboxId(mailbox.id)
    try {
      const res = await fetch(`/api/emails/${mailbox.id}`, { method: "DELETE" })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(body?.error || "删除邮箱失败")
        return
      }

      setMailboxes((prev) => prev.filter((item) => item.id !== mailbox.id))
      setSelectedMailboxId((current) => {
        if (current !== mailbox.id) return current
        const next = mailboxes.find((item) => item.id !== mailbox.id)
        return next?.id ?? null
      })
      if (selectedMailboxId === mailbox.id) {
        setMessages([])
      }
      setPendingDeleteMailbox(null)
      toast.success("邮箱已删除")
    } catch {
      toast.error("删除邮箱失败")
    } finally {
      setDeletingMailboxId(null)
    }
  }

  function handleCopy(text: string, message: string) {
    navigator.clipboard.writeText(text)
    toast.success(message)
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MailPlus className="h-4 w-4" />
              临时邮箱
            </CardTitle>
            <CardDescription>创建专属临时邮箱，并在下方集中查看收到的邮件。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">创建新邮箱</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  输入前缀并选择域名，即可生成新的临时邮箱地址。
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_12rem]">
                <Input
                  placeholder="输入邮箱前缀，例如：summer-sale"
                  value={mailboxInput}
                  onChange={(e) => setMailboxInput(e.target.value)}
                />
                <Select value={selectedDomain} onValueChange={setSelectedDomain} disabled={emailDomains.length < 1}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择邮箱域名" />
                  </SelectTrigger>
                  <SelectContent>
                    {emailDomains.map((domain) => (
                      <SelectItem key={domain.host} value={domain.host}>
                        {domain.host}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">邮箱预览</p>
                <p className="mt-1 break-all font-mono text-sm">
                  {mailboxPreview || "输入前缀后将在这里显示完整邮箱地址"}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={handleGenerateRandomPrefix} className="flex-1">
                  <RefreshCw className="h-4 w-4" />
                  生成随机前缀
                </Button>
                <Button onClick={handleCreateMailbox} disabled={creatingMailbox || !selectedDomain} className="flex-1">
                  {creatingMailbox ? "创建中..." : "创建邮箱"}
                </Button>
              </div>
              {!selectedDomain && (
                <p className="text-xs font-medium text-destructive">当前没有可用邮箱域名，请先联系管理员启用。</p>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">我的邮箱</h3>
                  <p className="mt-1 text-xs text-muted-foreground">选择一个邮箱即可在右侧查看邮件内容。</p>
                </div>
                {mailboxes.length > 0 && <Badge variant="outline">{mailboxes.length} 个</Badge>}
              </div>

              {loadingMailboxes ? (
                <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                  正在加载邮箱列表...
                </div>
              ) : mailboxes.length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                  <p>你还没有临时邮箱。</p>
                  <p className="mt-2">先在上方创建一个邮箱，然后就能开始收信了。</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mailboxes.map((mailbox) => (
                    <div
                      key={mailbox.id}
                      className={`group rounded-lg border p-3 transition-colors ${mailbox.id === selectedMailboxId
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedMailboxId(mailbox.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate font-mono text-sm">{mailbox.emailAddress}</p>
                          <p className="mt-1 text-xs text-muted-foreground">创建于 {formatDate(mailbox.createdAt)}</p>
                        </button>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          <Badge variant="outline">{mailbox.messageCount} 封</Badge>
                          {mailbox.unreadCount > 0 && <Badge>{mailbox.unreadCount} 未读</Badge>}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
                            onClick={() => setPendingDeleteMailbox(mailbox)}
                            disabled={deletingMailboxId === mailbox.id}
                          >
                            <Trash2 className="h-4 w-4" />
                            删除
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="break-all text-base font-mono">
                  {selectedMailbox?.emailAddress || "邮件列表"}
                </CardTitle>
                <CardDescription>
                  {selectedMailbox
                    ? `当前邮箱共有 ${selectedMailbox.messageCount} 封邮件，未读 ${selectedMailbox.unreadCount} 封。`
                    : "从左侧选择一个邮箱后，即可查看收到的邮件。"}
                </CardDescription>
              </div>
              {selectedMailbox && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(selectedMailbox.emailAddress, "邮箱地址已复制")}
                >
                  <Copy className="h-4 w-4" />
                  复制邮箱地址
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedMailbox ? (
              <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                <p>暂未选择邮箱。</p>
                <p className="mt-2">选择左侧邮箱，或先创建一个新的临时邮箱。</p>
              </div>
            ) : loadingMessages ? (
              <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                正在加载邮件...
              </div>
            ) : messages.length === 0 ? (
              <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                <p>这个邮箱暂时还没有收到邮件。</p>
                <p className="mt-2">复制上方邮箱地址，去注册或接收验证邮件后再回来查看。</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {messages.map((message) => (
                    <div key={message.id} className="rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{message.fromName || message.from}</p>
                          {message.fromName && (
                            <p className="truncate text-xs text-muted-foreground">{message.from}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Badge variant={message.isRead ? "outline" : "secondary"}>
                            {message.isRead ? "已读" : "未读"}
                          </Badge>
                          {message.hasAttachments && <Badge variant="outline">附件</Badge>}
                        </div>
                      </div>

                      <div className="mt-3 space-y-1">
                        <p className="text-sm">{message.subject || "(无主题)"}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {(message.text || message.html || "").replace(/\s+/g, " ") || "无正文"}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(message.receivedAt)}</p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {!message.isRead && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleMarkRead(message.id)}
                            disabled={mutatingMessageId === message.id}
                          >
                            标记为已读
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setPendingDeleteMessage(message)}
                          disabled={mutatingMessageId === message.id}
                        >
                          <Trash2 className="h-4 w-4" />
                          删除邮件
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto rounded-lg border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">发件人</TableHead>
                        <TableHead className="min-w-[180px]">主题</TableHead>
                        <TableHead className="w-24">状态</TableHead>
                        <TableHead className="hidden w-32 md:table-cell">时间</TableHead>
                        <TableHead className="w-36 text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messages.map((message) => (
                        <TableRow key={message.id}>
                          <TableCell>
                            <div className="max-w-[220px]">
                              <p className="truncate text-sm font-medium">{message.fromName || message.from}</p>
                              {message.fromName && (
                                <p className="truncate text-xs text-muted-foreground">{message.from}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[280px]">
                              <p className="truncate text-sm">{message.subject || "(无主题)"}</p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {(message.text || message.html || "").replace(/\s+/g, " ") || "无正文"}
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
                          <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                            {formatDate(message.receivedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {!message.isRead && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleMarkRead(message.id)}
                                  disabled={mutatingMessageId === message.id}
                                >
                                  标记已读
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setPendingDeleteMessage(message)}
                                disabled={mutatingMessageId === message.id}
                              >
                                <Trash2 className="h-4 w-4" />
                                删除
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!pendingDeleteMailbox} onOpenChange={(open) => !open && setPendingDeleteMailbox(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除这个邮箱？</DialogTitle>
            <DialogDescription>
              删除后该邮箱及其邮件将无法恢复。
              {pendingDeleteMailbox && (
                <span className="mt-2 block font-mono text-xs text-muted-foreground">
                  {pendingDeleteMailbox.emailAddress}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteMailbox(null)} disabled={!!deletingMailboxId}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => pendingDeleteMailbox && handleDeleteMailbox(pendingDeleteMailbox)}
              disabled={!!deletingMailboxId}
            >
              {deletingMailboxId === pendingDeleteMailbox?.id ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDeleteMessage} onOpenChange={(open) => !open && setPendingDeleteMessage(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除这封邮件？</DialogTitle>
            <DialogDescription>
              删除后将无法恢复。
              {pendingDeleteMessage && (
                <span className="mt-2 block text-xs text-muted-foreground">
                  {pendingDeleteMessage.subject || "(无主题)"}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteMessage(null)} disabled={!!mutatingMessageId}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => pendingDeleteMessage && handleDeleteMessage(pendingDeleteMessage.id, !pendingDeleteMessage.isRead)}
              disabled={!!mutatingMessageId}
            >
              {mutatingMessageId === pendingDeleteMessage?.id ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
