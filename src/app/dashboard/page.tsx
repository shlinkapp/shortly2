import { auth } from "@/lib/auth"
import { initDb } from "@/lib/db"
import { getAvatarUrl } from "@/lib/gravatar"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { DashboardClient } from "./dashboard-client"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await initDb()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/")

  const user = {
    name: session.user.name,
    email: session.user.email,
    image: getAvatarUrl(session.user.email, session.user.image),
    role: (session.user as { role?: string }).role,
  }
  const { tab } = await searchParams

  return <DashboardClient user={user} initialTab={tab} />
}
