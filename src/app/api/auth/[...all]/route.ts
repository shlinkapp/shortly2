import { getAuth } from "@/lib/auth"
import { initDb } from "@/lib/db"
import { toNextJsHandler } from "better-auth/next-js"

export async function GET(req: Request) {
  await initDb()
  return toNextJsHandler(getAuth()).GET(req)
}

export async function POST(req: Request) {
  await initDb()
  return toNextJsHandler(getAuth()).POST(req)
}
