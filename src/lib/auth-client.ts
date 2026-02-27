import { createAuthClient } from "better-auth/react"
import { emailOTPClient } from "better-auth/client/plugins"
import { passkeyClient } from "@better-auth/passkey/client"
import { APP_URL } from "./utils"

export const authClient = createAuthClient({
  baseURL: APP_URL,
  plugins: [emailOTPClient(), passkeyClient()],
})

export const {
  signIn,
  signOut,
  useSession,
  signUp,
} = authClient
