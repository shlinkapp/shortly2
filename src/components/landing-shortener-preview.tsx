"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowRight, Check, Copy, Link2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const SAMPLE_URL =
  "https://example.com/products/2026-summer-collection?utm_source=newsletter&utm_campaign=launch"

// Deterministic, client-only illustration: same input maps to the same code,
// so the preview feels like a real short slug without touching the backend.
function toPreviewSlug(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
  let n = hash >>> 0
  let slug = ""
  for (let i = 0; i < 6; i++) {
    slug = alphabet[n % alphabet.length] + slug
    n = Math.floor(n / alphabet.length)
  }
  return slug
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_#0072f5]"

export function LandingShortenerPreview({
  previewHost,
  registerHref = "/register",
}: {
  previewHost: string
  registerHref?: string
}) {
  const [value, setValue] = useState(SAMPLE_URL)
  const [slug, setSlug] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const shortUrl = slug ? `${previewHost}/${slug}` : ""

  function handleShorten() {
    const trimmed = value.trim()
    if (!trimmed) return
    setSlug(toPreviewSlug(trimmed))
    setCopied(false)
  }

  async function handleCopy() {
    if (!shortUrl) return
    try {
      await navigator.clipboard.writeText(shortUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
      toast.success("已复制示例链接 · 注册后可创建可用的真实短链接")
    } catch {
      toast.error("复制失败，请手动选择链接文本")
    }
  }

  return (
    <div className="rounded-[8px] bg-[#ffffff] p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_24px_64px_rgba(0,0,0,0.06)] sm:p-5">
      <div className="flex items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-[#f2f2f2] text-[#171717]">
            <Link2 className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-[#171717]">效果预览</p>
            <p className="mt-0.5 text-xs text-[#8f8f8f]">登录后生效</p>
          </div>
        </div>
        <span className="rounded-full bg-[#f2f2f2] px-2.5 py-1 text-[11px] font-medium tracking-wide text-[#4d4d4d]">
          示例
        </span>
      </div>
      <label htmlFor="preview-url" className="block text-xs font-medium text-[#4d4d4d]">
        长链接
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input
          id="preview-url"
          type="text"
          inputMode="url"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (slug) setSlug(null)
          }}
          onKeyDown={(e) => e.key === "Enter" && handleShorten()}
          placeholder="https://example.com/very/long/path"
          aria-label="要缩短的长链接（示例）"
          className={`h-10 flex-1 rounded-md border-transparent bg-[#fafafa] px-3 text-sm text-[#171717] shadow-[0_0_0_1px_rgba(0,0,0,0.08)] transition-shadow placeholder:text-[#8f8f8f] focus-visible:border-transparent ${focusRing}`}
        />
        <Button
          type="button"
          onClick={handleShorten}
          disabled={!value.trim()}
          className={`h-10 shrink-0 rounded-md bg-[#171717] px-4 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-60 ${focusRing}`}
        >
          缩短
        </Button>
      </div>

      <div
        aria-live="polite"
        className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${
          slug ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <p className="text-xs font-medium text-[#4d4d4d]">短链接</p>
          <div className="mt-2 flex items-center gap-2 rounded-md bg-[#fafafa] px-3 py-2.5 shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-[#171717]">
              {shortUrl}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleCopy}
              aria-label="复制示例短链接"
              title="复制示例短链接"
              className={`size-7 shrink-0 rounded-md text-[#4d4d4d] hover:bg-[#ebebeb] hover:text-[#171717] ${focusRing}`}
            >
              {copied ? (
                <Check className="size-3.5 text-[#0072f5]" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-[#ebebeb] pt-4">
        <Button
          asChild
          className={`h-10 w-full rounded-md bg-[#171717] text-sm font-medium text-white transition-colors hover:bg-[#333333] ${focusRing}`}
        >
          <Link href={registerHref}>
            注册以创建真实短链接
            <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Link
          href={registerHref}
          className={`mt-3 flex items-center gap-2 rounded-md py-1 text-xs text-[#8f8f8f] transition-colors hover:text-[#0072f5] ${focusRing}`}
        >
          <Mail className="size-3.5 shrink-0" />
          <span className="min-w-0">也可以创建临时邮箱，用于接收验证码与测试收件</span>
          <ArrowRight className="ml-auto size-3.5 shrink-0" />
        </Link>
      </div>
    </div>
  )
}
