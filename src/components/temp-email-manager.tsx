"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
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
import { useMediaQuery } from "@/lib/use-media-query"
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

function getNextMailboxSelection(rows: MailboxRecord[], currentMailboxId: string | null) {
  if (currentMailboxId && rows.some((item) => item.id === currentMailboxId)) {
    return currentMailboxId
  }

  return rows[0]?.id ?? null
}

const tempEmailReporter = createClientErrorReporter("temp_email_manager")

export function TempEmailManager() {
  const [mailboxes, setMailboxes] = useState<MailboxRecord[]>([])
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [mailboxInput, setMailboxInput] = useState("")
  const [emailDomains, setEmailDomains] = useState<DomainRecord[]>([])
  const [selectedDomain, setSelectedDomain] = useState("")
  const [loadingDomains, setLoadingDomains] = useState(true)
  const [domainsError, setDomainsError] = useState<string | null>(null)
  const [loadingMailboxes, setLoadingMailboxes] = useState(true)
  const [mailboxesError, setMailboxesError] = useState<string | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [creatingMailbox, setCreatingMailbox] = useState(false)
  const [mutatingMessageId, setMutatingMessageId] = useState<string | null>(null)
  const [deletingMailboxId, setDeletingMailboxId] = useState<string | null>(null)
  const [pendingDeleteMailbox, setPendingDeleteMailbox] = useState<MailboxRecord | null>(null)
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState<MessageRecord | null>(null)
  const latestMessageRequestIdRef = useRef(0)
  const hasShownMailboxUnavailableToastRef = useRef(false)
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const selectedMailbox = useMemo(
    () => mailboxes.find((item) => item.id === selectedMailboxId) ?? null,
    [mailboxes, selectedMailboxId]
  )

  const mailboxPreview = useMemo(() => {
    const localPart = mailboxInput.trim().toLowerCase().replace(/^@+|@+$/g, "")
    if (!localPart || !selectedDomain) return ""
    return `${localPart}@${selectedDomain}`
  }, [mailboxInput, selectedDomain])

  const canCreateMailbox = Boolean(selectedDomain) && !loadingDomains && !creatingMailbox
  const hasMailboxList = mailboxes.length > 0
  const messagePanelDescription = selectedMailbox
    ? `当前邮箱共有 ${selectedMailbox.messageCount} 封邮件，未读 ${selectedMailbox.unreadCount} 封。列表会在你停留当前页面时自动刷新。`
    : hasMailboxList
      ? "先从左侧选择一个邮箱，再查看收到的邮件。"
      : "先创建一个临时邮箱，再在这里集中查看收到的邮件。"
  const emptyMailboxMessage = selectedMailbox
    ? "复制上方邮箱地址，去注册或接收验证邮件后再回来查看；页面停留期间会自动刷新。"
    : "先在左侧选择一个邮箱，或先创建新的临时邮箱。"
  const noMailboxSelectionMessage = hasMailboxList
    ? "左侧已有邮箱，选择一个后就能在这里查看邮件。"
    : "先在左侧创建一个新的临时邮箱，然后就能开始收信。"

  const fetchDomains = useCallback(async (options?: { silent?: boolean }) => {
    setLoadingDomains(true)
    setDomainsError(null)

    try {
      const res = await fetch("/api/domains")
      const body = await readOptionalJson<DomainsResponse & { error?: string }>(res)
      if (!res.ok) {
        const message = getResponseErrorMessage(body, "加载邮箱域名失败")
        tempEmailReporter.warn("fetch_domains_failed_response", { status: res.status })
        setEmailDomains([])
        setSelectedDomain("")
        setDomainsError(message)
        if (!options?.silent) {
          toast.error(message)
        }
        return
      }

      const domains = body?.emailDomains || []
      setEmailDomains(domains)
      setSelectedDomain((current) => current || domains.find((item) => item.isDefault)?.host || domains[0]?.host || "")
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "加载邮箱域名失败")
      tempEmailReporter.report("fetch_domains_failed_exception", error)
      setEmailDomains([])
      setSelectedDomain("")
      setDomainsError(message)
      if (!options?.silent) {
        toast.error(message)
      }
    } finally {
      setLoadingDomains(false)
    }
  }, [])

  const fetchMailboxes = useCallback(async (options?: { silent?: boolean }) => {
    setLoadingMailboxes(true)
    setMailboxesError(null)

    try {
      const res = await fetch("/api/emails?page=1&limit=100")
      const body = await readOptionalJson<MailboxResponse & { error?: string }>(res)
      if (!res.ok) {
        const message = getResponseErrorMessage(body, "加载邮箱失败")
        tempEmailReporter.warn("fetch_mailboxes_failed_response", { status: res.status })
        setMailboxesError(message)
        if (!options?.silent) {
          toast.error(message)
        }
        return
      }

      const rows = body?.data || []
      hasShownMailboxUnavailableToastRef.current = false
      setMailboxes(rows)
      setSelectedMailboxId((current) => getNextMailboxSelection(rows, current))
      if (rows.length === 0) {
        latestMessageRequestIdRef.current += 1
        setMessages([])
        setMessagesError(null)
        setLoadingMessages(false)
      }
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "加载邮箱失败")
      tempEmailReporter.report("fetch_mailboxes_failed_exception", error)
      setMailboxesError(message)
      if (!options?.silent) {
        toast.error(message)
      }
    } finally {
      setLoadingMailboxes(false)
    }
  }, [])

  const handleMailboxUnavailable = useCallback(async (showToast = false) => {
    if (showToast && !hasShownMailboxUnavailableToastRef.current) {
      hasShownMailboxUnavailableToastRef.current = true
      tempEmailReporter.warn("selected_mailbox_unavailable")
      toast.error("当前邮箱已失效，已为你刷新邮箱列表")
    }

    latestMessageRequestIdRef.current += 1
    setMessages([])
    setMessagesError(null)
    setLoadingMessages(false)
    await fetchMailboxes()
  }, [fetchMailboxes])

  const fetchMessages = useCallback(async (mailboxId: string, options?: { silent?: boolean }) => {
    const requestId = latestMessageRequestIdRef.current + 1
    latestMessageRequestIdRef.current = requestId
    setLoadingMessages(true)
    setMessagesError(null)

    try {
      const res = await fetch(`/api/emails/${mailboxId}/messages?page=1&limit=100`)
      const body = await readOptionalJson<MessageResponse & { error?: string }>(res)

      if (!res.ok) {
        if (res.status === 404) {
          tempEmailReporter.warn("fetch_messages_mailbox_missing", { mailboxId })
          await handleMailboxUnavailable(!options?.silent)
          return
        }

        const message = getResponseErrorMessage(body, "加载邮件失败")
        tempEmailReporter.warn("fetch_messages_failed_response", { mailboxId, status: res.status })
        if (!options?.silent) {
          toast.error(message)
        }
        if (latestMessageRequestIdRef.current === requestId) {
          setMessages([])
          setMessagesError(message)
        }
        return
      }

      if (!body || latestMessageRequestIdRef.current !== requestId || body.mailbox.id !== mailboxId) {
        return
      }

      setMessages(body.data || [])
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "加载邮件失败")
      tempEmailReporter.report("fetch_messages_failed_exception", error, { mailboxId })
      if (!options?.silent) {
        toast.error(message)
      }
      if (latestMessageRequestIdRef.current === requestId) {
        setMessages([])
        setMessagesError(message)
      }
    } finally {
      if (latestMessageRequestIdRef.current === requestId) {
        setLoadingMessages(false)
      }
    }
  }, [handleMailboxUnavailable])

  useEffect(() => {
    fetchDomains()
    fetchMailboxes()
  }, [fetchDomains, fetchMailboxes])

  const canRetryMessages = !!selectedMailboxId && !loadingMessages

  useEffect(() => {
    if (!selectedMailboxId) {
      latestMessageRequestIdRef.current += 1
      setMessages([])
      setMessagesError(null)
      setLoadingMessages(false)
      return
    }

    fetchMessages(selectedMailboxId)
  }, [fetchMessages, selectedMailboxId])

  useEffect(() => {
    if (!selectedMailboxId) {
      return
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return
      }

      void fetchMailboxes().then(() => fetchMessages(selectedMailboxId, { silent: true }))
    }, 15000)

    return () => window.clearInterval(interval)
  }, [fetchMailboxes, fetchMessages, selectedMailboxId])

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
      const body = await readOptionalJson<{ error?: string }>(res)
      if (!res.ok) {
        tempEmailReporter.warn("create_mailbox_failed_response", {
          status: res.status,
          domain: selectedDomain,
        })
        toast.error(getResponseErrorMessage(body, "创建邮箱失败"))
        return
      }

      toast.success("临时邮箱已创建")
      setMailboxInput("")
      await fetchMailboxes()
    } catch (error) {
      tempEmailReporter.report("create_mailbox_failed_exception", error, {
        domain: selectedDomain,
      })
      toast.error(getUserFacingErrorMessage(error, "创建邮箱失败"))
    } finally {
      setCreatingMailbox(false)
    }
  }

  async function handleMarkRead(messageId: string) {
    setMutatingMessageId(messageId)
    try {
      const res = await fetch(`/api/emails/messages/${messageId}/read`, { method: "POST" })
      const body = await readOptionalJson<{ error?: string }>(res)
      if (!res.ok) {
        tempEmailReporter.warn("mark_message_read_failed_response", { messageId, status: res.status })
        toast.error(getResponseErrorMessage(body, "标记已读失败"))
        return
      }

      setMessages((prev) => prev.map((item) => (item.id === messageId ? { ...item, isRead: true } : item)))
      await fetchMailboxes()
      toast.success("邮件已标记为已读")
    } catch (error) {
      tempEmailReporter.report("mark_message_read_failed_exception", error, { messageId })
      toast.error(getUserFacingErrorMessage(error, "标记已读失败"))
    } finally {
      setMutatingMessageId(null)
    }
  }

  async function handleDeleteMessage(messageId: string) {
    setMutatingMessageId(messageId)
    try {
      const res = await fetch(`/api/emails/messages/${messageId}`, { method: "DELETE" })
      const body = await readOptionalJson<{ error?: string }>(res)
      if (!res.ok) {
        tempEmailReporter.warn("delete_message_failed_response", { messageId, status: res.status })
        toast.error(getResponseErrorMessage(body, "删除邮件失败"))
        return
      }

      setMessages((prev) => prev.filter((item) => item.id !== messageId))
      await fetchMailboxes()
      if (selectedMailboxId) {
        await fetchMessages(selectedMailboxId, { silent: true })
      }
      setPendingDeleteMessage(null)
      toast.success("邮件已删除")
    } catch (error) {
      tempEmailReporter.report("delete_message_failed_exception", error, { messageId })
      toast.error(getUserFacingErrorMessage(error, "删除邮件失败"))
    } finally {
      setMutatingMessageId(null)
    }
  }

  async function handleDeleteMailbox(mailbox: MailboxRecord) {
    setDeletingMailboxId(mailbox.id)
    try {
      const res = await fetch(`/api/emails/${mailbox.id}`, { method: "DELETE" })
      const body = await readOptionalJson<{ error?: string }>(res)
      if (!res.ok) {
        tempEmailReporter.warn("delete_mailbox_failed_response", { mailboxId: mailbox.id, status: res.status })
        toast.error(getResponseErrorMessage(body, "删除邮箱失败"))
        return
      }

      setPendingDeleteMailbox(null)
      await fetchMailboxes()
      toast.success("邮箱已删除")
    } catch (error) {
      tempEmailReporter.report("delete_mailbox_failed_exception", error, { mailboxId: mailbox.id })
      toast.error(getUserFacingErrorMessage(error, "删除邮箱失败"))
    } finally {
      setDeletingMailboxId(null)
    }
  }

  async function handleCopy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(message)
    } catch (error) {
      tempEmailReporter.report("copy_failed_exception", error)
      toast.error(getUserFacingErrorMessage(error, "复制失败，请手动复制"))
    }
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
            <CardDescription>创建临时邮箱地址，并在右侧集中查看收到的邮件。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">创建新邮箱</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  输入前缀并选择域名后，就能生成新的临时邮箱地址。
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_12rem]">
                <Input
                  id="temp-email-prefix"
                  aria-label="邮箱前缀"
                  placeholder="输入邮箱前缀，例如：summer-sale"
                  value={mailboxInput}
                  onChange={(e) => setMailboxInput(e.target.value)}
                />
                <Select value={selectedDomain} onValueChange={setSelectedDomain} disabled={emailDomains.length < 1}>
                  <SelectTrigger id="temp-email-domain" aria-label="邮箱域名">
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
                <Button onClick={handleCreateMailbox} disabled={!canCreateMailbox} className="flex-1">
                  {creatingMailbox ? "创建中..." : "创建邮箱"}
                </Button>
              </div>
              {loadingDomains ? (
                <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                  <p>正在加载可用邮箱域名...</p>
                  <p className="mt-1">加载完成后即可选择域名并创建邮箱。</p>
                </div>
              ) : domainsError ? (
                <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-3 py-3 text-xs text-destructive">
                  <p className="font-medium">邮箱域名暂时不可用</p>
                  <p className="mt-1">{domainsError}</p>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => fetchDomains()}>
                    重试加载域名
                  </Button>
                </div>
              ) : !selectedDomain ? (
                <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-3 py-3 text-xs text-destructive">
                  <p className="font-medium">当前没有可用邮箱域名</p>
                  <p className="mt-1">请先联系管理员启用邮箱域名后再创建。</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">创建成功后会自动出现在下方列表，你可以直接复制地址并等待来信。</p>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">我的邮箱</h3>
                  <p className="mt-1 text-xs text-muted-foreground">选择一个邮箱后，就能在右侧查看收件内容。</p>
                </div>
                {mailboxes.length > 0 && <Badge variant="outline">{mailboxes.length} 个</Badge>}
              </div>

              {loadingMailboxes ? (
                <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  <p>正在加载邮箱列表...</p>
                  <p className="mt-2 text-xs">创建成功后的邮箱会显示在这里，方便继续切换和管理。</p>
                </div>
              ) : mailboxesError ? (
                <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive">
                  <p className="font-medium">邮箱列表加载失败</p>
                  <p className="mt-2">{mailboxesError}</p>
                  <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => fetchMailboxes()}>
                    重试加载邮箱
                  </Button>
                </div>
              ) : mailboxes.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                  <p>你还没有临时邮箱。</p>
                  <p className="mt-2">先在上方创建一个邮箱，然后就能开始收信了。</p>
                  <p className="mt-2 text-xs">创建成功后，这里会显示邮箱地址、未读数量和删除入口。</p>
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
                            className="min-h-9 px-2 text-destructive transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
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
                <CardDescription>{messagePanelDescription}</CardDescription>
              </div>
              {selectedMailbox && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void fetchMessages(selectedMailbox.id)}
                    disabled={loadingMessages}
                  >
                    <RefreshCw className={`h-4 w-4${loadingMessages ? " animate-spin" : ""}`} />
                    刷新邮件
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(selectedMailbox.emailAddress, "邮箱地址已复制")}
                  >
                    <Copy className="h-4 w-4" />
                    复制邮箱地址
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedMailbox ? (
              <div className="rounded-lg border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
                <p>暂未选择邮箱。</p>
                <p className="mt-2">{noMailboxSelectionMessage}</p>
              </div>
            ) : loadingMessages ? (
              <div className="rounded-lg border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
                <p>正在加载邮件...</p>
                <p className="mt-2 text-xs">页面停留期间会自动刷新；你也可以手动刷新当前邮箱。</p>
              </div>
            ) : messagesError ? (
              <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-12 text-center text-sm text-destructive">
                <p className="font-medium">邮件加载失败</p>
                <p className="mt-2">{messagesError}</p>
                <p className="mt-2 text-xs text-destructive/80">你可以立即重试，或稍后刷新当前邮箱再查看。</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => selectedMailboxId && void fetchMessages(selectedMailboxId)}
                  disabled={!canRetryMessages}
                >
                  重试加载邮件
                </Button>
              </div>
            ) : messages.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
                <p>这个邮箱暂时还没有收到邮件。</p>
                <p className="mt-2">{emptyMailboxMessage}</p>
              </div>
            ) : isDesktop ? (
              <div className="overflow-x-auto rounded-lg border">
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
            ) : (
              <div className="space-y-3">
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
              {deletingMailboxId === pendingDeleteMailbox?.id ? "删除中..." : "删除邮箱"}
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
              onClick={() => pendingDeleteMessage && handleDeleteMessage(pendingDeleteMessage.id)}
              disabled={!!mutatingMessageId}
            >
              {mutatingMessageId === pendingDeleteMessage?.id ? "删除中..." : "删除邮件"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
