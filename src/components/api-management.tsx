"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  createClientErrorReporter,
  getResponseErrorMessage,
  getUserFacingErrorMessage,
  readOptionalJson,
} from "@/lib/client-feedback"
import { formatDate } from "@/lib/utils"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Copy, Download, KeyRound, Trash2 } from "lucide-react"

interface ApiKeyRecord {
  id: string
  name: string
  keyPrefix: string
  lastUsedAt: string | number | null
  createdAt: string | number
}

interface ApiKeysResponse {
  data: ApiKeyRecord[]
}

interface DomainsResponse {
  emailDomains: Array<{
    host: string
    isDefault: boolean
  }>
  shortDomains: Array<{
    host: string
    isDefault: boolean
  }>
  telegramBotUsername?: string
}

function maskPrefix(prefix: string): string {
  return `${prefix}****************`
}

const apiManagementReporter = createClientErrorReporter("api_management")

export function ApiManagementPanel() {
  const [loading, setLoading] = useState(true)
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [keyName, setKeyName] = useState("")
  const [creating, setCreating] = useState(false)
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null)
  const [latestPlainKey, setLatestPlainKey] = useState<string | null>(null)
  const [sharexApiKey, setSharexApiKey] = useState("")
  const [emailDomains, setEmailDomains] = useState<string[]>([])
  const [shortDomains, setShortDomains] = useState<string[]>([])
  const [telegramBotUsername, setTelegramBotUsername] = useState("")

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/v1/keys")
      if (!res.ok) {
        const body = await readOptionalJson<{ error?: string }>(res)
        apiManagementReporter.warn("fetch_keys_failed_response", { status: res.status })
        toast.error(getResponseErrorMessage(body, "加载 API Key 失败"))
        return
      }
      const body = await res.json() as ApiKeysResponse
      setKeys(body.data || [])
    } catch (error) {
      apiManagementReporter.report("fetch_keys_failed_exception", error)
      toast.error(getUserFacingErrorMessage(error, "加载 API Key 失败"))
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch("/api/domains")
      if (!res.ok) {
        return
      }
      const body = await res.json() as DomainsResponse
      setEmailDomains((body.emailDomains || []).map((item) => item.host))
      setShortDomains((body.shortDomains || []).map((item) => item.host))
      setTelegramBotUsername((body.telegramBotUsername || "").trim())
    } catch {
    }
  }, [])

  useEffect(() => {
    fetchKeys()
    fetchDomains()
  }, [fetchDomains, fetchKeys])

  const apiBaseUrl = useMemo(() => {
    const envBase = process.env.NEXT_PUBLIC_APP_URL?.trim()
    if (envBase) {
      return envBase.replace(/\/+$/, "")
    }
    if (typeof window === "undefined") return ""
    return window.location.origin
  }, [])

  const sharexConfig = useMemo(() => {
    const endpoint = `${apiBaseUrl}/v1/shorten`
    return JSON.stringify({
      Version: "17.0.0",
      Name: "Shortly URL Shortener",
      DestinationType: "URLShortener",
      RequestMethod: "POST",
      RequestURL: endpoint,
      Headers: {
        Authorization: `Bearer ${sharexApiKey || "YOUR_API_KEY"}`,
      },
      Body: "JSON",
      Data: "{\"url\":\"$input$\"}",
      URL: "$json:shortUrl$",
      DeletionURL: "",
      ErrorMessage: "$json:error$",
    }, null, 2)
  }, [apiBaseUrl, sharexApiKey])

  const shortenEndpoint = `${apiBaseUrl || "https://your-domain.com"}/v1/shorten`
  const domainsEndpoint = `${apiBaseUrl || "https://your-domain.com"}/v1/domains`
  const emailsEndpoint = `${apiBaseUrl || "https://your-domain.com"}/v1/emails`
  const emailMessageEndpoint = `${apiBaseUrl || "https://your-domain.com"}/v1/emails/messages`
  const normalizedTelegramBotUsername = telegramBotUsername.replace(/^@+/, "")
  const telegramBotHandle = normalizedTelegramBotUsername ? `@${normalizedTelegramBotUsername}` : ""
  const telegramBindCommand = `/setkey ${latestPlainKey || "YOUR_API_KEY"}`
  const sampleEmailDomain = emailDomains[0] || "mail.example.com"
  const sampleEmailAddress = `demo@${sampleEmailDomain}`
  const gettingStartedCommand = `curl -X POST '${shortenEndpoint}' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -d '{
    "url": "https://example.com/long-page"
  }'`
  const advancedShortenCommand = `curl -X POST '${shortenEndpoint}' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -d '{
    "url": "https://example.com/long-page",
    "customSlug": "my-custom-slug",
    "maxClicks": 100,
    "expiresIn": "1m"
  }'`
  const createMailboxCommand = `curl -X POST '${emailsEndpoint}' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -d '{
    "emailAddress": "${sampleEmailAddress}"
  }'`
  const listMailboxMessagesCommand = `curl '${emailsEndpoint}/MAILBOX_ID/messages?page=1&limit=20' \\
  -H 'Authorization: Bearer YOUR_API_KEY'`
  const markMessageReadCommand = `curl -X POST '${emailMessageEndpoint}/MESSAGE_ID/read' \\
  -H 'Authorization: Bearer YOUR_API_KEY'`

  async function handleCreateKey() {
    setCreating(true)
    try {
      const res = await fetch("/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: keyName.trim() || undefined,
        }),
      })
      const body = await readOptionalJson<{ error?: string; plainKey?: string }>(res)
      if (!res.ok) {
        apiManagementReporter.warn("create_key_failed_response", { status: res.status })
        toast.error(getResponseErrorMessage(body, "创建 API Key 失败"))
        return
      }

      const plainKey = body?.plainKey
      if (plainKey) {
        setLatestPlainKey(plainKey)
        setSharexApiKey(plainKey)
      }

      setKeyName("")
      toast.success("API Key 已创建")
      await fetchKeys()
    } catch (error) {
      apiManagementReporter.report("create_key_failed_exception", error)
      toast.error(getUserFacingErrorMessage(error, "创建 API Key 失败"))
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteKey(id: string) {
    setDeletingKeyId(id)
    try {
      const res = await fetch(`/v1/keys/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await readOptionalJson<{ error?: string }>(res)
        apiManagementReporter.warn("delete_key_failed_response", { keyId: id, status: res.status })
        toast.error(getResponseErrorMessage(body, "删除 API Key 失败"))
        return
      }

      setKeys((prev) => prev.filter((item) => item.id !== id))
      toast.success("API Key 已删除")
    } catch (error) {
      apiManagementReporter.report("delete_key_failed_exception", error, { keyId: id })
      toast.error(getUserFacingErrorMessage(error, "删除 API Key 失败"))
    } finally {
      setDeletingKeyId(null)
    }
  }

  async function handleCopy(text: string, message = "已复制") {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(message)
    } catch (error) {
      apiManagementReporter.report("copy_failed_exception", error)
      toast.error(getUserFacingErrorMessage(error, "复制失败，请手动复制"))
    }
  }

  function handleDownloadShareXConfig() {
    const blob = new Blob([sharexConfig], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "shortly-sharex.sxcu"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Tabs defaultValue="keys" className="space-y-4">
      <TabsList className="mb-0">
        <TabsTrigger value="keys">Key</TabsTrigger>
        <TabsTrigger value="docs">示例</TabsTrigger>
        <TabsTrigger value="sharex">ShareX</TabsTrigger>
      </TabsList>

      <TabsContent value="keys" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" />
              新建 Key
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">完整 Key 只显示一次。</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="名称（可选）"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                maxLength={60}
              />
              <Button onClick={handleCreateKey} disabled={creating}>
                {creating ? "创建中..." : "创建"}
              </Button>
            </div>
            {latestPlainKey && (
              <div className="space-y-3 rounded-lg border px-4 py-3">
                <code className="block overflow-x-auto text-xs">{latestPlainKey}</code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(latestPlainKey, "API Key 已复制")}
                >
                  <Copy className="h-4 w-4" />
                  复制
                </Button>
              </div>
            )}
            {telegramBotHandle && (
              <div className="space-y-3 rounded-lg border border-dashed px-4 py-3">
                <p className="text-sm font-medium">Telegram 机器人绑定</p>
                <p className="text-xs text-muted-foreground">
                  打开 {telegramBotHandle}，发送以下命令绑定当前 API Key：
                </p>
                <code className="block overflow-x-auto rounded bg-muted px-2.5 py-2 text-xs">
                  {telegramBindCommand}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(telegramBindCommand, "TG 绑定命令已复制")}
                >
                  <Copy className="h-4 w-4" />
                  复制绑定命令
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">现有 Key</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">加载中...</div>
            ) : keys.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">暂无 API Key</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>前缀</TableHead>
                      <TableHead className="hidden md:table-cell">最后使用</TableHead>
                      <TableHead className="hidden lg:table-cell">创建时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {maskPrefix(item.keyPrefix)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {item.lastUsedAt ? formatDate(item.lastUsedAt) : "从未使用"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">
                          {formatDate(item.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteKey(item.id)}
                            disabled={deletingKeyId === item.id}
                          >
                            <Trash2 className="h-4 w-4" />
                            删除
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="docs">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">常用请求</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1">
              <p className="text-sm font-medium">短链：快速创建</p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{gettingStartedCommand}</pre>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">短链：进阶参数</p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{advancedShortenCommand}</pre>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">临时邮箱：创建邮箱地址</p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{createMailboxCommand}</pre>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">临时邮箱：查看某个邮箱的邮件列表</p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{listMailboxMessagesCommand}</pre>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">临时邮箱：标记邮件为已读</p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{markMessageReadCommand}</pre>
            </div>

            <div className="space-y-2 text-xs text-muted-foreground">
              <p>邮箱域名：{emailDomains.length > 0 ? emailDomains.join(", ") : "加载后显示"}</p>
              <p>短链域名：{shortDomains.length > 0 ? shortDomains.join(", ") : "加载后显示"}</p>
              <p>域名接口：{domainsEndpoint}</p>
              <p>邮箱接口：{emailsEndpoint}</p>
              <p>邮箱消息接口：{emailMessageEndpoint}/MESSAGE_ID</p>
              <p>标记已读接口：{emailMessageEndpoint}/MESSAGE_ID/read</p>
              {telegramBotHandle && <p>Telegram 机器人：{telegramBotHandle}</p>}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="sharex">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ShareX</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="粘贴 API Key"
              value={sharexApiKey}
              onChange={(e) => setSharexApiKey(e.target.value.trim())}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleDownloadShareXConfig}>
                <Download className="h-4 w-4" />
                下载
              </Button>
              <Button variant="outline" onClick={() => handleCopy(sharexConfig, "配置 JSON 已复制")}>
                <Copy className="h-4 w-4" />
                复制 JSON
              </Button>
            </div>
            <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
              {sharexConfig}
            </pre>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
