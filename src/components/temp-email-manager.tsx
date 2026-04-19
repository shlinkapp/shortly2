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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDate } from "@/lib/utils"
import { useMediaQuery } from "@/lib/use-media-query"
import { generateRandomEmailPrefix } from "@/lib/random-email-prefix"
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

interface MessageDetailRecord {
  id: string
  mailboxId: string
  mailboxEmailAddress: string
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

interface MessageDetailResponse {
  data: MessageDetailRecord
}

interface DomainRecord {
  host: string
  isDefault: boolean
  minLocalPartLength: number
}

interface DomainsResponse {
  emailDomains: DomainRecord[]
  shortDomains: DomainRecord[]
}

function getNextMailboxSelection(rows: MailboxRecord[], currentMailboxId: string | null) {
  if (currentMailboxId && rows.some((item) => item.id === currentMailboxId)) {
    return currentMailboxId
  }

  return rows[0]?.id ?? null
}

function formatMessageContact(contact: MessageContactRecord) {
  if (contact.name && contact.address) {
    return `${contact.name} <${contact.address}>`
  }

  return contact.address || contact.name || ""
}

function buildMessageSource(detail: MessageDetailRecord) {
  const lines: string[] = []

  if (detail.messageId) {
    lines.push(`Message-ID: ${detail.messageId}`)
  }
  lines.push(`From: ${detail.fromName ? `${detail.fromName} <${detail.from}>` : detail.from}`)
  lines.push(`To: ${detail.mailboxEmailAddress}`)
  if (detail.replyTo.length > 0) {
    lines.push(`Reply-To: ${detail.replyTo.map(formatMessageContact).filter(Boolean).join(", ")}`)
  }
  if (detail.cc.length > 0) {
    lines.push(`Cc: ${detail.cc.map(formatMessageContact).filter(Boolean).join(", ")}`)
  }
  lines.push(`Subject: ${detail.subject || "(无主题)"}`)
  lines.push(`Date: ${formatDate(detail.receivedAt)}`)

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

const tempEmailReporter = createClientErrorReporter("temp_email_manager")

const messageDetailTabLabels = {
  text: "TXT",
  html: "富文本",
  source: "源码",
} as const

type MessageDetailTab = keyof typeof messageDetailTabLabels

const iframeSandbox = ""

function sanitizeEmailHtml(html: string) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/\son\w+=("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)=("|')\s*javascript:[\s\S]*?\2/gi, "")
}

const iframeSrcDocPrefix = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><base target=\"_blank\"><style>body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;line-height:1.6;padding:16px;margin:0;word-break:break-word}img{max-width:100%;height:auto}pre{white-space:pre-wrap}table{max-width:100%;border-collapse:collapse}a{color:#2563eb}</style></head><body>"
const iframeSrcDocSuffix = "</body></html>"

function buildIframeSrcDoc(html: string) {
  return `${iframeSrcDocPrefix}${sanitizeEmailHtml(html)}${iframeSrcDocSuffix}`
}

function formatAttachmentSize(size: number) {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function getMessagePreview(message: MessageRecord) {
  return (message.text || message.html || "").replace(/\s+/g, " ") || "无正文"
}

function getMessageTitle(message: Pick<MessageRecord, "subject"> | Pick<MessageDetailRecord, "subject">) {
  return message.subject || "(无主题)"
}

function getMessageSender(message: Pick<MessageRecord, "from" | "fromName"> | Pick<MessageDetailRecord, "from" | "fromName">) {
  return message.fromName || message.from
}

function getMessageSenderSecondary(
  message: Pick<MessageRecord, "from" | "fromName"> | Pick<MessageDetailRecord, "from" | "fromName">
) {
  return message.fromName ? message.from : null
}

function getInitialMessageDetailTab(detail: MessageDetailRecord): MessageDetailTab {
  if (detail.hasHtml) return "html"
  if (detail.hasText) return "text"
  return "source"
}

function getMessageDetailEmptyCopy(tab: MessageDetailTab) {
  switch (tab) {
    case "text":
      return "该邮件没有纯文本内容。"
    case "html":
      return "该邮件没有富文本内容。"
    case "source":
      return "该邮件没有可显示的源码内容。"
  }
}

function getHeaderKey(header: MessageHeaderRecord, index: number) {
  return `${header.name}-${header.value}-${index}`
}

function getAttachmentKey(attachment: MessageAttachmentRecord) {
  return attachment.id
}

function getMessageContactKey(contact: MessageContactRecord, index: number) {
  return `${contact.address || contact.name || "contact"}-${index}`
}

function isMessageDetailTab(value: string): value is MessageDetailTab {
  return value === "text" || value === "html" || value === "source"
}

function getDialogDescription(detail: MessageDetailRecord | null) {
  if (!detail) {
    return "查看这封邮件的纯文本、富文本和源码内容。"
  }

  return `${detail.from} · ${formatDate(detail.receivedAt)}`
}

function getMessageTabValue(detail: MessageDetailRecord | null, current: MessageDetailTab): MessageDetailTab {
  if (!detail) {
    return current
  }

  if (current === "text" && !detail.hasText) {
    return getInitialMessageDetailTab(detail)
  }
  if (current === "html" && !detail.hasHtml) {
    return getInitialMessageDetailTab(detail)
  }

  return current
}

function shouldShowMessageMetadata(detail: MessageDetailRecord) {
  return detail.replyTo.length > 0 || detail.cc.length > 0 || detail.headers.length > 0 || detail.attachments.length > 0
}

function renderableHtmlExists(detail: MessageDetailRecord) {
  return Boolean(detail.html.trim())
}

function getOpenMessageSubjectButtonClassName() {
  return "truncate text-left text-sm text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
}

function getOpenMessageSubjectMobileButtonClassName() {
  return "w-full text-left text-sm text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
}

function getMessageDetailCopy(detail: MessageDetailRecord) {
  return buildMessageSource(detail)
}

function getMessageMetadataTitle() {
  return "邮件信息"
}

function getAttachmentSectionTitle() {
  return "附件"
}

function getRetryDetailButtonLabel() {
  return "重试"
}

function getCopySourceButtonLabel() {
  return "复制源码"
}

function getLoadingDetailCopy() {
  return "正在加载邮件内容..."
}

function getNotFoundDetailCopy() {
  return "加载邮件内容失败"
}

function getMailboxMetadataLabel() {
  return "收件邮箱"
}

function getReplyToLabel() {
  return "Reply-To"
}

function getCcLabel() {
  return "Cc"
}

function getAttachmentSummary(detail: MessageDetailRecord) {
  if (detail.attachments.length < 1) {
    return null
  }

  return `${detail.attachments.length} 个附件`
}

function getViewDialogTitle(detail: MessageDetailRecord | null, selectedMessage: MessageRecord | null) {
  if (detail) {
    return getMessageTitle(detail)
  }

  if (selectedMessage) {
    return getMessageTitle(selectedMessage)
  }

  return "邮件详情"
}

function clearMessageDetailState() {
  return {
    detail: null as MessageDetailRecord | null,
    error: null as string | null,
    selected: null as MessageRecord | null,
    loading: false,
    tab: getDefaultDetailTab(),
  }
}

function getDetailBadgeVariant(isRead: boolean): "outline" | "secondary" {
  return isRead ? "outline" : "secondary"
}

function getReadableTabLabel(tab: MessageDetailTab) {
  return messageDetailTabLabels[tab]
}

function shouldAutoMarkRead(message: MessageRecord) {
  return !message.isRead
}

function getMessageMetadataItems(detail: MessageDetailRecord) {
  return [
    { label: getMailboxMetadataLabel(), value: detail.mailboxEmailAddress },
    detail.replyTo.length > 0
      ? { label: getReplyToLabel(), value: detail.replyTo.map(formatMessageContact).filter(Boolean).join(", ") }
      : null,
    detail.cc.length > 0 ? { label: getCcLabel(), value: detail.cc.map(formatMessageContact).filter(Boolean).join(", ") } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>
}

function getMessageHeaders(detail: MessageDetailRecord) {
  return detail.headers.filter((header) => header.name && header.value)
}

function buildRetryableMessageDetailError(message: string | null) {
  return message || getNotFoundDetailCopy()
}

function getMessageDialogCopyButtonMessage() {
  return "源码已复制"
}

function getHtmlFrameTitle() {
  return "邮件 HTML 预览"
}

function getMessageActionsClassName() {
  return "flex flex-wrap gap-2"
}

function getMetadataGridClassName() {
  return "grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-2"
}

function getMetadataBlockClassName() {
  return "space-y-1"
}

function getPreBlockClassName() {
  return "max-h-[55vh] overflow-auto rounded-lg border bg-muted/20 p-4 font-mono text-xs leading-6 whitespace-pre-wrap break-words"
}

function getHtmlFrameClassName() {
  return "h-[min(60vh,32rem)] min-h-[18rem] w-full rounded-lg border bg-white"
}

function getEmptyStateClassName() {
  return "rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground"
}

function getAttachmentListClassName() {
  return "space-y-2 rounded-lg border bg-muted/20 p-3 break-all"
}

function getAttachmentItemClassName() {
  return "flex flex-col gap-1 rounded-md border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
}

function getAttachmentMetaClassName() {
  return "text-xs text-muted-foreground"
}

function getDetailContainerClassName() {
  return "flex min-h-0 flex-1 flex-col gap-4"
}

function getMetadataLabelClassName() {
  return "text-xs uppercase tracking-[0.12em] text-muted-foreground"
}

function getMetadataValueClassName() {
  return "break-all text-sm"
}

function getSectionTitleClassName() {
  return "text-sm font-medium"
}

function getDialogDescriptionClassName() {
  return "break-all"
}

function getMessageDialogFooterClassName() {
  return "border-t pt-4 justify-between gap-2 sm:justify-between"
}

function getDialogBodyClassName() {
  return "flex min-h-0 flex-1 flex-col gap-4"
}

function getTabsClassName() {
  return "space-y-4"
}

function getTabsListClassName() {
  return "grid w-full grid-cols-3"
}

function getDetailLoadingClassName() {
  return "py-12 text-center text-sm text-muted-foreground"
}

function getDetailErrorClassName() {
  return "space-y-4 py-8 text-center text-sm text-destructive"
}

function getInlineMutedClassName() {
  return "text-xs text-muted-foreground"
}

function getHeaderListClassName() {
  return "space-y-2 rounded-lg border bg-muted/20 p-3"
}

function getHeaderItemClassName() {
  return "rounded-md border bg-background px-3 py-2"
}

function getHeaderNameClassName() {
  return "text-xs uppercase tracking-[0.12em] text-muted-foreground"
}

function getHeaderValueClassName() {
  return "mt-1 break-all font-mono text-xs"
}

function getResponsiveContentClassName() {
  return "flex min-h-0 flex-1 flex-col overflow-hidden"
}

function getAttachmentMeta(attachment: MessageAttachmentRecord) {
  return `${attachment.mimeType} · ${formatAttachmentSize(attachment.size)}`
}

function getMessageStatusCopy(isRead: boolean) {
  return isRead ? "已读" : "未读"
}

function getHasAttachmentCopy() {
  return "附件"
}

function getNoMessageSelectedCopy() {
  return "邮件详情"
}

function getSourceContent(detail: MessageDetailRecord | null) {
  return detail ? buildMessageSource(detail) : ""
}

function getIframeSrc(detail: MessageDetailRecord | null) {
  return detail ? buildIframeSrcDoc(detail.html) : buildIframeSrcDoc("")
}

function getOpenDetailErrorMessage() {
  return "加载邮件内容失败"
}

function getDetailRetryButtonVariant(): "outline" {
  return "outline"
}

function getDetailCopyButtonVariant(): "outline" {
  return "outline"
}

function getDetailCloseButtonLabel() {
  return "关闭"
}

function getTabContentClassName() {
  return "space-y-4"
}

function getHtmlFrameWrapperClassName() {
  return "overflow-hidden rounded-lg border"
}

function getMessageDialogAriaLabel() {
  return "邮件详情"
}

function getMessageContactList(detail: MessageDetailRecord, type: "replyTo" | "cc") {
  return type === "replyTo" ? detail.replyTo : detail.cc
}

function getDetailTabContent(detail: MessageDetailRecord | null, tab: MessageDetailTab) {
  if (!detail) {
    return ""
  }

  if (tab === "text") {
    return detail.text
  }
  if (tab === "html") {
    return detail.html
  }
  return buildMessageSource(detail)
}

function hasDetailTabContent(detail: MessageDetailRecord | null, tab: MessageDetailTab) {
  if (!detail) {
    return false
  }

  if (tab === "text") return detail.hasText
  if (tab === "html") return detail.hasHtml
  return Boolean(buildMessageSource(detail).trim())
}

function getMessageDetailTabTitle(tab: MessageDetailTab) {
  return getReadableTabLabel(tab)
}

function getDialogOpenState(selectedMessage: MessageRecord | null) {
  return Boolean(selectedMessage)
}

function getSelectedMessageId(selectedMessage: MessageRecord | null) {
  return selectedMessage?.id ?? null
}

function getMessageDetailDialogDescription(detail: MessageDetailRecord | null) {
  return getDialogDescription(detail)
}

function getDetailFromLine(detail: MessageDetailRecord) {
  return detail.fromName ? `${detail.fromName} <${detail.from}>` : detail.from
}

function getDetailMailboxLine(detail: MessageDetailRecord) {
  return detail.mailboxEmailAddress
}

function hasDetailAttachments(detail: MessageDetailRecord) {
  return detail.attachments.length > 0
}

function getHeaderCount(detail: MessageDetailRecord) {
  return getMessageHeaders(detail).length
}

function getCopySourceValue(detail: MessageDetailRecord | null) {
  return detail ? getMessageDetailCopy(detail) : ""
}

function getDefaultDetailTab() {
  return "html" as MessageDetailTab
}

function normalizeDetailTab(value: string, detail: MessageDetailRecord | null) {
  return isMessageDetailTab(value) ? getMessageTabValue(detail, value) : getDefaultDetailTab()
}

function getMessageLoadingDescription() {
  return "查看这封邮件的纯文本、富文本和源码内容。"
}

function isSelectedMessage(message: MessageRecord, selectedMessage: MessageRecord | null) {
  return message.id === selectedMessage?.id
}

function getMessageDialogDescriptionValue(detail: MessageDetailRecord | null) {
  return detail ? getMessageDetailDialogDescription(detail) : getMessageLoadingDescription()
}

function getDetailHeaderSummary(detail: MessageDetailRecord) {
  const attachmentSummary = getAttachmentSummary(detail)
  return [getDetailFromLine(detail), formatDate(detail.receivedAt), attachmentSummary].filter(Boolean).join(" · ")
}

function getDetailMetadataRows(detail: MessageDetailRecord) {
  return getMessageMetadataItems(detail)
}

function getMessageTitleForDialog(detail: MessageDetailRecord | null, selectedMessage: MessageRecord | null) {
  return getViewDialogTitle(detail, selectedMessage)
}

function getMessagePreviewForList(message: MessageRecord) {
  return getMessagePreview(message)
}

function getMessageSenderPrimary(message: MessageRecord) {
  return getMessageSender(message)
}

function getMessageSenderSecondaryLine(message: MessageRecord) {
  return getMessageSenderSecondary(message)
}

function getMessageDetailStatusVariant(detail: MessageDetailRecord) {
  return getDetailBadgeVariant(detail.isRead)
}

function getMessageDetailStatusText(detail: MessageDetailRecord) {
  return getMessageStatusCopy(detail.isRead)
}

function getMessageAttachmentBadgeText() {
  return getHasAttachmentCopy()
}

function shouldShowHtmlPreview(detail: MessageDetailRecord | null) {
  return Boolean(detail && renderableHtmlExists(detail))
}

function getMessageDetailErrorCopy(error: string | null) {
  return buildRetryableMessageDetailError(error)
}

function getMessageDetailSelectedTab(detail: MessageDetailRecord | null, current: MessageDetailTab) {
  return getMessageTabValue(detail, current)
}

function getMessageHeaderRows(detail: MessageDetailRecord) {
  return getMessageHeaders(detail)
}

function getMessageDetailMetadataVisible(detail: MessageDetailRecord) {
  return shouldShowMessageMetadata(detail)
}

function getMessageDialogOpen(selectedMessage: MessageRecord | null) {
  return getDialogOpenState(selectedMessage)
}

function getSelectedMessageIdValue(selectedMessage: MessageRecord | null) {
  return getSelectedMessageId(selectedMessage)
}

function getSelectedMessageTitle(selectedMessage: MessageRecord | null) {
  return selectedMessage ? getMessageTitle(selectedMessage) : getNoMessageSelectedCopy()
}

function getMessageDetailAriaTitle() {
  return getMessageDialogAriaLabel()
}

function getMessageIframeDoc(detail: MessageDetailRecord | null) {
  return getIframeSrc(detail)
}

function getMessageSourceValue(detail: MessageDetailRecord | null) {
  return getSourceContent(detail)
}

function getMessageTabEmptyState(tab: MessageDetailTab) {
  return getMessageDetailEmptyCopy(tab)
}

function getMessageAttachmentMeta(attachment: MessageAttachmentRecord) {
  return getAttachmentMeta(attachment)
}

function getMessageDetailRetryLabel() {
  return getRetryDetailButtonLabel()
}

function getMessageDetailCloseLabel() {
  return getDetailCloseButtonLabel()
}

function getMessageDetailCopyLabel() {
  return getCopySourceButtonLabel()
}

function getMessageDetailCopyToast() {
  return getMessageDialogCopyButtonMessage()
}

function getMessageDetailTabLabel(tab: MessageDetailTab) {
  return getMessageDetailTabTitle(tab)
}

function getMessageDetailHtmlTitle() {
  return getHtmlFrameTitle()
}

function getMessageDetailDialogClassName() {
  return "flex max-h-[min(92vh,56rem)] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0"
}

function getMessageDetailHasHtml(detail: MessageDetailRecord | null) {
  return shouldShowHtmlPreview(detail)
}

function getMessageDetailTabClassName() {
  return getTabContentClassName()
}

function getMessageDetailTabsClassName() {
  return getTabsClassName()
}

function getMessageDetailTabsListClassName() {
  return getTabsListClassName()
}

function getMessageDetailBodyClassName() {
  return getDialogBodyClassName()
}

function getMessageDetailFooterClassName() {
  return getMessageDialogFooterClassName()
}

function getMessageDetailLoadingClassName() {
  return getDetailLoadingClassName()
}

function getMessageDetailErrorClassName() {
  return getDetailErrorClassName()
}

function getMessageDetailPreClassName() {
  return getPreBlockClassName()
}

function getMessageDetailEmptyClassName() {
  return getEmptyStateClassName()
}

function getMessageDetailIframeClassName() {
  return getHtmlFrameClassName()
}

function getMessageDetailIframeWrapperClassName() {
  return getHtmlFrameWrapperClassName()
}

function getMessageDetailMetadataGridClassName() {
  return getMetadataGridClassName()
}

function getMessageDetailMetadataBlockClassName() {
  return getMetadataBlockClassName()
}

function getMessageDetailMetadataLabelClassName() {
  return getMetadataLabelClassName()
}

function getMessageDetailMetadataValueClassName() {
  return getMetadataValueClassName()
}

function getMessageDetailSectionTitleClassName() {
  return getSectionTitleClassName()
}

function getMessageDetailHeaderListClassName() {
  return getHeaderListClassName()
}

function getMessageDetailHeaderItemClassName() {
  return getHeaderItemClassName()
}

function getMessageDetailHeaderNameClassName() {
  return getHeaderNameClassName()
}

function getMessageDetailHeaderValueClassName() {
  return getHeaderValueClassName()
}

function getMessageDetailAttachmentListClassName() {
  return getAttachmentListClassName()
}

function getMessageDetailAttachmentItemClassName() {
  return getAttachmentItemClassName()
}

function getMessageDetailAttachmentMetaClassName() {
  return getAttachmentMetaClassName()
}

function getMessageDetailContainerClassName() {
  return getDetailContainerClassName()
}

function getMessageDetailResponsiveContentClassName() {
  return getResponsiveContentClassName()
}

function getMessageDetailActionsClassName() {
  return getMessageActionsClassName()
}

function getMessageOpenSubjectButtonClassName() {
  return getOpenMessageSubjectButtonClassName()
}

function getMessageOpenSubjectMobileButtonClassName() {
  return getOpenMessageSubjectMobileButtonClassName()
}

function getMessageDetailInlineMutedClassName() {
  return getInlineMutedClassName()
}

function getMessageDetailDialogDescriptionClassName() {
  return getDialogDescriptionClassName()
}

function getMessageDetailLoadingCopy() {
  return getLoadingDetailCopy()
}

function getMessageDetailOpenErrorCopy() {
  return getOpenDetailErrorMessage()
}

function getMessageDetailMetadataTitle() {
  return getMessageMetadataTitle()
}

function getMessageDetailAttachmentTitle() {
  return getAttachmentSectionTitle()
}

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
  const [selectedMessage, setSelectedMessage] = useState<MessageRecord | null>(null)
  const [messageDetail, setMessageDetail] = useState<MessageDetailRecord | null>(null)
  const [messageDetailError, setMessageDetailError] = useState<string | null>(null)
  const [loadingMessageDetail, setLoadingMessageDetail] = useState(false)
  const [messageDetailTab, setMessageDetailTab] = useState<MessageDetailTab>(getDefaultDetailTab())
  const [messageDetailReloadNonce, setMessageDetailReloadNonce] = useState(0)
  const latestMessageRequestIdRef = useRef(0)
  const latestDetailRequestIdRef = useRef(0)
  const hasShownMailboxUnavailableToastRef = useRef(false)
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const selectedMailbox = useMemo(
    () => mailboxes.find((item) => item.id === selectedMailboxId) ?? null,
    [mailboxes, selectedMailboxId]
  )

  const normalizedMailboxLocalPart = mailboxInput.trim().toLowerCase().replace(/^@+|@+$/g, "")
  const selectedDomainConfig = useMemo(
    () => emailDomains.find((item) => item.host === selectedDomain) ?? null,
    [emailDomains, selectedDomain]
  )
  const selectedMinLocalPartLength = selectedDomainConfig?.minLocalPartLength ?? 1
  const mailboxLocalPartTooShort =
    normalizedMailboxLocalPart.length > 0 && normalizedMailboxLocalPart.length < selectedMinLocalPartLength

  const mailboxPreview = useMemo(() => {
    if (!normalizedMailboxLocalPart || !selectedDomain) return ""
    return `${normalizedMailboxLocalPart}@${selectedDomain}`
  }, [normalizedMailboxLocalPart, selectedDomain])

  const canCreateMailbox =
    Boolean(selectedDomain) && !loadingDomains && !creatingMailbox && !mailboxLocalPartTooShort
  const hasMailboxList = mailboxes.length > 0

  const resetMessageDetail = useCallback(() => {
    const nextState = clearMessageDetailState()
    setSelectedMessage(nextState.selected)
    setMessageDetail(nextState.detail)
    setMessageDetailError(nextState.error)
    setLoadingMessageDetail(nextState.loading)
    setMessageDetailTab(nextState.tab)
  }, [])

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
    const isSilent = options?.silent === true
    if (!isSilent) {
      setLoadingMailboxes(true)
      setMailboxesError(null)
    }

    try {
      const res = await fetch("/api/emails?page=1&limit=100")
      const body = await readOptionalJson<MailboxResponse & { error?: string }>(res)
      if (!res.ok) {
        const message = getResponseErrorMessage(body, "加载邮箱失败")
        tempEmailReporter.warn("fetch_mailboxes_failed_response", { status: res.status })
        if (!isSilent) {
          setMailboxesError(message)
          toast.error(message)
        }
        return
      }

      const rows = body?.data || []
      hasShownMailboxUnavailableToastRef.current = false
      setMailboxesError(null)
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
      if (!isSilent) {
        setMailboxesError(message)
        toast.error(message)
      }
    } finally {
      if (!isSilent) {
        setLoadingMailboxes(false)
      }
    }
  }, [])

  const handleMailboxUnavailable = useCallback(async (showToast = false) => {
    if (showToast && !hasShownMailboxUnavailableToastRef.current) {
      hasShownMailboxUnavailableToastRef.current = true
      tempEmailReporter.warn("selected_mailbox_unavailable")
      toast.error("当前邮箱已失效，已为你刷新邮箱列表")
    }

    latestMessageRequestIdRef.current += 1
    latestDetailRequestIdRef.current += 1
    setMessages([])
    setMessagesError(null)
    setLoadingMessages(false)
    resetMessageDetail()
    await fetchMailboxes({ silent: !showToast })
  }, [fetchMailboxes, resetMessageDetail])

  const fetchMessages = useCallback(async (mailboxId: string, options?: { silent?: boolean }) => {
    const isSilent = options?.silent === true
    const requestId = latestMessageRequestIdRef.current + 1
    latestMessageRequestIdRef.current = requestId
    if (!isSilent) {
      setLoadingMessages(true)
      setMessagesError(null)
    }

    try {
      const res = await fetch(`/api/emails/${mailboxId}/messages?page=1&limit=100`)
      const body = await readOptionalJson<MessageResponse & { error?: string }>(res)

      if (!res.ok) {
        if (res.status === 404) {
          tempEmailReporter.warn("fetch_messages_mailbox_missing", { mailboxId })
          await handleMailboxUnavailable(!isSilent)
          return
        }

        const message = getResponseErrorMessage(body, "加载邮件失败")
        tempEmailReporter.warn("fetch_messages_failed_response", { mailboxId, status: res.status })
        if (!isSilent) {
          toast.error(message)
        }
        if (!isSilent && latestMessageRequestIdRef.current === requestId) {
          setMessages([])
          setMessagesError(message)
        }
        return
      }

      if (!body || latestMessageRequestIdRef.current !== requestId || body.mailbox.id !== mailboxId) {
        return
      }

      const nextMessages = body.data || []
      const nextMessageCount = typeof body.total === "number" ? body.total : nextMessages.length
      setMessages(nextMessages)
      setMessagesError(null)
      setMailboxes((prev) => {
        let didUpdate = false
        const unreadCount = nextMessages.filter((item) => !item.isRead).length
        const next = prev.map((item) => {
          if (item.id !== mailboxId) {
            return item
          }
          didUpdate = true
          return {
            ...item,
            messageCount: nextMessageCount,
            unreadCount,
          }
        })
        return didUpdate ? next : prev
      })
      setSelectedMessage((current) => {
        if (!current) return current
        return nextMessages.find((item) => item.id === current.id) ?? null
      })
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "加载邮件失败")
      tempEmailReporter.report("fetch_messages_failed_exception", error, { mailboxId })
      if (!isSilent) {
        toast.error(message)
      }
      if (!isSilent && latestMessageRequestIdRef.current === requestId) {
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
    latestDetailRequestIdRef.current += 1
    resetMessageDetail()

    if (!selectedMailboxId) {
      latestMessageRequestIdRef.current += 1
      setMessages([])
      setMessagesError(null)
      setLoadingMessages(false)
      return
    }

    fetchMessages(selectedMailboxId)
  }, [fetchMessages, resetMessageDetail, selectedMailboxId])

  const handleRetryMessageDetail = useCallback(() => {
    if (!selectedMessage) {
      return
    }

    setMessageDetail(null)
    setMessageDetailError(null)
    setLoadingMessageDetail(true)
    setMessageDetailTab(getDefaultDetailTab())
    setMessageDetailReloadNonce((current) => current + 1)
  }, [selectedMessage])

  async function handleCopy(text: string, successMessage = "已复制") {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(successMessage)
    } catch (_e) {
      toast.error("复制失败，请手动选择复制")
    }
  }

  async function handleCopyMessageSource() {
    const value = getCopySourceValue(messageDetail)
    if (!value) {
      return
    }

    await handleCopy(value, getMessageDetailCopyToast())
  }

  function handleOpenMessage(message: MessageRecord) {
    setSelectedMessage(message)
    setMessageDetail(null)
    setMessageDetailError(null)
    setLoadingMessageDetail(true)
    setMessageDetailTab(getDefaultDetailTab())
    if (shouldAutoMarkRead(message)) {
      void handleMarkRead(message.id)
    }
  }

  function handleMessageDialogOpenChange(open: boolean) {
    if (!open) {
      latestDetailRequestIdRef.current += 1
      resetMessageDetail()
    }
  }

  function handleMessageDetailTabChange(value: string) {
    setMessageDetailTab(normalizeDetailTab(value, messageDetail))
  }

  useEffect(() => {
    if (!selectedMessage) {
      return
    }

    const nextSelectedMessage = messages.find((item) => item.id === selectedMessage.id) ?? null
    if (!nextSelectedMessage) {
      resetMessageDetail()
      return
    }

    if (nextSelectedMessage !== selectedMessage) {
      setSelectedMessage(nextSelectedMessage)
    }
  }, [messages, resetMessageDetail, selectedMessage])

  useEffect(() => {
    if (!selectedMessage?.isRead) {
      return
    }

    setMessageDetail((current) => (current ? { ...current, isRead: true } : current))
  }, [selectedMessage?.isRead])

  const selectedMessageId = getSelectedMessageIdValue(selectedMessage)
  const selectedDetailTab = getMessageDetailSelectedTab(messageDetail, messageDetailTab)
  const messageDialogOpen = getMessageDialogOpen(selectedMessage)

  useEffect(() => {
    if (!selectedMailboxId) {
      return
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return
      }
      if (messageDialogOpen) {
        return
      }
      if (loadingMailboxes || loadingMessages) {
        return
      }

      void fetchMailboxes({ silent: true }).then(() => fetchMessages(selectedMailboxId, { silent: true }))
    }, 15000)

    return () => window.clearInterval(interval)
  }, [fetchMailboxes, fetchMessages, loadingMailboxes, loadingMessages, messageDialogOpen, selectedMailboxId])

  function handleGenerateRandomPrefix() {
    setMailboxInput(generateRandomEmailPrefix())
  }

  async function handleCreateMailbox() {
    const localPart = normalizedMailboxLocalPart
    if (!localPart) {
      toast.error("请输入邮箱前缀")
      return
    }
    if (!selectedDomain) {
      toast.error("暂无可用邮箱域名")
      return
    }
    if (localPart.length < selectedMinLocalPartLength) {
      toast.error(`邮箱前缀至少需要 ${selectedMinLocalPartLength} 个字符`)
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

  const handleMarkRead = useCallback(async (messageId: string) => {
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
  }, [fetchMailboxes])

  useEffect(() => {
    const currentSelectedMessageId = selectedMessage?.id
    if (!currentSelectedMessageId) {
      latestDetailRequestIdRef.current += 1
      setMessageDetail(null)
      setMessageDetailError(null)
      setLoadingMessageDetail(false)
      setMessageDetailTab(getDefaultDetailTab())
      return
    }

    const requestId = latestDetailRequestIdRef.current + 1
    latestDetailRequestIdRef.current = requestId
    setMessageDetail(null)
    setMessageDetailError(null)
    setLoadingMessageDetail(true)

    void (async () => {
      try {
        const res = await fetch(`/api/emails/messages/${currentSelectedMessageId}`)
        const body = await readOptionalJson<MessageDetailResponse & { error?: string }>(res)
        if (!res.ok) {
          const message = getResponseErrorMessage(body, getMessageDetailOpenErrorCopy())
          tempEmailReporter.warn("fetch_message_detail_failed_response", {
            messageId: currentSelectedMessageId,
            status: res.status,
          })
          if (latestDetailRequestIdRef.current === requestId) {
            setMessageDetailError(message)
          }
          return
        }

        if (!body?.data || latestDetailRequestIdRef.current !== requestId) {
          return
        }

        setMessageDetail(body.data)
        setMessageDetailTab(getInitialMessageDetailTab(body.data))
      } catch (error) {
        const message = getUserFacingErrorMessage(error, getMessageDetailOpenErrorCopy())
        tempEmailReporter.report("fetch_message_detail_failed_exception", error, {
          messageId: currentSelectedMessageId,
        })
        if (latestDetailRequestIdRef.current === requestId) {
          setMessageDetailError(message)
        }
      } finally {
        if (latestDetailRequestIdRef.current === requestId) {
          setLoadingMessageDetail(false)
        }
      }
    })()
  }, [messageDetailReloadNonce, selectedMessage?.id])

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

      if (selectedMessageId === messageId) {
        latestDetailRequestIdRef.current += 1
        resetMessageDetail()
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

  return (
    <>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="grid gap-6 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-5">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Mailbox studio</p>
                <h2 className="text-2xl font-semibold tracking-tight">生成临时收件箱</h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  输入可记忆的前缀，或随机生成一个地址。创建后会进入下方邮箱队列，右侧直接查看邮件。
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="space-y-2">
                  <label htmlFor="temp-email-prefix" className="text-sm font-medium">
                    邮箱前缀
                  </label>
                  <Input
                    id="temp-email-prefix"
                    aria-label="邮箱前缀"
                    placeholder="例如 project-test"
                    value={mailboxInput}
                    onChange={(e) => setMailboxInput(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="temp-email-domain" className="text-sm font-medium">
                    域名
                  </label>
                  <Select value={selectedDomain} onValueChange={setSelectedDomain} disabled={emailDomains.length < 1}>
                    <SelectTrigger id="temp-email-domain" aria-label="邮箱域名" className="h-11">
                      <SelectValue placeholder="选择域名" />
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
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={handleGenerateRandomPrefix} className="h-10 flex-1 border-dashed sm:flex-none sm:px-5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  随机前缀
                </Button>
                <Button onClick={handleCreateMailbox} disabled={!canCreateMailbox} className="h-10 flex-1 sm:flex-none sm:px-6">
                  <MailPlus className="h-4 w-4" />
                  {creatingMailbox ? "创建中..." : "创建邮箱"}
                </Button>
              </div>

              {mailboxLocalPartTooShort && (
                <p className="text-xs text-destructive">当前域名要求邮箱前缀至少 {selectedMinLocalPartLength} 个字符。</p>
              )}
              {loadingDomains ? (
                <p className="text-xs text-muted-foreground">正在载入可用邮箱域名...</p>
              ) : domainsError ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
                  <span>{domainsError}</span>
                  <Button type="button" variant="link" size="sm" onClick={() => fetchDomains()} className="h-auto p-0 text-destructive">
                    重试
                  </Button>
                </div>
              ) : null}
            </div>

            <aside className="flex min-h-48 flex-col justify-between gap-5 rounded-lg border bg-muted/20 p-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Preview</p>
                <p className="break-all font-mono text-lg font-semibold leading-snug">
                  {mailboxPreview || "your-address@domain.com"}
                </p>
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>可用域名</span>
                  <span className="font-medium text-foreground">{emailDomains.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>前缀下限</span>
                  <span className="font-medium text-foreground">≥ {selectedMinLocalPartLength}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>当前邮箱</span>
                  <span className="font-medium text-foreground">{mailboxes.length}</span>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">邮箱队列</h3>
                <p className="text-sm text-muted-foreground">选择一个邮箱查看收件箱。</p>
              </div>
              {mailboxes.length > 0 && (
                <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">
                  {mailboxes.length} Active
                </span>
              )}
            </div>

            {loadingMailboxes ? (
              <div className="flex h-40 items-center justify-center rounded-xl border border-dashed bg-muted/5 text-sm text-muted-foreground">正在加载...</div>
            ) : mailboxes.length === 0 ? (
              <div className="flex h-40 items-center justify-center rounded-xl border border-dashed bg-muted/5 px-4 text-center text-sm text-muted-foreground">还没有邮箱。先在上方生成一个地址。</div>
            ) : (
              <div className="grid gap-2">
                {mailboxes.map((mailbox) => (
                  <div
                    key={mailbox.id}
                    className={`group rounded-xl border bg-card p-3 transition-all ${
                      mailbox.id === selectedMailboxId
                        ? "border-primary/50 bg-primary/[0.03]"
                        : "hover:border-primary/20 hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedMailboxId(mailbox.id)}
                        className="min-w-0 flex-1 text-left outline-none"
                      >
                        <p className={`break-all font-mono text-sm ${mailbox.id === selectedMailboxId ? "font-semibold text-primary" : "text-foreground"}`}>
                          {mailbox.emailAddress}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{formatDate(mailbox.createdAt)}</span>
                          <span>{mailbox.messageCount} 封</span>
                          {mailbox.unreadCount > 0 && <span className="font-medium text-primary">{mailbox.unreadCount} 未读</span>}
                        </div>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 shrink-0 text-destructive opacity-100 transition-opacity hover:bg-destructive/10 sm:opacity-0 sm:group-hover:opacity-100"
                        onClick={() => setPendingDeleteMailbox(mailbox)}
                        disabled={deletingMailboxId === mailbox.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold tracking-tight">
                  {selectedMailbox?.emailAddress || "收件箱"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedMailbox ? "查看、标记和删除收到的邮件。" : "选择一个邮箱后会显示邮件列表。"}
                </p>
              </div>

              {selectedMailbox && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void fetchMessages(selectedMailbox.id)}
                    disabled={loadingMessages}
                    className="h-9"
                  >
                    <RefreshCw className={`h-3.5 w-3.5${loadingMessages ? " animate-spin" : ""}`} />
                    刷新
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(selectedMailbox.emailAddress, "邮箱地址已复制")}
                    className="h-9"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </Button>
                </div>
              )}
            </div>

            <div className="relative min-h-[28rem] sm:min-h-[32rem]">
              {!selectedMailbox ? (
                <div className="flex h-full min-h-[28rem] items-center justify-center rounded-xl border border-dashed bg-muted/5 px-4 text-center text-sm text-muted-foreground sm:min-h-[32rem]">
                  {hasMailboxList ? "从邮箱队列中选择一个地址。" : "上方创建邮箱后，这里会显示收件箱。"}
                </div>
              ) : loadingMessages ? (
                <div className="flex h-full min-h-[28rem] items-center justify-center rounded-xl border border-dashed bg-muted/5 text-sm text-muted-foreground sm:min-h-[32rem]">
                  正在同步邮件...
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full min-h-[28rem] items-center justify-center rounded-xl border border-dashed bg-muted/5 text-sm text-muted-foreground sm:min-h-[32rem]">
                  收件箱空空如也。
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border bg-card">
                  {isDesktop ? (
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">发件人</TableHead>
                          <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">邮件主题</TableHead>
                          <TableHead className="h-10 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">状态</TableHead>
                          <TableHead className="h-10 pr-6 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {messages.map((message) => (
                          <TableRow key={message.id} className="group/row">
                            <TableCell className="py-4">
                              <div className="max-w-[180px]">
                                <p className="truncate text-sm font-semibold">{getMessageSenderPrimary(message)}</p>
                                <p className="truncate text-[10px] text-muted-foreground/60">{getMessageSenderSecondaryLine(message)}</p>
                              </div>
                            </TableCell>
                            <TableCell className="py-4">
                              <div className="max-w-md">
                                <button
                                  type="button"
                                  className="block max-w-full truncate text-left text-sm font-medium outline-none transition-colors hover:text-primary"
                                  onClick={() => handleOpenMessage(message)}
                                >
                                  {getMessageTitle(message)}
                                </button>
                                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{getMessagePreviewForList(message)}</p>
                              </div>
                            </TableCell>
                            <TableCell className="py-4 text-center">
                              <Badge
                                variant="outline"
                                className={`h-6 px-2 text-[10px] font-medium ${
                                  !message.isRead ? "border-primary/20 bg-primary/5 text-primary" : "text-muted-foreground"
                                }`}
                              >
                                {message.isRead ? "已读" : "未读"}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-4 pr-6 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {!message.isRead && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleMarkRead(message.id)}
                                    className="h-8 rounded-lg px-2 text-xs hover:bg-muted"
                                  >
                                    已读
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                                  onClick={() => setPendingDeleteMessage(message)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="divide-y p-1">
                      {messages.map((message) => (
                        <div key={message.id} className="space-y-3 p-4 sm:p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{getMessageSenderPrimary(message)}</p>
                              <span className="text-[10px] text-muted-foreground">{formatDate(message.receivedAt)}</span>
                            </div>
                            <Badge variant={!message.isRead ? "secondary" : "outline"} className="text-[10px]">
                              {message.isRead ? "已读" : "未读"}
                            </Badge>
                          </div>
                          <button
                            onClick={() => handleOpenMessage(message)}
                            className="text-left text-sm font-medium leading-normal outline-none hover:text-primary"
                          >
                            {getMessageTitle(message)}
                          </button>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleOpenMessage(message)} className="h-8 flex-1 text-[11px] font-bold uppercase">
                              详情
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPendingDeleteMessage(message)}
                              className="h-8 border-destructive/20 text-destructive hover:bg-destructive/5"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={messageDialogOpen} onOpenChange={handleMessageDialogOpenChange}>
        <DialogContent className={getMessageDetailDialogClassName()} aria-label={getMessageDetailAriaTitle()}>
          <DialogHeader>
            <DialogTitle className="break-words">{getMessageTitleForDialog(messageDetail, selectedMessage)}</DialogTitle>
            <DialogDescription className={getMessageDetailDialogDescriptionClassName()}>
              {getMessageDialogDescriptionValue(messageDetail)}
            </DialogDescription>
          </DialogHeader>

          <div className={getMessageDetailResponsiveContentClassName()}>
            {loadingMessageDetail ? (
              <div className={getMessageDetailLoadingClassName()}>{getMessageDetailLoadingCopy()}</div>
            ) : messageDetailError ? (
              <div className={getMessageDetailErrorClassName()}>
                <p>{getMessageDetailErrorCopy(messageDetailError)}</p>
                <Button type="button" variant={getDetailRetryButtonVariant()} size="sm" onClick={handleRetryMessageDetail}>
                  {getMessageDetailRetryLabel()}
                </Button>
              </div>
            ) : messageDetail ? (
              <div className={getMessageDetailBodyClassName()}>
                <div className={getMessageDetailContainerClassName()}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="break-all text-sm font-medium">{getDetailHeaderSummary(messageDetail)}</p>
                      <p className={`${getMessageDetailInlineMutedClassName()} break-all`}>{getDetailMailboxLine(messageDetail)}</p>
                    </div>
                    <div className={getMessageDetailActionsClassName()}>
                      <Badge variant={getMessageDetailStatusVariant(messageDetail)}>
                        {getMessageDetailStatusText(messageDetail)}
                      </Badge>
                      {messageDetail.hasAttachments && <Badge variant="outline">{getMessageAttachmentBadgeText()}</Badge>}
                    </div>
                  </div>

                  <div className={getMessageDetailMetadataGridClassName()}>
                    <div className={getMessageDetailMetadataBlockClassName()}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={getMessageDetailMetadataLabelClassName()}>发件人</p>
                          <p className={getMessageDetailMetadataValueClassName()}>{getDetailFromLine(messageDetail)}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0"
                          onClick={() => handleCopy(getDetailFromLine(messageDetail), "发件人已复制")}
                          aria-label="复制发件人"
                          title="复制发件人"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className={getMessageDetailMetadataBlockClassName()}>
                      <p className={getMessageDetailMetadataLabelClassName()}>接收时间</p>
                      <p className={getMessageDetailMetadataValueClassName()}>{formatDate(messageDetail.receivedAt)}</p>
                    </div>
                    {getDetailMetadataRows(messageDetail).map((item) => (
                      <div key={item.label} className={getMessageDetailMetadataBlockClassName()}>
                        <p className={getMessageDetailMetadataLabelClassName()}>{item.label}</p>
                        <p className={getMessageDetailMetadataValueClassName()}>{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {hasDetailAttachments(messageDetail) && (
                    <div className="space-y-2">
                      <h4 className={getMessageDetailSectionTitleClassName()}>{getMessageDetailAttachmentTitle()}</h4>
                      <div className={getMessageDetailAttachmentListClassName()}>
                        {messageDetail.attachments.map((attachment) => (
                          <div key={getAttachmentKey(attachment)} className={getMessageDetailAttachmentItemClassName()}>
                            <div className="min-w-0">
                              <p className="break-all text-sm font-medium">{attachment.filename}</p>
                              <p className={getMessageDetailAttachmentMetaClassName()}>{getMessageAttachmentMeta(attachment)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Tabs
                    value={selectedDetailTab}
                    onValueChange={handleMessageDetailTabChange}
                    className={getMessageDetailTabsClassName()}
                  >
                    <TabsList className={getMessageDetailTabsListClassName()}>
                      {(["text", "html", "source"] as MessageDetailTab[]).map((tab) => (
                        <TabsTrigger key={tab} value={tab}>
                          {getMessageDetailTabLabel(tab)}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    <TabsContent value="text" className={getMessageDetailTabClassName()}>
                      {hasDetailTabContent(messageDetail, "text") ? (
                        <pre className={getMessageDetailPreClassName()}>{getDetailTabContent(messageDetail, "text")}</pre>
                      ) : (
                        <div className={getMessageDetailEmptyClassName()}>{getMessageTabEmptyState("text")}</div>
                      )}
                    </TabsContent>

                    <TabsContent value="html" className={getMessageDetailTabClassName()}>
                      {getMessageDetailHasHtml(messageDetail) ? (
                        <div className={getMessageDetailIframeWrapperClassName()}>
                          <iframe
                            title={getMessageDetailHtmlTitle()}
                            srcDoc={getMessageIframeDoc(messageDetail)}
                            sandbox={iframeSandbox}
                            className={getMessageDetailIframeClassName()}
                          />
                        </div>
                      ) : (
                        <div className={getMessageDetailEmptyClassName()}>{getMessageTabEmptyState("html")}</div>
                      )}
                    </TabsContent>

                    <TabsContent value="source" className={getMessageDetailTabClassName()}>
                      <div className="space-y-4">
                        {getMessageDetailMetadataVisible(messageDetail) && (
                          <div className="space-y-2">
                            <h4 className={getMessageDetailSectionTitleClassName()}>{getMessageDetailMetadataTitle()}</h4>
                            {messageDetail.replyTo.length > 0 && (
                              <div className={getMessageDetailAttachmentListClassName()}>
                                {getMessageContactList(messageDetail, "replyTo").map((contact, index) => {
                                  const contactValue = formatMessageContact(contact)
                                  return (
                                    <div key={getMessageContactKey(contact, index)} className={getMessageDetailAttachmentItemClassName()}>
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="min-w-0 break-all text-sm">{contactValue}</p>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-sm"
                                          className="shrink-0"
                                          onClick={() => handleCopy(contactValue, "Reply-To 已复制")}
                                          aria-label={`复制 Reply-To ${contactValue}`}
                                          title="复制 Reply-To"
                                        >
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                            {messageDetail.cc.length > 0 && (
                              <div className={getMessageDetailAttachmentListClassName()}>
                                {getMessageContactList(messageDetail, "cc").map((contact, index) => {
                                  const contactValue = formatMessageContact(contact)
                                  return (
                                    <div key={getMessageContactKey(contact, index)} className={getMessageDetailAttachmentItemClassName()}>
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="min-w-0 break-all text-sm">{contactValue}</p>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-sm"
                                          className="shrink-0"
                                          onClick={() => handleCopy(contactValue, "Cc 已复制")}
                                          aria-label={`复制 Cc ${contactValue}`}
                                          title="复制 Cc"
                                        >
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                            {getHeaderCount(messageDetail) > 0 && (
                              <div className={getMessageDetailHeaderListClassName()}>
                                {getMessageHeaderRows(messageDetail).map((header, index) => (
                                  <div key={getHeaderKey(header, index)} className={getMessageDetailHeaderItemClassName()}>
                                    <p className={getMessageDetailHeaderNameClassName()}>{header.name}</p>
                                    <p className={getMessageDetailHeaderValueClassName()}>{header.value}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <pre className={getMessageDetailPreClassName()}>{getMessageSourceValue(messageDetail)}</pre>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            ) : (
              <div className={getMessageDetailLoadingClassName()}>{getSelectedMessageTitle(selectedMessage)}</div>
            )}
          </div>

          <DialogFooter className={getMessageDetailFooterClassName()}>
            <Button type="button" variant={getDetailCopyButtonVariant()} onClick={handleCopyMessageSource} disabled={!messageDetail}>
              <Copy className="h-4 w-4" />
              {getMessageDetailCopyLabel()}
            </Button>
            <Button type="button" variant="outline" onClick={() => handleMessageDialogOpenChange(false)}>
              {getMessageDetailCloseLabel()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDeleteMailbox} onOpenChange={(open) => !open && setPendingDeleteMailbox(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除这个邮箱？</DialogTitle>
            <DialogDescription>
              删除后该邮箱及其邮件将无法恢复。
              {pendingDeleteMailbox && (
                <span className="mt-2 block break-all font-mono text-xs text-muted-foreground">
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
                <span className="mt-2 block break-words text-xs text-muted-foreground">
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
