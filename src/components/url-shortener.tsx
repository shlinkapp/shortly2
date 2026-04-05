"use client"

import { ShortLinkCreator } from "@/components/short-link-creator"

interface UrlShortenerProps {
  user: {
    name: string
    email: string
    image?: string | null
    role?: string
  } | null
}

export function UrlShortener({ user }: UrlShortenerProps) {
  return (
    <section className="space-y-6">
      <div className="mx-auto max-w-3xl w-full md:w-xl space-y-4">
        <ShortLinkCreator user={user} mode="homepage" />
      </div>
    </section>
  )
}
