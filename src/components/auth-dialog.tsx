"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AuthForm } from "@/components/auth-form"

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  enableEmail: boolean
  enableGithub: boolean
}

export function AuthDialog({ open, onOpenChange, enableEmail, enableGithub }: AuthDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-h-[min(92vh,40rem)] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="break-words">登录至 Shortly</DialogTitle>
        </DialogHeader>
        <AuthForm
          mode="login"
          enableEmail={enableEmail}
          enableGithub={enableGithub}
          callbackUrl="/"
        />
      </DialogContent>
    </Dialog>
  )
}
