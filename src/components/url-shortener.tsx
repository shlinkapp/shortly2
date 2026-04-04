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
  return <ShortLinkCreator user={user} />
}
