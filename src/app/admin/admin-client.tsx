"use client"

import { useState, useEffect, useCallback } from "react"
import { UserMenu } from "@/components/user-menu"
import { APP_URL, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { Trash2, ExternalLink, ArrowLeft, Save, Shield } from "lucide-react"
import Link from "next/link"

interface AdminLink {
  id: string
  slug: string
  originalUrl: string
  clicks: number
  createdAt: number
  userName: string | null
  userEmail: string | null
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

interface AdminClientProps {
  user: {
    name: string
    email: string
    image?: string | null
    role: string
  }
}

export function AdminClient({ user }: AdminClientProps) {
  const [links, setLinks] = useState<AdminLink[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [settings, setSettings] = useState<SiteSettings>({
    siteName: "Shortly",
    siteUrl: APP_URL,
    allowAnonymous: true,
    anonMaxLinksPerHour: 3,
    anonMaxClicks: 10,
    userMaxLinksPerHour: 50,
  })
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [linksRes, usersRes, settingsRes] = await Promise.all([
        fetch("/api/admin/links"),
        fetch("/api/admin/users"),
        fetch("/api/admin/settings"),
      ])
      if (linksRes.ok) setLinks(await linksRes.json())
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
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleDeleteLink(id: string) {
    const res = await fetch(`/api/admin/links/${id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Link deleted")
      setLinks((prev) => prev.filter((l) => l.id !== id))
    } else {
      toast.error("Failed to delete link")
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
                      <TableHead className="w-28 hidden md:table-cell">创建时间</TableHead>
                      <TableHead className="w-12 text-right">删除</TableHead>
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
                        <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                          {formatDate(link.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLink(link.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

          <TabsContent value="settings">
            <Card className="max-w-lg">
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
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
