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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Copy, Download, ExternalLink, KeyRound, Trash2 } from "lucide-react"

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
    <Tabs defaultValue="keys">
      <TabsList className="mb-4">
        <TabsTrigger value="keys">API Key 管理</TabsTrigger>
        <TabsTrigger value="docs">API 使用说明</TabsTrigger>
        <TabsTrigger value="sharex">ShareX 配置</TabsTrigger>
      </TabsList>

      <TabsContent value="keys" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" />
              新增 API Key
            </CardTitle>
            <CardDescription>用于脚本、自动化工具或第三方客户端调用 Shortly API。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-medium">完整 API Key 只会显示一次</p>
              <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">
                创建成功后请立即复制到密码管理器、CI Secret 或本地安全配置中。关闭此提示后，系统不会再次展示完整 Key。
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Key 名称（可选）"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                maxLength={60}
              />
              <Button onClick={handleCreateKey} disabled={creating}>
                {creating ? "创建中..." : "创建 Key"}
              </Button>
            </div>
            {latestPlainKey && (
              <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                <div>
                  <p className="text-sm font-medium text-emerald-950 dark:text-emerald-100">请立即复制并保存这个 Key</p>
                  <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-100/80">
                    推荐的下一步：先复制 Key，再去“API 使用说明”跑通最常见的创建短链请求；如果要接入截图工作流，再到“ShareX 配置”直接下载配置文件。
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <code className="flex-1 overflow-x-auto rounded-md border bg-background px-3 py-2 text-xs">{latestPlainKey}</code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(latestPlainKey, "API Key 已复制")}
                  >
                    <Copy className="h-4 w-4" />
                    复制 Key
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">现有 API Key</CardTitle>
            <CardDescription>这里只显示 Key 前缀供你识别；删除后会立即失效。</CardDescription>
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
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">快速开始</CardTitle>
              <CardDescription>
                建议按“创建 Key → 发送一次最常见请求 → 再接入 ShareX 或临时邮箱”的顺序上手。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-sm font-medium">1. 创建 API Key</p>
                  <p className="mt-1 text-xs text-muted-foreground">创建后立即复制保存，完整 Key 不会再次展示。</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-sm font-medium">2. 先跑通创建短链</p>
                  <p className="mt-1 text-xs text-muted-foreground">先用最小请求确认鉴权和返回格式都正常。</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-sm font-medium">3. 再接入工具</p>
                  <p className="mt-1 text-xs text-muted-foreground">需要截图工作流时再导入 ShareX；需要邮箱能力时再看邮件接口。</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">最常见调用：创建短链</p>
                <code className="block rounded-md bg-muted p-2 text-xs">
                  POST {shortenEndpoint}
                </code>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{gettingStartedCommand}</pre>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">成功响应示例</p>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`{
  "shortUrl": "${apiBaseUrl || "https://your-domain.com"}/abcxyz",
  "slug": "abcxyz"
}`}
                </pre>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">进阶参数</CardTitle>
              <CardDescription>
                需要自定义 slug、点击限制或有效期时，再在创建短链请求里追加这些字段。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{advancedShortenCommand}</pre>
              <p className="text-xs text-muted-foreground">
                `expiresIn` 可选值：`1h`, `1d`, `1w`, `1m`, `3m`, `6m`, `1y`。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">ShareX 导入</CardTitle>
              <CardDescription>
                如果你希望截图上传后自动返回短链，直接切到“ShareX 配置”标签即可下载 `.sxcu` 文件。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => handleCopy(sharexConfig, "配置 JSON 已复制")}>
                <Copy className="h-4 w-4" />
                先复制 ShareX 配置 JSON
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">临时邮箱 API</CardTitle>
              <CardDescription>
                临时邮箱接口同样使用 `Authorization: Bearer YOUR_API_KEY`，按需接入即可。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1">
                <p className="text-sm font-medium">创建邮箱</p>
                <code className="block rounded-md bg-muted p-2 text-xs">POST {emailsEndpoint}</code>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`curl -X POST '${emailsEndpoint}' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -d '{
    "emailAddress": "demo@example.com"
  }'`}
                </pre>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">常用接口</p>
                <code className="block rounded-md bg-muted p-2 text-xs">GET {emailsEndpoint}?page=1&limit=20</code>
                <code className="mt-2 block rounded-md bg-muted p-2 text-xs">GET {emailsEndpoint}/MAILBOX_ID/messages?page=1&limit=20</code>
                <code className="mt-2 block rounded-md bg-muted p-2 text-xs">POST {apiBaseUrl || "https://your-domain.com"}/v1/emails/messages/MESSAGE_ID/read</code>
                <code className="mt-2 block rounded-md bg-muted p-2 text-xs">DELETE {apiBaseUrl || "https://your-domain.com"}/v1/emails/messages/MESSAGE_ID</code>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">域名查询</p>
                <code className="block rounded-md bg-muted p-2 text-xs">GET {domainsEndpoint}</code>
                <p className="text-xs text-muted-foreground">
                  当前可用临时邮箱域名：{emailDomains.length > 0 ? emailDomains.join(", ") : "加载后显示"}
                </p>
                <p className="text-xs text-muted-foreground">
                  当前可用短链域名：{shortDomains.length > 0 ? shortDomains.join(", ") : "加载后显示"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">完整接口说明</CardTitle>
              <CardDescription>
                如需查看全部端点与参数，可继续参考 `/v1/shorten`、`/v1/emails`、`/v1/domains` 的返回结构。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                当前最常用入口：<code className="mx-1 text-xs">POST {shortenEndpoint}</code>
                <ExternalLink className="ml-1 inline h-4 w-4 align-text-bottom" />
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="sharex">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ShareX 配置文件（.sxcu）</CardTitle>
            <CardDescription>
              粘贴 API Key 后下载配置文件，导入 ShareX 后即可在上传完成时自动返回短链。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="在这里粘贴 API Key（sk_shortly_...）"
              value={sharexApiKey}
              onChange={(e) => setSharexApiKey(e.target.value.trim())}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleDownloadShareXConfig}>
                <Download className="h-4 w-4" />
                下载 shortly-sharex.sxcu
              </Button>
              <Button variant="outline" onClick={() => handleCopy(sharexConfig, "配置 JSON 已复制")}>
                <Copy className="h-4 w-4" />
                复制配置 JSON
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
