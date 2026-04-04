"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Github, Mail, KeyRound, Loader2, CheckCircle2 } from "lucide-react"

interface AuthFormProps {
  mode: "login" | "register"
  enableEmail: boolean
  enableGithub: boolean
  callbackUrl?: string
}

type Step = "email" | "otp" | "add-passkey"

export function AuthForm({ mode, enableEmail, enableGithub, callbackUrl = "/" }: AuthFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState<Step>("email")
  const [loading, setLoading] = useState(false)

  const supportsPasskey =
    typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined"

  function finish() {
    router.push(callbackUrl)
    router.refresh()
  }

  async function handleSendOtp() {
    if (!email) return
    setLoading(true)
    try {
      const res = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })
      if (res.error) {
        toast.error(res.error.message)
      } else {
        setStep("otp")
        toast.success("验证码已发送")
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (!otp) return
    setLoading(true)
    try {
      const res = await authClient.signIn.emailOtp({ email, otp })
      if (res.error) {
        toast.error(res.error.message)
      } else {
        if (mode === "register" && supportsPasskey) {
          setStep("add-passkey")
        } else {
          toast.success("登录成功")
          finish()
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGithub() {
    setLoading(true)
    try {
      await authClient.signIn.social({ provider: "github", callbackURL: callbackUrl })
    } finally {
      setLoading(false)
    }
  }

  async function handleSignInPasskey() {
    setLoading(true)
    try {
      const res = await authClient.signIn.passkey()
      if (res?.error) {
        const message = typeof res.error.message === "string" ? res.error.message : "Passkey 登录失败"
        toast.error(message)
      } else {
        toast.success("登录成功")
        finish()
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleAddPasskey() {
    setLoading(true)
    try {
      const res = await authClient.passkey.addPasskey()
      if (res?.error) {
        const message = typeof res.error.message === "string" ? res.error.message : "无法保存 Passkey"
        toast.error(message)
      } else {
        toast.success("Passkey 已保存 — 您现在可以使用它立即登录")
      }
    } finally {
      setLoading(false)
      finish()
    }
  }

  if (step === "add-passkey") {
    return (
      <div className="flex flex-col items-center gap-5 py-2 text-center">
        <div className="flex flex-col items-center gap-2">
          <CheckCircle2 className="h-10 w-10 text-primary" />
          <p className="font-semibold text-base">账户创建成功！</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            保存 Passkey，以便下次无需验证码即可立即登录。
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full">
          <Button onClick={handleAddPasskey} disabled={loading} className="w-full">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            保存 Passkey
          </Button>
          <Button variant="ghost" onClick={finish} disabled={loading} className="w-full">
            跳过
          </Button>
        </div>
      </div>
    )
  }

  const hasProviders = enableEmail || enableGithub

  return (
    <div className="flex flex-col gap-4">
      {enableEmail && (
        <>
          {step === "email" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="auth-email">邮箱</Label>
              <Input
                id="auth-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                disabled={loading}
                autoFocus
              />
              <Button onClick={handleSendOtp} disabled={loading || !email} className="w-full">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                {mode === "register" ? "继续使用邮箱" : "发送验证码"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="auth-otp">验证码</Label>
              <p className="text-sm text-muted-foreground">
                已发送至 <strong>{email}</strong>
              </p>
              <Input
                id="auth-otp"
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                disabled={loading}
                maxLength={6}
                autoFocus
                className="text-center text-xl tracking-widest"
              />
              <Button onClick={handleVerifyOtp} disabled={loading || otp.length < 6} className="w-full">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                验证验证码
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => { setStep("email"); setOtp("") }}
              >
                ← 更改邮箱
              </button>
            </div>
          )}
        </>
      )}

      {hasProviders && step === "email" && (
        <div className="relative my-1">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
            或
          </span>
        </div>
      )}

      {step === "email" && (
        <>
          {enableGithub && (
            <Button variant="outline" onClick={handleGithub} disabled={loading} className="w-full">
              <Github className="h-4 w-4" />
              使用 GitHub 登录
            </Button>
          )}

          {mode === "login" && (
            <Button variant="outline" onClick={handleSignInPasskey} disabled={loading} className="w-full">
              <KeyRound className="h-4 w-4" />
              使用 Passkey 登录
            </Button>
          )}
        </>
      )}
    </div>
  )
}
