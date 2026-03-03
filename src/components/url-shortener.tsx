"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Scissors, Copy, ExternalLink, LogIn, X } from "lucide-react"
import Link from "next/link"

interface UrlShortenerProps {
  user: {
    name: string
    email: string
    image?: string | null
    role?: string
  } | null
}

export function UrlShortener({ user }: UrlShortenerProps) {
  const [url, setUrl] = useState("")
  const [customSlug, setCustomSlug] = useState("")
  const [maxClicks, setMaxClicks] = useState<string>("")
  const [expiresAt, setExpiresAt] = useState<string>("")
  const [showOptions, setShowOptions] = useState(false)
  const [result, setResult] = useState<{ shortUrl: string; slug: string; maxClicks?: number } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleUrlChange(value: string) {
    setUrl(value)
    setShowOptions(!!value.trim())
    if (!value.trim()) setResult(null)
  }

  function handleShorten() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/shorten", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: url.trim(),
            customSlug: customSlug.trim() || undefined,
            maxClicks: maxClicks ? parseInt(maxClicks) : undefined,
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || "Failed to shorten URL")
          return
        }
        setResult(data)
        toast.success("URL shortened!")
      } catch {
        toast.error("Something went wrong")
      }
    })
  }

  function handleCopy() {
    if (!result) return
    navigator.clipboard.writeText(result.shortUrl)
    toast.success("Copied to clipboard")
  }

  function handleReset() {
    setUrl("")
    setCustomSlug("")
    setMaxClicks("")
    setExpiresAt("")
    setShowOptions(false)
    setResult(null)
  }

  return (
    <div className="w-full max-w-md flex flex-col gap-3">
      <Input
        type="url"
        placeholder="请在此处粘贴长链接以开始缩短......"
        value={url}
        onChange={(e) => handleUrlChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && showOptions) handleShorten()
        }}
        className="h-12 text-base"
        autoFocus
      />

      {showOptions && (
        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {user && (
            <Input
              placeholder="自定义后缀（可选）"
              value={customSlug}
              onChange={(e) => setCustomSlug(e.target.value)}
              className="h-10"
              maxLength={50}
            />
          )}

          {user && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Input
                  type="number"
                  placeholder="最大可点击次数（可选）"
                  value={maxClicks}
                  onChange={(e) => setMaxClicks(e.target.value)}
                  className="h-10"
                  min="1"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Input
                  type="datetime-local"
                  placeholder="过期时间（可选）"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="h-10 text-muted-foreground"
                />
              </div>
            </div>
          )}

          {!result && (
            <div className="flex gap-2">
              <Button
                onClick={handleShorten}
                disabled={isPending || !url.trim()}
                className="h-10 flex-1"
              >
                <Scissors className="h-4 w-4" />
                {isPending ? "正在缩短..." : "缩短"}
              </Button>
              {!user && (
                <Button variant="outline" asChild className="h-10 shrink-0">
                  <Link href="/login">
                    <LogIn className="h-4 w-4" />
                    登录
                  </Link>
                </Button>
              )}
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2.5">
                <a
                  href={result.shortUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-sm font-medium text-primary hover:underline truncate"
                >
                  {result.shortUrl}
                </a>
                <button
                  onClick={handleCopy}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  title="Copy"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <a
                  href={result.shortUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  title="Open link"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  onClick={handleReset}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {!user && result.maxClicks && (
                <p className="text-xs text-destructive text-center font-medium">
                  匿名用户生成的链接在 {result.maxClicks} 次访问后失效，登录后以解除限制
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {!user && !showOptions && (
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-foreground font-medium hover:underline">
            登录 Shortly
          </Link>{" "}
          以配置自定义后缀并解除相关限制
        </p>
      )}
    </div>
  )
}
