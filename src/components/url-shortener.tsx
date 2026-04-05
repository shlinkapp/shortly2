"use client"

import { ShortLinkCreator } from "@/components/short-link-creator"

interface UrlShortenerProps {
  user: {
    name: string
    email: string
    image?: string | null
    role?: string
  } | null
  siteName?: string
}

export function UrlShortener({ user, siteName }: UrlShortenerProps) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <ShortLinkCreator user={user} mode="homepage" siteName={siteName} />
    </div>
  )
}
