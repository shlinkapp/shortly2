import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { emailOTP } from "better-auth/plugins/email-otp"
import { passkey } from "@better-auth/passkey"
import { Resend } from "resend"
import { db } from "./db"
import * as schema from "./schema"
import { eq, sql } from "drizzle-orm"

const resendApiKey = process.env.RESEND_API_KEY
const resendFrom = process.env.RESEND_FROM_EMAIL || "noreply@example.com"
const githubClientId = process.env.GITHUB_CLIENT_ID
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET

const plugins: Parameters<typeof betterAuth>[0]["plugins"] = [
  passkey({
    rpName: "Shortly",
  }),
]

if (resendApiKey) {
  const resend = new Resend(resendApiKey)
  plugins.push(
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        await resend.emails.send({
          from: resendFrom,
          to: email,
          subject: "Your Shortly login code",
          html: `<p>Your verification code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
        })
      },
      otpLength: 6,
      expiresIn: 600,
    })
  )
}

const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {}

if (githubClientId && githubClientSecret) {
  socialProviders.github = {
    clientId: githubClientId,
    clientSecret: githubClientSecret,
  }
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET!,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      passkey: schema.passkey,
    },
  }),
  emailAndPassword: {
    enabled: false,
  },
  socialProviders,
  plugins,
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Atomic update to avoid race conditions when multiple users sign up simultaneously
          await db.run(sql`
            UPDATE user SET role = 'admin'
            WHERE id = ${user.id} AND id = (
              SELECT id FROM user ORDER BY created_at ASC LIMIT 1
            )
          `)
        },
      },
    },
  },
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
