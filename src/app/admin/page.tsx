import { initDb } from "@/lib/db"
import { getAvatarUrl } from "@/lib/gravatar"
import { requireActiveAdmin } from "@/lib/require-user"
import { redirect } from "next/navigation"
import { AdminClient } from "./admin-client"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  await initDb()
  const session = await requireActiveAdmin()
  if (!session) redirect("/")
  if ((session.user as { role?: string }).role !== "admin") redirect("/dashboard")

  const user = {
    name: session.user.name,
    email: session.user.email,
    image: getAvatarUrl(session.user.email, session.user.image),
    role: "admin" as const,
  }

  return <AdminClient user={user} />
}
