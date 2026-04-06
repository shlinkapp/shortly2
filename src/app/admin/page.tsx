import { auth } from "@/lib/auth"
import { initDb } from "@/lib/db"
import { getAvatarUrl } from "@/lib/gravatar"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { AdminClient } from "./admin-client"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  await initDb()
  const session = await auth.api.getSession({ headers: await headers() })
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
