import { initDb } from "@/lib/db"
import { getAvatarUrl } from "@/lib/gravatar"
import { requireActiveUser } from "@/lib/require-user"
import { redirect } from "next/navigation"
import { DashboardClient } from "./dashboard-client"

export const dynamic = "force-dynamic"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await initDb()
  const session = await requireActiveUser()
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
