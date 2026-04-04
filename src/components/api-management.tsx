"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
}

function maskPrefix(prefix: string): string {
  return `${prefix}****************`
}

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
        toast.error("加载 API Key 失败")
        return
      }
      const body = await res.json() as ApiKeysResponse
      setKeys(body.data || [])
    } catch {
      toast.error("加载 API Key 失败")
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
      const body = await res.json()
      if (!res.ok) {
        toast.error(body?.error || "创建 API Key 失败")
        return
      }

      const plainKey = body?.plainKey as string | undefined
      if (plainKey) {
        setLatestPlainKey(plainKey)
        setSharexApiKey(plainKey)
      }

      setKeyName("")
      toast.success("API Key 已创建")
      await fetchKeys()
    } catch {
      toast.error("创建 API Key 失败")
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteKey(id: string) {
    setDeletingKeyId(id)
    try {
      const res = await fetch(`/v1/keys/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.error || "删除 API Key 失败")
        return
      }

      setKeys((prev) => prev.filter((item) => item.id !== id))
      toast.success("API Key 已删除")
    } catch {
      toast.error("删除 API Key 失败")
    } finally {
      setDeletingKeyId(null)
    }
  }

  function handleCopy(text: string, message = "已复制") {
    navigator.clipboard.writeText(text)
    toast.success(message)
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
            <CardDescription>生成后仅展示一次完整 Key，请立即保存。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">请立即复制，之后无法再次查看完整 Key：</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto text-xs">{latestPlainKey}</code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(latestPlainKey, "API Key 已复制")}
                  >
                    <Copy className="h-4 w-4" />
                    复制
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">现有 API Key</CardTitle>
            <CardDescription>仅显示前缀用于识别，删除后立即失效。</CardDescription>
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
              <CardTitle className="text-base">OpenAPI：短链创建</CardTitle>
              <CardDescription>
                使用 `Authorization: Bearer YOUR_API_KEY` 调用接口。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">接口地址</p>
                <code className="block rounded-md bg-muted p-2 text-xs">
                  POST {apiBaseUrl || "https://your-domain.com"}/v1/shorten
                </code>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">请求示例</p>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`curl -X POST '${apiBaseUrl || "https://your-domain.com"}/v1/shorten' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -d '{
    "url": "https://example.com/long-page",
    "customSlug": "my-custom-slug",
    "maxClicks": 100,
    "expiresIn": "1m"
  }'`}
                </pre>
              </div>
              <p className="text-xs text-muted-foreground">
                `expiresIn` 可选值：`1h`, `1d`, `1w`, `1m`, `3m`, `6m`, `1y`。
              </p>
              <div className="space-y-1">
                <p className="text-sm font-medium">成功响应</p>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`{
  "shortUrl": "${apiBaseUrl || "https://your-domain.com"}/abcxyz",
  "slug": "abcxyz",
  "maxClicks": 100
}`}
                </pre>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">OpenAPI：临时邮箱</CardTitle>
              <CardDescription>
                同样使用 `Authorization: Bearer YOUR_API_KEY`，以下接口均位于 `/v1/emails`。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-1">
                <p className="text-sm font-medium">1. 创建邮箱</p>
                <code className="block rounded-md bg-muted p-2 text-xs">
                  POST {apiBaseUrl || "https://your-domain.com"}/v1/emails
                </code>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`curl -X POST '${apiBaseUrl || "https://your-domain.com"}/v1/emails' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -d '{
    "emailAddress": "demo@example.com"
  }'`}
                </pre>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">2. 获取邮箱列表</p>
                <code className="block rounded-md bg-muted p-2 text-xs">
                  GET {apiBaseUrl || "https://your-domain.com"}/v1/emails?page=1&limit=20
                </code>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`{
  "data": [
    {
      "id": "mailbox_id",
      "emailAddress": "demo@example.com",
      "domain": "example.com",
      "createdAt": 1712000000,
      "unreadCount": 2,
      "messageCount": 5
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}`}
                </pre>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">3. 获取某邮箱邮件</p>
                <code className="block rounded-md bg-muted p-2 text-xs">
                  GET {apiBaseUrl || "https://your-domain.com"}/v1/emails/MAILBOX_ID/messages?page=1&limit=20
                </code>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">4. 标记邮件已读</p>
                <code className="block rounded-md bg-muted p-2 text-xs">
                  POST {apiBaseUrl || "https://your-domain.com"}/v1/emails/messages/MESSAGE_ID/read
                </code>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">5. 删除邮件</p>
                <code className="block rounded-md bg-muted p-2 text-xs">
                  DELETE {apiBaseUrl || "https://your-domain.com"}/v1/emails/messages/MESSAGE_ID
                </code>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">域名查询</p>
                <code className="block rounded-md bg-muted p-2 text-xs">
                  GET {apiBaseUrl || "https://your-domain.com"}/v1/domains
                </code>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`{
  "emailDomains": [
    {
      "host": "mail.example.com",
      "isDefault": true
    }
  ],
  "shortDomains": [
    {
      "host": "s.example.com",
      "isDefault": true
    }
  ]
}`}
                </pre>
                <p className="text-xs text-muted-foreground">
                  当前可用临时邮箱域名：{emailDomains.length > 0 ? emailDomains.join(", ") : "加载后显示"}
                </p>
                <p className="text-xs text-muted-foreground">
                  当前可用短链域名：{shortDomains.length > 0 ? shortDomains.join(", ") : "加载后显示"}
                </p>
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
              粘贴 API Key 后下载配置文件，导入 ShareX 即可上传后自动返回短链。
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
