"use client"

import { useState, useEffect, useCallback } from "react"
import { UserMenu } from "@/components/user-menu"
import { formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Copy, Trash2, BarChart2, ExternalLink, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { PasskeyManager } from "@/components/passkey-manager"

interface ShortLink {
  id: string
  slug: string
  originalUrl: string
  clicks: number
  createdAt: number
}

interface ClickLog {
  id: string
  referrer: string | null
  userAgent: string | null
  ipAddress: string | null
  createdAt: number
}

interface DashboardClientProps {
  user: {
    name: string
    email: string
    image?: string | null
    role?: string
  }
}

export function DashboardClient({ user }: DashboardClientProps) {
  const [links, setLinks] = useState<ShortLink[]>([])
  const [loading, setLoading] = useState(true)
  const [logsDialogOpen, setLogsDialogOpen] = useState(false)
  const [selectedLink, setSelectedLink] = useState<ShortLink | null>(null)
  const [logs, setLogs] = useState<ClickLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // Pagination state
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  const fetchLinks = useCallback(async (currentPage: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/links?page=${currentPage}&limit=10`)
      if (res.ok) {
        const body = await res.json()
        // Backward compatibility in case it returns an array directly during transition
        if (Array.isArray(body)) {
          setLinks(body)
        } else {
          setLinks(body.data || [])
          setTotalPages(body.totalPages || 1)
          setTotalItems(body.total || 0)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLinks(page)
  }, [fetchLinks, page])

  async function handleDelete(id: string) {
    const res = await fetch(`/api/links/${id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Link deleted")
      setLinks((prev) => prev.filter((l) => l.id !== id))
    } else {
      toast.error("Failed to delete link")
    }
  }

  async function handleViewLogs(link: ShortLink) {
    setSelectedLink(link)
    setLogsDialogOpen(true)
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/logs/${link.id}`)
      if (res.ok) {
        const body = await res.json()
        setLogs(Array.isArray(body) ? body : (body.data || []))
      }
    } finally {
      setLogsLoading(false)
    }
  }

  function handleCopy(slug: string) {
    navigator.clipboard.writeText(`${window.location.origin}/${slug}`)
    toast.success("Copied to clipboard")
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="font-semibold">我的短链</h1>
          </div>
          <UserMenu user={user} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <Tabs defaultValue="links">
          <TabsList className="mb-6">
            <TabsTrigger value="links">我的短链</TabsTrigger>
            <TabsTrigger value="security">安全设置</TabsTrigger>
          </TabsList>

          <TabsContent value="links">
            {loading ? (
              <div className="text-center text-muted-foreground py-16">Loading...</div>
            ) : links.length === 0 ? (
              <div className="text-center text-muted-foreground py-16">
                <p>暂无链接。</p>
                <Link href="/" className="text-foreground hover:underline text-sm mt-2 inline-block">
                  创建你的第一个短链
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">短链</TableHead>
                      <TableHead className="min-w-[160px]">目标</TableHead>
                      <TableHead className="w-20 text-center hidden sm:table-cell">点击</TableHead>
                      <TableHead className="w-28 hidden md:table-cell">创建时间</TableHead>
                      <TableHead className="w-24 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {links.map((link) => (
                      <TableRow key={link.id}>
                        <TableCell className="font-mono text-sm">
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground truncate max-w-[100px]">
                              /{link.slug}
                            </span>
                            <button
                              onClick={() => handleCopy(link.slug)}
                              className="text-muted-foreground hover:text-foreground shrink-0"
                              title="Copy"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 max-w-[200px] sm:max-w-xs">
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
                        <TableCell className="text-center hidden sm:table-cell">
                          <Badge variant="secondary">{link.clicks}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
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
                              onClick={() => handleDelete(link.id)}
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

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                <div>
                  共 {totalItems} 条短链，当前第 {page} / {totalPages} 页
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="security">
            <PasskeyManager />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              点击日志 —{" "}
              <span className="font-mono">/{selectedLink?.slug}</span>
            </DialogTitle>
          </DialogHeader>
          {logsLoading ? (
            <div className="py-8 text-center text-muted-foreground">加载中...</div>
          ) : logs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">暂无点击记录</div>
          ) : (
            <div className="max-h-80 overflow-y-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">时间</TableHead>
                    <TableHead>来源</TableHead>
                    <TableHead className="hidden sm:table-cell">浏览器</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate">
                        {log.referrer || <span className="text-muted-foreground">Direct</span>}
                      </TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate text-muted-foreground hidden sm:table-cell">
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
